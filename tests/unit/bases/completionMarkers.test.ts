import { collapseCompletedTaskEvents } from "../../../src/bases/calendarCompletionMarkers";
import type { CalendarEvent } from "../../../src/bases/calendar-core";
import { mapTaskFromFrontmatter, mapTaskToFrontmatter } from "../../../src/core/fieldMapping";
import { DEFAULT_FIELD_MAPPING } from "../../../src/core/defaultFieldMapping";
import {
	resolveCompletedAt,
	updateCompleteInstanceTimes,
} from "../../../src/services/task-service/completionTime";
import {
	buildTaskPropertyUpdatePlan,
	updateCompletedDateFrontmatter,
} from "../../../src/services/task-service/taskPropertyUpdate";
import {
	applyRecurringTaskCompleteFrontmatterChange,
	buildRecurringTaskCompletePlan,
} from "../../../src/services/task-service/taskRecurringPlanning";
import type { TaskInfo } from "../../../src/types";

const NOW = "2026-10-07T14:02:05.000+02:00";

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Write report",
		status: "done",
		priority: "normal",
		path: "Tasks/report.md",
		archived: false,
		scheduled: "2026-10-07T09:00",
		completedDate: "2026-10-07",
		...overrides,
	} as TaskInfo;
}

function event(
	eventType: CalendarEvent["extendedProps"]["eventType"],
	start: string,
	extra: Partial<CalendarEvent["extendedProps"]> = {}
): CalendarEvent {
	return {
		id: `${eventType}-${start}`,
		title: "Write report",
		start,
		end: start,
		allDay: false,
		editable: true,
		extendedProps: { eventType, ...extra },
	};
}

const markerFactory = (start: string): CalendarEvent => event("scheduled", start);

describe("completion time recording", () => {
	it("records now for completions today and keeps an existing same-day time", () => {
		expect(resolveCompletedAt("2026-10-07", undefined, NOW, "2026-10-07")).toBe(NOW);
		const earlier = "2026-10-07T08:00:00.000+02:00";
		expect(resolveCompletedAt("2026-10-07", earlier, NOW, "2026-10-07")).toBe(earlier);
	});

	it("records no time for completion dates other than today", () => {
		expect(resolveCompletedAt("2026-10-01", undefined, NOW, "2026-10-07")).toBeUndefined();
	});

	it("adds and removes recurring instance completion times", () => {
		const times = updateCompleteInstanceTimes(undefined, "2026-10-07", true, NOW);
		expect(times).toEqual({ "2026-10-07": NOW });
		expect(updateCompleteInstanceTimes(times, "2026-10-07", false)).toBeUndefined();
	});

	it("writes completedAt with the completion date and removes it when reopened", () => {
		const frontmatter: Record<string, unknown> = {};
		const isDone = (status: string) => status === "done";
		updateCompletedDateFrontmatter(
			frontmatter,
			"done",
			false,
			"completedDate",
			isDone,
			"2026-10-01",
			"completedAt"
		);
		// A past completion date (picked from the menu) has no known time.
		expect(frontmatter).toEqual({ completedDate: "2026-10-01" });

		frontmatter.completedAt = "2026-10-01T10:00";
		updateCompletedDateFrontmatter(
			frontmatter,
			"open",
			false,
			"completedDate",
			isDone,
			"2026-10-07",
			"completedAt"
		);
		expect(frontmatter).toEqual({});
	});

	it("sets completedAt on the in-memory task when status becomes completed", () => {
		const plan = buildTaskPropertyUpdatePlan({
			freshTask: createTask({ status: "open", completedDate: undefined }),
			property: "status",
			value: "done",
			currentTimestamp: NOW,
			currentDateString: "2026-10-07",
			normalizeStatusValue: (value) => String(value),
			isCompletedStatus: (status) => status === "done",
		});
		expect(plan.updatedTask.completedDate).toBe("2026-10-07");
		expect(typeof plan.updatedTask.completedAt).toBe("string");
	});

	it("records and clears a recurring instance completion time", () => {
		const freshTask = createTask({
			status: "open",
			recurrence: "FREQ=DAILY",
			scheduled: "2026-10-07",
			completedDate: undefined,
			complete_instances: [],
		});
		const plan = buildRecurringTaskCompletePlan({
			freshTask,
			targetDate: new Date("2026-10-07T12:00:00.000Z"),
			currentTimestamp: NOW,
			maintainDueDateOffsetInRecurring: true,
		});
		expect(plan.updatedTask.complete_instance_times).toEqual({ "2026-10-07": NOW });

		const frontmatter: Record<string, unknown> = {};
		applyRecurringTaskCompleteFrontmatterChange({
			frontmatter,
			completeInstancesField: "complete_instances",
			completeInstanceTimesField: "complete_instance_times",
			skippedInstancesField: "skipped_instances",
			dateModifiedField: "dateModified",
			scheduledField: "scheduled",
			dueField: "due",
			recurrenceField: "recurrence",
			googleCalendarExceptionOriginalScheduledField:
				"googleCalendarExceptionOriginalScheduled",
			googleCalendarMovedOriginalDatesField: "googleCalendarMovedOriginalDates",
			plan,
		});
		expect(frontmatter.complete_instance_times).toEqual({ "2026-10-07": NOW });

		const undoPlan = buildRecurringTaskCompletePlan({
			freshTask: { ...plan.updatedTask, complete_instances: ["2026-10-07"] },
			targetDate: new Date("2026-10-07T12:00:00.000Z"),
			currentTimestamp: NOW,
			maintainDueDateOffsetInRecurring: true,
		});
		expect(undoPlan.updatedTask.complete_instance_times).toBeUndefined();
	});
});

describe("completion time field mapping", () => {
	it("reads and writes completion times under renamed fields", () => {
		const mapping = {
			...DEFAULT_FIELD_MAPPING,
			completedAt: "done_at",
			completeInstanceTimes: "done_times",
		};
		const task = mapTaskFromFrontmatter(
			mapping,
			{
				title: "Daily",
				done_at: NOW,
				done_times: { "2026-10-06": NOW, broken: 3 },
			},
			"Tasks/daily.md"
		);
		expect(task.completedAt).toBe(NOW);
		expect(task.complete_instance_times).toEqual({ "2026-10-06": NOW });

		const frontmatter = mapTaskToFrontmatter(mapping, task);
		expect(frontmatter.done_at).toBe(NOW);
		expect(frontmatter.done_times).toEqual({ "2026-10-06": NOW });
	});
});

describe("collapseCompletedTaskEvents", () => {
	it("replaces a completed task's date events with one marker at its completion time", () => {
		const task = createTask({ due: "2026-10-08", completedAt: "2026-10-07T14:02:05" });
		const events = collapseCompletedTaskEvents({
			task,
			events: [
				event("scheduled", "2026-10-07T09:00"),
				event("due", "2026-10-08"),
				event("timeEntry", "2026-10-07T10:00"),
			],
			isCompleted: true,
			isShownByDate: true,
			createMarkerEvent: markerFactory,
		});

		expect(events.map((e) => e.extendedProps.eventType)).toEqual(["timeEntry", "scheduled"]);
		const marker = events[1];
		expect(marker.start).toBe("2026-10-07T14:02");
		expect(marker.end).toBe("2026-10-07T14:03");
		expect(marker.editable).toBe(false);
		expect(marker.extendedProps.isCompletionMarker).toBe(true);
	});

	it("keeps older completions without a time at their scheduled time", () => {
		const [marker] = collapseCompletedTaskEvents({
			task: createTask(),
			events: [event("scheduled", "2026-10-07T09:00")],
			isCompleted: true,
			isShownByDate: true,
			createMarkerEvent: markerFactory,
		});
		expect(marker.start).toBe("2026-10-07T09:00");
		expect(marker.extendedProps.isCompletionMarker).toBe(true);
	});

	it("ignores a completion time that disagrees with an edited completion date", () => {
		const [marker] = collapseCompletedTaskEvents({
			task: createTask({ completedDate: "2026-10-05", completedAt: "2026-10-07T14:02" }),
			events: [],
			isCompleted: true,
			isShownByDate: true,
			createMarkerEvent: markerFactory,
		});
		expect(marker.start).toBe("2026-10-07T09:00");
	});

	it("skips markers outside the visible range", () => {
		const events = collapseCompletedTaskEvents({
			task: createTask({ completedAt: "2026-10-07T14:02" }),
			events: [],
			isCompleted: true,
			isShownByDate: true,
			createMarkerEvent: markerFactory,
			isInVisibleRange: () => false,
		});
		expect(events).toEqual([]);
	});

	it("moves completed recurring instances to their own completion time", () => {
		const task = createTask({
			status: "open",
			recurrence: "FREQ=DAILY",
			complete_instance_times: { "2026-10-06": "2026-10-06T17:45:00" },
		});
		const events = collapseCompletedTaskEvents({
			task,
			events: [
				event("recurring", "2026-10-06T09:00", {
					isCompleted: true,
					instanceDate: "2026-10-06",
				}),
				event("recurring", "2026-10-05T09:00", {
					isCompleted: true,
					instanceDate: "2026-10-05",
				}),
				event("recurring", "2026-10-07T09:00", {
					isCompleted: false,
					instanceDate: "2026-10-07",
				}),
			],
			isCompleted: false,
			isShownByDate: true,
			createMarkerEvent: markerFactory,
		});

		expect(events.map((e) => [e.start, Boolean(e.extendedProps.isCompletionMarker)])).toEqual([
			["2026-10-06T17:45", true],
			["2026-10-05T09:00", true],
			["2026-10-07T09:00", false],
		]);
	});
});
