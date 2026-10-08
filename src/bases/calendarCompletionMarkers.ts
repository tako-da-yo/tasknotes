import { format } from "date-fns";
import type { TaskInfo } from "../types";
import { getDatePart, hasTimeComponent, parseDateToLocal } from "../utils/dateUtils";
import type { CalendarEvent } from "./calendar-core";

/** Class added to completed task events collapsed into a thin marker. */
export const COMPLETION_MARKER_CLASS = "fc-completion-marker";

/** Date layers of a task that a completion marker replaces. Time entries stay. */
const COLLAPSIBLE_EVENT_TYPES = new Set<CalendarEvent["extendedProps"]["eventType"]>([
	"scheduled",
	"due",
	"scheduledToDueSpan",
]);

/**
 * Converts a stored completion timestamp to a local calendar start, or null when the
 * value is missing or has no time (completions recorded before times were tracked).
 */
export function toCompletionMarkerStart(timestamp: string | undefined): string | null {
	if (!timestamp || !hasTimeComponent(timestamp)) return null;
	const date = parseDateToLocal(timestamp);
	if (Number.isNaN(date.getTime())) return null;
	return format(date, "yyyy-MM-dd'T'HH:mm");
}

/** Turns an event into a non-draggable completion marker starting at `start`. */
function toMarker(event: CalendarEvent, task: TaskInfo, start: string): CalendarEvent {
	const timed = hasTimeComponent(start);
	return {
		...event,
		start,
		// Timed markers are a single minute; CSS keeps them one line tall.
		end: timed
			? format(new Date(parseDateToLocal(start).getTime() + 60 * 1000), "yyyy-MM-dd'T'HH:mm")
			: undefined,
		allDay: !timed,
		// Outline only; completed recurring instances otherwise get a dark fill.
		backgroundColor: "transparent",
		editable: false,
		extendedProps: {
			...event.extendedProps,
			taskInfo: task,
			isCompleted: true,
			isCompletionMarker: true,
		},
	};
}

export interface CollapseCompletedTaskInput {
	task: TaskInfo;
	/** Events generated for this task, in order. */
	events: CalendarEvent[];
	isCompleted: boolean;
	/** Whether the task appears on the calendar through a shown scheduled or due date. */
	isShownByDate: boolean;
	/** Builds a scheduled-style event for the task at the given start. */
	createMarkerEvent: (start: string) => CalendarEvent | null;
	/** Whether a marker starting at the given time falls in the visible range. */
	isInVisibleRange?: (start: string) => boolean;
}

/**
 * Collapses a completed task's calendar events into thin markers placed at the time it
 * was completed. Recurring instances use their own recorded completion time. Tasks
 * completed before completion times were recorded stay at their scheduled time.
 */
export function collapseCompletedTaskEvents({
	task,
	events,
	isCompleted,
	isShownByDate,
	createMarkerEvent,
	isInVisibleRange = () => true,
}: CollapseCompletedTaskInput): CalendarEvent[] {
	const result: CalendarEvent[] = [];

	for (const event of events) {
		const { eventType, instanceDate } = event.extendedProps;
		if (eventType === "recurring" && event.extendedProps.isCompleted && instanceDate) {
			const completedAt = toCompletionMarkerStart(
				task.complete_instance_times?.[instanceDate]
			);
			result.push(toMarker(event, task, completedAt ?? event.start));
		} else if (!(isCompleted && !task.recurrence && COLLAPSIBLE_EVENT_TYPES.has(eventType))) {
			result.push(event);
		}
	}

	if (isCompleted && !task.recurrence && isShownByDate) {
		// Ignore a timestamp that disagrees with an edited completion date.
		const completedAt =
			task.completedAt &&
			(!task.completedDate || getDatePart(task.completedAt) === task.completedDate)
				? toCompletionMarkerStart(task.completedAt)
				: null;
		const start = completedAt ?? task.scheduled ?? task.due ?? null;
		const markerEvent = start && isInVisibleRange(start) ? createMarkerEvent(start) : null;
		if (start && markerEvent) {
			result.push(toMarker(markerEvent, task, start));
		}
	}

	return result;
}
