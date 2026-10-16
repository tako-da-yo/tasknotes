import type { TaskInfo } from "../types";
import type { PlanningSettings } from "../types/settings";
import type { DayItem } from "./dayPlan";
import { clip, Interval, localDayBounds, localTime, mergeIntervals, totalMinutes } from "./timeIntervals";

export interface DayCapacity {
	date: string;
	availableMinutes: number;
	plannedMinutes: number;
	unestimatedCount: number;
	tasks: { path: string; minutes: number; calibrated: boolean }[];
	overByMinutes: number;
	hasWorkHours: boolean;
}

export interface CapacityOptions {
	date: string;
	now: number;
	planning: PlanningSettings;
	sizeTask(task: TaskInfo): { minutes: number; calibrated: boolean } | null;
}

function weekday(date: string): number {
	const [y, m, d] = date.split("-").map(Number);
	return new Date(y, m - 1, d).getDay();
}

export function computeDayCapacity(items: DayItem[], opts: CapacityOptions): DayCapacity {
	const hours = opts.planning.workHours[weekday(opts.date)] ?? null;
	let availableMinutes = 0;
	if (hours) {
		// An end of "00:00" means midnight at the end of the day, as for timeblocks.
		const end = hours.end === "00:00" && hours.start !== "00:00"
			? localDayBounds(opts.date).end
			: localTime(opts.date, hours.end);
		const window: Interval = { start: localTime(opts.date, hours.start), end };
		window.start = Math.max(window.start, Math.min(opts.now, window.end));
		if (window.end > window.start) {
			const excluded = new Set(opts.planning.nonBusyCalendars);
			const busy: Interval[] = [];
			for (const item of items) {
				if (item.kind !== "event") continue;
				if (item.sourceId && excluded.has(item.sourceId)) continue;
				if (item.allDay) {
					if (opts.planning.allDayEventsBusy) busy.push(window);
					continue;
				}
				const c = item.interval && clip(item.interval, window);
				if (c) busy.push(c);
			}
			availableMinutes = Math.round((window.end - window.start) / 60_000 - totalMinutes(mergeIntervals(busy)));
		}
	}

	let plannedMinutes = 0;
	let unestimatedCount = 0;
	const tasks: DayCapacity["tasks"] = [];
	for (const item of items) {
		if (item.kind !== "task" || item.done || !item.task) continue;
		const size = opts.sizeTask(item.task) ??
			(opts.planning.defaultEstimate ? { minutes: opts.planning.defaultEstimate, calibrated: false } : null);
		if (!size) {
			unestimatedCount++;
			continue;
		}
		const minutes = Math.max(0, size.minutes - item.trackedMinutes);
		plannedMinutes += minutes;
		tasks.push({ path: item.task.path, minutes, calibrated: size.calibrated });
	}

	return {
		date: opts.date,
		availableMinutes: Math.max(0, availableMinutes),
		plannedMinutes,
		unestimatedCount,
		tasks: tasks.sort((a, b) => b.minutes - a.minutes),
		overByMinutes: Math.max(0, plannedMinutes - Math.max(0, availableMinutes)),
		hasWorkHours: !!hours,
	};
}

/**
 * Why moving a task to the inbox would not take it off `date`, or null when it would.
 * Moving clears the scheduled date only, so a due date on the day keeps the task there,
 * and recurring tasks stay on their recurrence.
 */
export function inboxMoveBlock(
	task: Pick<TaskInfo, "recurrence" | "due">,
	date: string
): "due" | "recurring" | null {
	if (task.recurrence) return "recurring";
	if (task.due?.slice(0, 10) === date) return "due";
	return null;
}
