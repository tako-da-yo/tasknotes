import { handleRecurringTaskDrop } from "../../../src/bases/calendar-core";
import type TaskNotesPlugin from "../../../src/main";
import type { TaskInfo } from "../../../src/types";
import { TaskFactory } from "../../helpers/mock-factories";

function createPlugin(updated: (task: TaskInfo, value: string) => TaskInfo) {
	const check = jest.fn().mockResolvedValue(undefined);
	const plugin = {
		taskService: {
			updateProperty: jest.fn(async (task: TaskInfo, _p: string, value: string) =>
				updated(task, value)
			),
		},
		overbookNotifier: { check },
	} as unknown as TaskNotesPlugin;
	return { plugin, check };
}

function dropInfo(start: Date, extendedProps: Record<string, unknown>, allDay = true) {
	return {
		event: { start, allDay, extendedProps },
		revert: jest.fn(),
	} as unknown as Parameters<typeof handleRecurringTaskDrop>[0];
}

describe("handleRecurringTaskDrop overbook notice", () => {
	it("checks the new date when the next scheduled occurrence is dragged to another day", async () => {
		const task = TaskFactory.createTask({
			scheduled: "2026-10-15",
			recurrence: "FREQ=DAILY",
		});
		const { plugin, check } = createPlugin((t, value) => ({ ...t, scheduled: value }));

		await handleRecurringTaskDrop(
			dropInfo(new Date(2026, 9, 16), { isNextScheduledOccurrence: true }),
			task,
			plugin
		);

		expect(check).toHaveBeenCalledWith(["2026-10-16"]);
	});

	it("checks nothing when a legacy instance drag only changes the time", async () => {
		const task = TaskFactory.createTask({
			scheduled: "2026-10-15T09:00",
			recurrence: "FREQ=DAILY",
		});
		const { plugin, check } = createPlugin((t, value) => ({ ...t, scheduled: value }));

		await handleRecurringTaskDrop(
			dropInfo(new Date(2026, 9, 16, 11, 0), { isRecurringInstance: true }, false),
			task,
			plugin
		);

		expect(plugin.taskService.updateProperty).toHaveBeenCalled();
		expect(check).not.toHaveBeenCalled();
	});
});
