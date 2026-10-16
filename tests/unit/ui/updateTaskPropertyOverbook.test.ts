import TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import { App } from "../../helpers/obsidian-runtime";

function createPlugin(updated: Partial<TaskInfo>) {
	const plugin = new TaskNotesPlugin(new App() as never, {} as never);
	const check = jest.fn(async () => undefined);
	plugin.overbookNotifier = { check } as never;
	plugin.taskService = {
		updateProperty: jest.fn(async (task: TaskInfo) => ({ ...task, ...updated })),
	} as never;
	plugin.statusManager = { getStatusConfig: jest.fn(() => undefined) } as never;
	return { plugin, check };
}

const task = {
	path: "a.md",
	title: "A",
	status: "open",
	priority: "normal",
	archived: false,
} as TaskInfo;

describe("plugin.updateTaskProperty overbook notice", () => {
	it("checks the day a scheduled change moved the task to", async () => {
		const { plugin, check } = createPlugin({ scheduled: "2026-10-16" });
		await plugin.updateTaskProperty(task, "scheduled", "2026-10-16");
		expect(check).toHaveBeenCalledWith(["2026-10-16"]);
	});

	it("checks the day a due change moved the task to", async () => {
		const { plugin, check } = createPlugin({ due: "2026-10-17" });
		await plugin.updateTaskProperty(task, "due", "2026-10-17");
		expect(check).toHaveBeenCalledWith(["2026-10-17"]);
	});

	it("does not check for non-date properties", async () => {
		const { plugin, check } = createPlugin({ priority: "high" });
		await plugin.updateTaskProperty(task, "priority", "high");
		expect(check).not.toHaveBeenCalled();
	});
});
