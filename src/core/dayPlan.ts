import type { CalendarResponseStatus, ICSEvent, TaskInfo, TimeBlock } from "../types";
import { clip, Interval, localDayBounds, localTime } from "./timeIntervals";

export interface DayItem {
	kind: "task" | "event" | "timeblock";
	ref: string;
	date: string;
	interval?: Interval;
	allDay: boolean;
	contexts: string[];
	done: boolean;
	task?: TaskInfo;
	sourceId?: string;
	responseStatus?: CalendarResponseStatus;
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
	return { kind: "task", ref: task.path, date, interval, allDay: !interval, contexts: task.contexts ?? [], done, task };
}

function eventItem(event: ICSEvent, input: DayPlanInput): DayItem | null {
	if (event.responseStatus === "declined") return null;
	const { date } = input;
	const external = input.externalContextFor(event);
	const base = {
		kind: "event" as const, ref: event.id, date, contexts: external ? [external] : [],
		sourceId: event.subscriptionId, responseStatus: event.responseStatus,
	};
	if (event.allDay) {
		const start = event.start.slice(0, 10);
		const end = datePart(event.end) ?? nextDate(start);
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
	const interval = { start: localTime(input.date, tb.startTime), end: localTime(input.date, tb.endTime) };
	return {
		kind: "timeblock", ref: tb.id, date: input.date, interval, allDay: false,
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
