import type { CalendarResponseStatus, ICSEvent, TaskInfo, TimeBlock, TimeEntry } from "../types";
import { clip, Interval, localDayBounds, localTime } from "./timeIntervals";

export interface DayItem {
	kind: "task" | "event" | "timeblock";
	ref: string;
	date: string;
	title?: string;
	interval?: Interval;
	allDay: boolean;
	contexts: string[];
	done: boolean;
	// Minutes already tracked against this item: the date's time entries for a
	// recurring instance, the task's lifetime total otherwise, 0 for non-tasks.
	trackedMinutes: number;
	// Minutes from time entries that started on this date, for any task (recurring or
	// not); 0 for non-tasks. Energy counts this as spent on the date.
	trackedOnDateMinutes: number;
	task?: TaskInfo;
	sourceId?: string;
	responseStatus?: CalendarResponseStatus;
	// Provider-specific event kind, e.g. Google "workingLocation".
	eventType?: string;
	attachments?: string[];
}

export interface DayPlanInput {
	date: string;
	now: number;
	tasks: TaskInfo[];
	events: ICSEvent[];
	timeblocks: TimeBlock[];
	isCompleted(status: string): boolean;
	isRecurringOnDate(task: TaskInfo, date: string): boolean;
	externalContextFor(event: ICSEvent): string | undefined;
	resolveAttachment(link: string): string | null;
}

const datePart = (v?: string) => v?.slice(0, 10);

function nextDate(date: string): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	return d.toISOString().slice(0, 10);
}

function entryMinutes(entry: TimeEntry, now: number): number {
	const start = Date.parse(entry.startTime);
	if (entry.endTime) {
		const end = Date.parse(entry.endTime);
		return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(0, end - start) / 60_000;
	}
	if (typeof entry.duration === "number") return Math.max(0, entry.duration);
	return Number.isNaN(start) ? 0 : Math.max(0, now - start) / 60_000;
}

function trackedOnDate(task: TaskInfo, date: string, now: number): number {
	const day = localDayBounds(date);
	let minutes = 0;
	for (const entry of task.timeEntries ?? []) {
		const start = Date.parse(entry.startTime);
		if (start >= day.start && start < day.end) minutes += entryMinutes(entry, now);
	}
	return Math.round(minutes);
}

function taskItem(task: TaskInfo, input: DayPlanInput): DayItem | null {
	if (task.archived) return null;
	const { date } = input;
	let done: boolean;
	if (task.recurrence) {
		if (!input.isRecurringOnDate(task, date)) return null;
		if (task.skipped_instances?.includes(date)) return null;
		done = !!task.complete_instances?.includes(date);
	} else if (input.isCompleted(task.status)) {
		if (datePart(task.completedDate) !== date) return null;
		done = true;
	} else {
		const onDate = task.scheduled ? datePart(task.scheduled) === date : datePart(task.due) === date;
		if (!onDate) return null;
		done = false;
	}
	let interval: Interval | undefined;
	const time = task.scheduled && task.scheduled.length > 10 ? task.scheduled.slice(11, 16) : undefined;
	if (time && datePart(task.scheduled) === date) {
		const start = localTime(date, time);
		interval = { start, end: start + (task.timeEstimate || 30) * 60_000 };
	}
	const trackedOnDateMinutes = trackedOnDate(task, date, input.now);
	const trackedMinutes = task.recurrence ? trackedOnDateMinutes : (task.totalTrackedTime ?? 0);
	return {
		kind: "task", ref: task.path, date, title: task.title, interval, allDay: !interval, contexts: task.contexts ?? [], done,
		trackedMinutes, trackedOnDateMinutes, task,
	};
}

function eventItem(event: ICSEvent, input: DayPlanInput): DayItem | null {
	if (event.responseStatus === "declined") return null;
	const { date } = input;
	const external = input.externalContextFor(event);
	const base = {
		kind: "event" as const, ref: event.id, date, title: event.title, contexts: external ? [external] : [], trackedMinutes: 0, trackedOnDateMinutes: 0,
		sourceId: event.subscriptionId, responseStatus: event.responseStatus, eventType: event.providerEventType,
	};
	if (event.allDay) {
		const start = event.start.slice(0, 10);
		// The end is exclusive; an end on (or before) the start still covers the start day.
		const rawEnd = datePart(event.end);
		const end = rawEnd && rawEnd > start ? rawEnd : nextDate(start);
		if (!(start <= date && date < end)) return null;
		return { ...base, allDay: true, done: localDayBounds(date).end <= input.now };
	}
	const start = Date.parse(event.start);
	const end = event.end ? Date.parse(event.end) : start;
	const day = localDayBounds(date);
	const interval = end === start ? (start >= day.start && start < day.end ? { start, end } : null) : clip({ start, end }, day);
	if (!interval) return null;
	return { ...base, allDay: false, interval, done: end <= input.now };
}

function timeblockItem(tb: TimeBlock, input: DayPlanInput): DayItem {
	const start = localTime(input.date, tb.startTime);
	// TaskNotes accepts an endTime of "00:00" (after a later start) as the end of the day.
	const endsAtMidnight = tb.endTime === "00:00" && tb.startTime !== "00:00";
	const end = endsAtMidnight ? localDayBounds(input.date).end : localTime(input.date, tb.endTime);
	const interval = { start, end };
	return {
		kind: "timeblock", ref: tb.id, date: input.date, title: tb.title, interval, allDay: false, trackedMinutes: 0, trackedOnDateMinutes: 0,
		contexts: tb.context ? [tb.context] : [], done: interval.end <= input.now,
		attachments: (tb.attachments ?? []).map((l) => input.resolveAttachment(l)).filter((p): p is string => !!p),
	};
}

export function collectDayItems(input: DayPlanInput): DayItem[] {
	const items: DayItem[] = [];
	for (const task of input.tasks) {
		const item = taskItem(task, input);
		if (item) items.push(item);
	}
	for (const event of input.events) {
		const item = eventItem(event, input);
		if (item) items.push(item);
	}
	for (const tb of input.timeblocks) items.push(timeblockItem(tb, input));
	return items;
}
