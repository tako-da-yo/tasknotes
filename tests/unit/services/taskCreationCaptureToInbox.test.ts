import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { PluginFactory } from "../../helpers/mock-factories";
import { TaskCreationService } from "../../../src/services/task-service/TaskCreationService";
import { buildTaskCreationDataFromParsed } from "../../../src/services/buildTaskCreationDataFromParsed";
import type TaskNotesPlugin from "../../../src/main";

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

describe("buildTaskCreationDataFromParsed captureToInbox option", () => {
	const inboxOn = { inboxStatus: "inbox", somedayStatus: "", captureToInbox: true };
	let runtime: ReturnType<typeof PluginFactory.createMockPlugin>;
	let applyDefaults: jest.Mock<(taskData: object) => Promise<object>>;
	let service: TaskCreationService;

	beforeEach(() => {
		runtime = PluginFactory.createMockPlugin();
		runtime.settings.triage = inboxOn;
		applyDefaults = jest.fn(async (taskData: object) => taskData);
		service = new TaskCreationService({
			runtime,
			applyTaskCreationDefaults: applyDefaults as never,
			applyTemplate: jest.fn(async () => ({ frontmatter: {}, body: "" })),
			processFolderTemplate: jest.fn((folderTemplate) => folderTemplate),
			sanitizeTitleForFilename: jest.fn((input) => input),
			sanitizeTitleForStorage: jest.fn((input) => input),
		});
	});

	const plugin = () => runtime as unknown as TaskNotesPlugin;

	it("captures a dateless quick-create to the inbox when enabled", async () => {
		const data = buildTaskCreationDataFromParsed(
			plugin(),
			{ title: "Call dentist" },
			{ captureToInbox: true }
		);
		const task = await service.createTask(data);
		expect(task.taskInfo.status).toBe("inbox");
	});

	it("treats a creation-default date as a real date", async () => {
		applyDefaults.mockImplementation(async (taskData: object) => ({
			...taskData,
			scheduled: "2026-10-15",
		}));
		const data = buildTaskCreationDataFromParsed(
			plugin(),
			{ title: "Call dentist" },
			{ captureToInbox: true }
		);
		const task = await service.createTask(data);
		expect(task.taskInfo.status).toBe(runtime.settings.defaultTaskStatus);
	});

	it("keeps a parsed status when enabled", () => {
		const data = buildTaskCreationDataFromParsed(
			plugin(),
			{ title: "Call dentist", status: "in-progress" },
			{ captureToInbox: true }
		);
		expect(data.status).toBe("in-progress");
	});

	it("fills the default status when the option is absent", () => {
		const data = buildTaskCreationDataFromParsed(plugin(), { title: "Call dentist" });
		expect(data.status).toBe(runtime.settings.defaultTaskStatus);
	});

	it("fills the default status when the option is on but the inbox is off", () => {
		runtime.settings.triage = { inboxStatus: "", somedayStatus: "", captureToInbox: true };
		const data = buildTaskCreationDataFromParsed(
			plugin(),
			{ title: "Call dentist" },
			{ captureToInbox: true }
		);
		expect(data.status).toBe(runtime.settings.defaultTaskStatus);
	});
});
