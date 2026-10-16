import { InstantTaskConvertService } from "../../../src/services/InstantTaskConvertService";
import { PluginFactory } from "../../helpers/mock-factories";

jest.mock("../../../src/utils/dateUtils", () => ({
	getCurrentTimestamp: jest.fn(() => "2026-10-15T12:00:00Z"),
	getCurrentDateString: jest.fn(() => "2026-10-15"),
	combineDateAndTime: jest.fn((date, time) => `${date}T${time}`),
	parseDateToUTC: jest.fn((date) => date),
	formatDateForStorage: jest.fn((date) => date),
}));

jest.mock("../../../src/utils/helpers", () => ({
	ensureFolderExists: jest.fn().mockResolvedValue(undefined),
	calculateDefaultDateTime: jest.fn(() => "2026-10-15"),
}));

const INBOX_ON = { inboxStatus: "inbox", somedayStatus: "", captureToInbox: true };
const INBOX_OFF = { inboxStatus: "", somedayStatus: "", captureToInbox: true };

describe("InstantTaskConvertService capture to inbox", () => {
	let mockPlugin: any;
	let service: InstantTaskConvertService;

	function setup(settings: Record<string, unknown>) {
		mockPlugin = PluginFactory.createMockPlugin({
			settings: {
				defaultTaskStatus: "open",
				defaultTaskPriority: "normal",
				taskCreationDefaults: {
					defaultDueDate: "none",
					defaultScheduledDate: "none",
					defaultContexts: "",
					defaultTags: "",
					defaultProjects: "",
					defaultTimeEstimate: 0,
					defaultRecurrence: "none",
					defaultReminders: [],
				},
				...settings,
			},
		});
		mockPlugin.app.workspace.getActiveFile = jest.fn().mockReturnValue(null);
		mockPlugin.statusManager.getAllStatuses = jest.fn(() => [
			{ value: "open" },
			{ value: "in-progress" },
			{ value: "inbox" },
		]);
		mockPlugin.taskService = {
			createTask: jest.fn().mockResolvedValue({ file: { path: "tasks/t.md" } }),
		};
		service = new InstantTaskConvertService(
			mockPlugin,
			mockPlugin.statusManager,
			mockPlugin.priorityManager
		);
	}

	async function convert(parsed: Record<string, unknown>): Promise<string> {
		await (service as any).createTaskFile({ isCompleted: false, ...parsed }, "");
		return mockPlugin.taskService.createTask.mock.calls[0][0].status;
	}

	describe.each([
		["with defaults", true, "open"],
		["without defaults", false, "none"],
	])("%s", (_label, useDefaults, fallback) => {
		it("sends a dateless task without a parsed status to the inbox", async () => {
			setup({ useDefaultsOnInstantConvert: useDefaults, triage: INBOX_ON });
			expect(await convert({ title: "Call dentist" })).toBe("inbox");
		});

		it("keeps a parsed status", async () => {
			setup({ useDefaultsOnInstantConvert: useDefaults, triage: INBOX_ON });
			expect(await convert({ title: "Call dentist", status: "in-progress" })).toBe(
				"in-progress"
			);
		});

		it("uses the usual fallback for a dated task", async () => {
			setup({ useDefaultsOnInstantConvert: useDefaults, triage: INBOX_ON });
			expect(await convert({ title: "Call dentist", dueDate: "2026-10-20" })).toBe(
				fallback
			);
		});

		it("is unchanged when the inbox is off", async () => {
			setup({ useDefaultsOnInstantConvert: useDefaults, triage: INBOX_OFF });
			expect(await convert({ title: "Call dentist" })).toBe(fallback);
		});
	});

	it("treats a creation-default scheduled date as a real date", async () => {
		setup({ useDefaultsOnInstantConvert: true, triage: INBOX_ON });
		mockPlugin.settings.taskCreationDefaults.defaultScheduledDate = "today";
		expect(await convert({ title: "Call dentist" })).toBe("open");
	});
});
