import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { PluginFactory } from "../../helpers/mock-factories";
import { TaskCreationService } from "../../../src/services/task-service/TaskCreationService";

jest.mock("../../../src/utils/dateUtils", () => ({
	getCurrentTimestamp: jest.fn(() => "2026-10-15T00:00:00+00:00"),
	getCurrentDateString: jest.fn(() => "2026-10-15"),
}));

jest.mock("../../../src/utils/filenameGenerator", () => ({
	generateTaskFilename: jest.fn(() => "call-dentist"),
	generateUniqueFilename: jest.fn(() => "call-dentist"),
}));

jest.mock("../../../src/utils/helpers", () => ({
	ensureFolderExists: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../../../src/utils/templateProcessor", () => ({
	mergeTemplateFrontmatter: jest.fn((base, template) => ({ ...base, ...template })),
}));

describe("task creation capture to inbox", () => {
	let runtime: ReturnType<typeof PluginFactory.createMockPlugin>;
	let service: TaskCreationService;

	beforeEach(() => {
		runtime = PluginFactory.createMockPlugin();
		service = new TaskCreationService({
			runtime,
			applyTaskCreationDefaults: jest.fn(async (taskData) => taskData),
			applyTemplate: jest.fn(async () => ({ frontmatter: {}, body: "" })),
			processFolderTemplate: jest.fn((folderTemplate) => folderTemplate),
			sanitizeTitleForFilename: jest.fn((input) => input),
			sanitizeTitleForStorage: jest.fn((input) => input),
		});
	});

	it("creates dateless tasks without a status in the inbox", async () => {
		runtime.settings.triage = { inboxStatus: "inbox", somedayStatus: "", captureToInbox: true };
		const task = await service.createTask({ title: "Call dentist" });
		expect(task.taskInfo.status).toBe("inbox");
	});

	it("keeps an explicit status", async () => {
		runtime.settings.triage = { inboxStatus: "inbox", somedayStatus: "", captureToInbox: true };
		const task = await service.createTask({ title: "Call dentist", status: "in-progress" });
		expect(task.taskInfo.status).toBe("in-progress");
	});

	it("dated tasks get the default status", async () => {
		runtime.settings.triage = { inboxStatus: "inbox", somedayStatus: "", captureToInbox: true };
		const task = await service.createTask({ title: "Call dentist", scheduled: "2026-10-20" });
		expect(task.taskInfo.status).toBe(runtime.settings.defaultTaskStatus);
	});

	it("uses the default status when no inbox status is configured", async () => {
		runtime.settings.triage = { inboxStatus: "", somedayStatus: "", captureToInbox: true };
		const task = await service.createTask({ title: "Call dentist" });
		expect(task.taskInfo.status).toBe(runtime.settings.defaultTaskStatus);
	});
});
