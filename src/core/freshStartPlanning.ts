import type { TaskInfo } from "../types";
import type { FreshStartSnapshot, FreshStartSnapshotEntry } from "../types/settings";

export interface FreshStartOptions {
	today: string;
	clearDue: boolean;
	inboxStatus: string;
	isCompleted: (status: string) => boolean;
}

export interface FreshStartPreview {
	scheduledCount: number;
	dueCount: number;
	total: number;
}

const datePart = (value: string | undefined): string | undefined => value?.slice(0, 10);
const isPast = (value: string | undefined, today: string): boolean => {
	const day = datePart(value);
	return !!day && day < today;
};

function isEligible(task: TaskInfo, isCompleted: (s: string) => boolean): boolean {
	return !task.archived && !task.recurrence && !isCompleted(task.status);
}

export function previewFreshStart(
	tasks: TaskInfo[],
	today: string,
	isCompleted: (s: string) => boolean
): FreshStartPreview {
	let scheduledCount = 0;
	let dueCount = 0;
	let total = 0;
	for (const task of tasks) {
		if (!isEligible(task, isCompleted)) continue;
		const s = isPast(task.scheduled, today);
		const d = isPast(task.due, today);
		if (s) scheduledCount++;
		if (d) dueCount++;
		if (s || d) total++;
	}
	return { scheduledCount, dueCount, total };
}

export function planFreshStart(
	tasks: TaskInfo[],
	opts: FreshStartOptions
): FreshStartSnapshotEntry[] {
	const entries: FreshStartSnapshotEntry[] = [];
	for (const task of tasks) {
		if (!isEligible(task, opts.isCompleted)) continue;
		const clearScheduled = isPast(task.scheduled, opts.today);
		const clearDue = opts.clearDue && isPast(task.due, opts.today);
		if (!clearScheduled && !clearDue) continue;
		const before = { scheduled: task.scheduled, due: task.due, status: task.status };
		entries.push({
			path: task.path,
			before,
			after: {
				scheduled: clearScheduled ? undefined : task.scheduled,
				due: clearDue ? undefined : task.due,
				status: opts.inboxStatus || task.status,
			},
		});
	}
	return entries;
}

const UNDO_FIELDS = ["scheduled", "due", "status"] as const;

export function planFreshStartUndo(
	snapshot: FreshStartSnapshot,
	current: Map<string, TaskInfo>
): {
	restores: { path: string; updates: Partial<Pick<TaskInfo, "scheduled" | "due" | "status">> }[];
	skipped: number;
} {
	const restores: {
		path: string;
		updates: Partial<Pick<TaskInfo, "scheduled" | "due" | "status">>;
	}[] = [];
	let skipped = 0;
	for (const entry of snapshot.entries) {
		const task = current.get(entry.path);
		if (!task) {
			skipped++;
			continue;
		}
		const updates: Partial<Pick<TaskInfo, "scheduled" | "due" | "status">> = {};
		for (const field of UNDO_FIELDS) {
			if (entry.before[field] === entry.after[field]) continue;
			if (task[field] !== entry.after[field]) continue; // user changed it since
			(updates as Record<string, string | undefined>)[field] = entry.before[field];
		}
		if (Object.keys(updates).length > 0) restores.push({ path: entry.path, updates });
	}
	return { restores, skipped };
}
