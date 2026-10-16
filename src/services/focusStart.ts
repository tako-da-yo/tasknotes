import type TaskNotesPlugin from "../main";
import type { DayItem } from "../core/dayPlan";
import { focusCandidates, plannedMinutesForTask, plannedMinutesForTimeblock } from "../core/focusPlan";
import type { FocusSource, TaskInfo } from "../types";
import type { EnergyKind } from "../types/settings";
import { resolveContext } from "../utils/contextColors";
import { getTodayString } from "../utils/dateUtils";
import { calculateTotalTimeSpent } from "../utils/helpers";

export interface FocusInput {
	source: FocusSource;
	title: string;
	energyKind: EnergyKind;
	plannedMinutes: number | null;
}

function energyKindOf(plugin: TaskNotesPlugin, contexts: string[]): EnergyKind {
	if (!plugin.settings.energy.enabled) return "steady";
	return resolveContext(plugin.settings, contexts)?.energy ?? "steady";
}

/** The one task attached to a timeblock, if it has exactly one. */
function soleAttachedTask(plugin: TaskNotesPlugin, item: DayItem): string | undefined {
	const tasks = (item.attachments ?? []).filter((path) => plugin.cacheManager.getCachedTaskInfoSync(path));
	return tasks.length === 1 ? tasks[0] : undefined;
}

/** A focus session for a day item (a task or timeblock), or null for anything else. */
export function focusInputForItem(plugin: TaskNotesPlugin, item: DayItem, now = Date.now()): FocusInput | null {
	if (item.kind === "task" && item.task) {
		return {
			source: { kind: "task", path: item.task.path },
			title: item.task.title,
			energyKind: energyKindOf(plugin, item.contexts),
			plannedMinutes: plannedMinutesForTask(item.task.timeEstimate, item.trackedMinutes),
		};
	}
	if (item.kind === "timeblock" && item.interval) {
		return {
			source: { kind: "timeblock", date: item.date, id: item.ref, taskPath: soleAttachedTask(plugin, item) },
			title: item.title || item.ref,
			energyKind: energyKindOf(plugin, item.contexts),
			plannedMinutes: plannedMinutesForTimeblock(item.interval.start, item.interval.end, now),
		};
	}
	return null;
}

/** A focus session for a task, using today's tracked time for a recurring task's instance. */
export async function focusInputForTask(plugin: TaskNotesPlugin, task: TaskInfo): Promise<FocusInput> {
	const today = (await plugin.dayPlanService.getDayItems(getTodayString())).find(
		(item) => item.kind === "task" && item.ref === task.path
	);
	if (today) {
		const input = focusInputForItem(plugin, today);
		if (input) return input;
	}
	const tracked = task.totalTrackedTime ?? calculateTotalTimeSpent(task.timeEntries ?? []);
	return {
		source: { kind: "task", path: task.path },
		title: task.title,
		energyKind: energyKindOf(plugin, task.contexts ?? []),
		plannedMinutes: task.recurrence ? (task.timeEstimate ?? null) : plannedMinutesForTask(task.timeEstimate, tracked),
	};
}

export async function startFocusOnTask(plugin: TaskNotesPlugin, task: TaskInfo): Promise<void> {
	await plugin.pomodoroService.startFocus(await focusInputForTask(plugin, task));
}

export async function startFocusOnItem(plugin: TaskNotesPlugin, item: DayItem): Promise<void> {
	const input = focusInputForItem(plugin, item);
	if (input) await plugin.pomodoroService.startFocus(input);
}

/** Today's suggestions for what to focus on next. */
export async function focusSuggestions(plugin: TaskNotesPlugin, limit = 3): Promise<DayItem[]> {
	return focusCandidates(await plugin.dayPlanService.getDayItems(getTodayString()), Date.now(), limit);
}
