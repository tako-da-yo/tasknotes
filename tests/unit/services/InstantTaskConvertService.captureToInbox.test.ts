import { InstantTaskConvertService } from "../../../src/services/InstantTaskConvertService";
import { TaskCreationService } from "../../../src/services/task-service/TaskCreationService";
import { applyTaskCreationDefaults } from "../../../src/services/task-service/taskCreationDefaults";
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
	calculateDefaultDate: jest.fn(() => "2026-10-15"),
	calculateDefaultDateTime: jest.fn(() => "2026-10-15"),
}));

jest.mock("../../../src/utils/filenameGenerator", () => ({
	generateTaskFilename: jest.fn(() => "call-dentist"),
	generateUniqueFilename: jest.fn(() => "call-dentist"),
}));

jest.mock("../../../src/utils/templateProcessor", () => ({
	mergeTemplateFrontmatter: jest.fn((base, template) => ({ ...base, ...template })),
}));

const INBOX_ON = { inboxStatus: "inbox", somedayStatus: "", captureToInbox: true };
const INBOX_OFF = { inboxStatus: "", somedayStatus: "", captureToInbox: true };

describe("InstantTaskConvertService capture to inbox", () => {
	let mockPlugin: any;
	let service: InstantTaskConvertService;
	let createdStatus: string | undefined;

	function setup(
		settings: Record<string, unknown>,
		defaultScheduledDate = "none",
		deletedStatus?: string
	) {
		mockPlugin = PluginFactory.createMockPlugin({
			settings: {
				defaultTaskStatus: "open",
				defaultTaskPriority: "normal",
				taskCreationDefaults: {
					defaultDueDate: "none",
					defaultScheduledDate,
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
		mockPlugin.statusManager.getStatusConfig = jest.fn((value: string) =>
			["open", "in-progress", "inbox"].includes(value) && value !== deletedStatus
				? { value }
				: undefined
		);
		// Real creation service, so creation defaults are applied before the status is resolved
		const creation = new TaskCreationService({
			runtime: mockPlugin,
			applyTaskCreationDefaults: async (taskData) =>
				applyTaskCreationDefaults(taskData, mockPlugin.settings),
			applyTemplate: jest.fn(async () => ({ frontmatter: {}, body: "" })),
			processFolderTemplate: jest.fn((folderTemplate) => folderTemplate),
			sanitizeTitleForFilename: jest.fn((input) => input),
			sanitizeTitleForStorage: jest.fn((input) => input),
		});
		mockPlugin.taskService = {
			createTask: jest.fn(async (taskData) => {
				const result = await creation.createTask(taskData);
				createdStatus = result.taskInfo.status;
				return result;
			}),
		};
		service = new InstantTaskConvertService(
			mockPlugin,
			mockPlugin.statusManager,
			mockPlugin.priorityManager
		);
	}

	async function convert(parsed: Record<string, unknown>): Promise<string | undefined> {
		createdStatus = undefined;
		await (service as any).createTaskFile({ isCompleted: false, ...parsed }, "");
		return createdStatus;
	}

	describe.each([
		["with defaults", true, "open"],
		["without defaults", false, "none"],
	])("%s", (_label, useDefaults, offFallback) => {
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

		it("gives a dated task the default status when the inbox is on", async () => {
			setup({ useDefaultsOnInstantConvert: useDefaults, triage: INBOX_ON });
			expect(await convert({ title: "Call dentist", dueDate: "2026-10-20" })).toBe("open");
		});

		it("treats a Default scheduled date as a real date", async () => {
			setup({ useDefaultsOnInstantConvert: useDefaults, triage: INBOX_ON }, "today");
			expect(await convert({ title: "Call dentist" })).toBe("open");
		});

		it("keeps today's fallback when the configured inbox status was deleted", async () => {
			setup({ useDefaultsOnInstantConvert: useDefaults, triage: INBOX_ON }, "none", "inbox");
			expect(await convert({ title: "Call dentist" })).toBe(offFallback);
		});

		it("keeps today's fallback when the inbox is off", async () => {
			setup({ useDefaultsOnInstantConvert: useDefaults, triage: INBOX_OFF });
			expect(await convert({ title: "Call dentist" })).toBe(offFallback);
			expect(await convert({ title: "Call dentist", dueDate: "2026-10-20" })).toBe(
				offFallback
			);
		});
	});
});
