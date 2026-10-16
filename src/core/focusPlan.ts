import type { FocusChunk, FocusPlan } from "../types";
import type { DayItem } from "./dayPlan";
import type { EnergyKind } from "../types/settings";

export interface FocusPlanOptions {
	/** Planned time up to this many minutes is one chunk. */
	splitThreshold: number;
	/** Target work chunk length for each energy kind. */
	chunkMinutes: Record<EnergyKind, number>;
	shortBreak: number;
	longBreak: number;
	/** Every this-many-th break in a session is a long break. */
	longBreakInterval: number;
}

const MIN_WORK_CHUNK = 10;

function breakAt(index: number, opts: FocusPlanOptions): FocusChunk {
	const long = opts.longBreakInterval > 0 && (index + 1) % opts.longBreakInterval === 0;
	return {
		type: long ? "long-break" : "short-break",
		minutes: long ? opts.longBreak : opts.shortBreak,
		status: "pending",
	};
}

function build(planned: number, count: number, opts: FocusPlanOptions): FocusChunk[] | null {
	const breaks = Array.from({ length: count - 1 }, (_, i) => breakAt(i, opts));
	const work = planned - breaks.reduce((sum, b) => sum + b.minutes, 0);
	const base = Math.floor(work / count);
	if (count > 1 && base < MIN_WORK_CHUNK) return null;
	const extra = work - base * count;
	const chunks: FocusChunk[] = [];
	for (let i = 0; i < count; i++) {
		chunks.push({ type: "work", minutes: base + (i < extra ? 1 : 0), status: "pending" });
		if (i < breaks.length) chunks.push(breaks[i]);
	}
	return chunks;
}

/**
 * Split `planned` minutes into work chunks with breaks between them, breaks included in
 * the planned time. Chunks aim for the energy kind's target length; leftover minutes go
 * to the earliest chunks, and fewer chunks are used rather than any under 10 minutes.
 */
export function planFocusChunks(planned: number, kind: EnergyKind, opts: FocusPlanOptions): FocusChunk[] {
	const minutes = Math.round(planned);
	if (minutes <= 0) return [];
	if (minutes <= opts.splitThreshold) return [{ type: "work", minutes, status: "pending" }];
	const target = Math.max(1, opts.chunkMinutes[kind]);
	let count = Math.max(1, Math.round((minutes + opts.shortBreak) / (target + opts.shortBreak)));
	for (; count > 1; count--) {
		const chunks = build(minutes, count, opts);
		if (chunks) return chunks;
	}
	return [{ type: "work", minutes, status: "pending" }];
}

/** Minutes still planned for a task: its estimate minus time already tracked, or null. */
export function plannedMinutesForTask(estimate: number | undefined, trackedMinutes: number): number | null {
	if (!estimate || estimate <= 0) return null;
	const left = Math.round(estimate - trackedMinutes);
	return left > 0 ? left : null;
}

/** Minutes left in a timeblock from `now`, or null once it has ended. Times are epoch ms. */
export function plannedMinutesForTimeblock(start: number, end: number, now: number): number | null {
	const from = Math.max(start, now);
	const left = Math.floor((end - from) / 60_000);
	return left > 0 ? left : null;
}

/** Number of work chunks in a plan and the 1-based position of the current one, if it is work. */
export function workProgress(plan: FocusPlan): { index: number; count: number } {
	let index = 0;
	let count = 0;
	plan.chunks.forEach((chunk, i) => {
		if (chunk.type !== "work") return;
		count++;
		if (i <= plan.current) index = count;
	});
	return { index, count };
}

/** Minutes left in the plan after the current chunk. */
export function minutesAfterCurrent(plan: FocusPlan): number {
	return plan.chunks.slice(plan.current + 1).reduce((sum, chunk) => sum + chunk.minutes, 0);
}

/**
 * What to suggest focusing on next, from a day's items: a timeblock under way, then
 * timeblocks and timed tasks still to start (soonest first), then other open tasks with
 * an estimate. Events, finished items and anything already over are left out.
 */
export function focusCandidates(items: DayItem[], now: number, limit = 3): DayItem[] {
	const open = items.filter(
		(item) => item.kind !== "event" && !item.done && (!item.interval || item.interval.end > now)
	);
	const rank = (item: DayItem): [number, number] => {
		if (item.interval && item.interval.start <= now) return [0, item.interval.start];
		if (item.interval) return [1, item.interval.start];
		return [2, 0];
	};
	return open
		.filter((item) => item.interval || item.task?.timeEstimate)
		.sort((a, b) => {
			const [ra, ta] = rank(a);
			const [rb, tb] = rank(b);
			return ra - rb || ta - tb;
		})
		.slice(0, limit);
}
