import { TaskSelectorWithCreateModal } from "../../../src/modals/TaskSelectorWithCreateModal";
import { MockObsidian } from "../../helpers/obsidian-runtime";
import type { App } from "obsidian";

jest.mock("../../../src/modals/taskCreationSuggest", () => ({
	NLPSuggest: jest.fn().mockImplementation(() => ({ close: jest.fn() })),
}));

describe("TaskSelectorWithCreateModal quick-create capture to inbox", () => {
	function createModal(triage: Record<string, unknown>) {
		MockObsidian.reset();
		const mockApp = MockObsidian.createMockApp() as unknown as App;
		const mockPlugin = {
			app: mockApp,
			settings: {
				customStatuses: [],
				customPriorities: [],
				defaultTaskStatus: "open",
				defaultTaskPriority: "normal",
				nlpDefaultToScheduled: true,
				nlpLanguage: "en",
				nlpTriggers: { enabled: true, triggers: [] },
				userFields: [],
				calendarViewSettings: { locale: "en" },
				triage,
			},
			i18n: { translate: jest.fn((key: string) => key) },
			statusManager: {
				getStatusConfig: jest.fn((value: string) =>
					["open", "inbox"].includes(value) ? { value } : undefined
				),
			},
		};
		return new TaskSelectorWithCreateModal(mockApp, mockPlugin as never, [], {
			onResult: jest.fn(),
		});
	}

	it("leaves the status to the capture rule when the inbox is on", () => {
		const modal = createModal({ inboxStatus: "inbox", somedayStatus: "", captureToInbox: true });
		const data = (modal as any).buildTaskDataFromParsed({ title: "Buy milk" });
		expect(data.status).toBeUndefined();
	});

	it("keeps the default status when the inbox is off", () => {
		const modal = createModal({ inboxStatus: "", somedayStatus: "", captureToInbox: true });
		const data = (modal as any).buildTaskDataFromParsed({ title: "Buy milk" });
		expect(data.status).toBe("open");
	});
});
