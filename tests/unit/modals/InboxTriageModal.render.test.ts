import { InboxTriageModal } from "../../../src/modals/InboxTriageModal";
import { MockObsidian } from "../../helpers/obsidian-runtime";
import { TaskFactory } from "../../helpers/mock-factories";
import type { App } from "obsidian";
import type { TaskInfo } from "../../../src/types";

function createModal(tasks: TaskInfo[]) {
	MockObsidian.reset();
	const app = MockObsidian.createMockApp() as unknown as App;
	const plugin = {
		app,
		settings: { triage: { inboxStatus: "inbox", somedayStatus: "someday", captureToInbox: true } },
		i18n: {
			translate: jest.fn((key: string, params?: Record<string, string | number>) =>
				params ? `${key} ${JSON.stringify(params)}` : key
			),
			getCurrentLocale: jest.fn(() => "en"),
		},
		triageService: {
			getInboxTasks: jest.fn(() => tasks),
			isSomedayReady: jest.fn(() => true),
			applyAction: jest.fn(async () => null),
			revertAction: jest.fn(async () => undefined),
		},
	};
	return new InboxTriageModal(app, plugin as never);
}

describe("InboxTriageModal progress announcement", () => {
	it("keeps one aria-live region across renders and updates its text", async () => {
		const tasks = [
			TaskFactory.createTask({ path: "a.md", title: "A", status: "inbox" }),
			TaskFactory.createTask({ path: "b.md", title: "B", status: "inbox" }),
		];
		const modal = createModal(tasks);
		modal.onOpen();
		const regions = () => modal.modalEl.querySelectorAll('[aria-live="polite"]');
		expect(regions()).toHaveLength(1);
		const first = regions()[0];
		expect(first.textContent).toContain('"current":1');

		await (modal as any).handle("skip");

		expect(regions()).toHaveLength(1);
		expect(regions()[0]).toBe(first);
		expect(first.textContent).toContain('"current":2');
	});

	it("announces the finished summary in the same region", async () => {
		const modal = createModal([TaskFactory.createTask({ path: "a.md", title: "A", status: "inbox" })]);
		modal.onOpen();
		const region = modal.modalEl.querySelector('[aria-live="polite"]');
		await (modal as any).handle("skip");
		expect(modal.modalEl.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
		expect(region?.textContent).toContain("modals.inboxTriage.finished");
	});
});

describe("InboxTriageModal overbook check", () => {
	it("never rejects when the updated task cannot be read", async () => {
		const task = TaskFactory.createTask({ path: "a.md", title: "A", status: "inbox" });
		const modal = createModal([task]);
		const plugin = (modal as any).plugin;
		plugin.cacheManager = { getTaskInfo: jest.fn(async () => Promise.reject(new Error("boom"))) };
		plugin.overbookNotifier = { check: jest.fn() };
		await expect((modal as any).checkOverbook(task, {})).resolves.toBeUndefined();
		expect(plugin.overbookNotifier.check).not.toHaveBeenCalled();
	});
});
