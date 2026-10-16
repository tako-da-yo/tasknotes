import type { TaskInfo } from "../types";
import type { EnergyKind, EnergySettings } from "../types/settings";
import type { DayItem } from "./dayPlan";

/**
 * One item's effect on the day. A task can have a spent part (time tracked on the date,
 * or the size of a task completed that day) and a planned part (what is still left);
 * both are merged into one contribution so the effects list shows one row per item.
 * `minutes`/`points` are the totals (projected); `doneMinutes`/`donePoints` the spent
 * part (now). `assumedSize` marks a planned or completed size taken from the default.
 */
export interface EnergyContribution {
	item: DayItem;
	kind: EnergyKind;
	minutes: number;
	points: number;
	doneMinutes: number;
	donePoints: number;
	assumedSize: boolean;
}

export interface DayEnergy {
	date: string;
	projected: number;
	now: number;
	hours: { spark: number; steady: number; drain: number };
	contributions: EnergyContribution[];
	topDrains: EnergyContribution[];
	assumedSizeCount: number;
	level: "low" | "ok" | "high";
	hasSignal: boolean;
}

export interface EnergyOptions {
	date: string;
	energy: EnergySettings;
	kindOf(contexts: string[]): EnergyKind;
	sizeOpenTask(task: TaskInfo): number | null;
	defaultEstimate: number | null;
}

const FALLBACK_TASK_MINUTES = 30;
const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const round1 = (v: number) => Math.round(v * 10) / 10;

export function levelOf(value: number, lowThreshold: number): "low" | "ok" | "high" {
	if (value < lowThreshold) return "low";
	if (value < 70) return "ok";
	return "high";
}

function rate(kind: EnergyKind, e: EnergySettings): number {
	if (kind === "spark") return e.sparkPerHour;
	if (kind === "drain") return -e.drainPerHour;
	return -e.steadyPerHour;
}

interface Size { done: number; planned: number; assumed: boolean }

/** Energy spent on a date is time tracked on that date; what is left is planned. */
function taskSize(item: DayItem, task: TaskInfo, opts: EnergyOptions): Size {
	const fallback = opts.defaultEstimate ?? FALLBACK_TASK_MINUTES;
	const today = item.trackedOnDateMinutes;
	if (item.done) {
		if (today > 0) return { done: today, planned: 0, assumed: false };
		// Tracked only on other days: that energy was spent then.
		if (item.trackedMinutes > 0) return { done: 0, planned: 0, assumed: false };
		if (task.timeEstimate) return { done: task.timeEstimate, planned: 0, assumed: false };
		return { done: fallback, planned: 0, assumed: true };
	}
	const size = opts.sizeOpenTask(task);
	const planned = Math.max(0, (size ?? fallback) - item.trackedMinutes);
	return { done: today, planned, assumed: size === null && planned > 0 };
}

function sizeOf(item: DayItem, kind: EnergyKind, opts: EnergyOptions): Size | null {
	if (item.kind === "task" && item.task) return taskSize(item, item.task, opts);
	let minutes: number;
	if (item.allDay) {
		if (kind === "steady") return null;
		minutes = opts.energy.allDayMinutes;
	} else if (item.interval) {
		minutes = (item.interval.end - item.interval.start) / 60_000;
	} else {
		return null;
	}
	return item.done ? { done: minutes, planned: 0, assumed: false } : { done: 0, planned: minutes, assumed: false };
}

export function computeDayEnergy(items: DayItem[], opts: EnergyOptions): DayEnergy {
	const coveredTasks = new Set<string>();
	for (const item of items) {
		if (item.kind === "timeblock" && item.contexts.length > 0) for (const p of item.attachments ?? []) coveredTasks.add(p);
	}

	const contributions: EnergyContribution[] = [];
	const hours = { spark: 0, steady: 0, drain: 0 };
	let assumedSizeCount = 0;
	let projectedSum = 0;
	let nowSum = 0;

	for (const item of items) {
		if (item.kind === "timeblock" && item.contexts.length === 0) continue;
		if (item.kind === "task" && coveredTasks.has(item.ref)) continue;
		const kind = opts.kindOf(item.contexts);
		const size = sizeOf(item, kind, opts);
		if (!size) continue;
		const minutes = size.done + size.planned;
		if (minutes <= 0) continue;
		const r = rate(kind, opts.energy);
		const donePoints = round1((r * size.done) / 60);
		const points = round1(donePoints + round1((r * size.planned) / 60));
		hours[kind] += minutes / 60;
		if (size.assumed) assumedSizeCount++;
		projectedSum += points;
		nowSum += donePoints;
		contributions.push({ item, kind, minutes, points, doneMinutes: size.done, donePoints, assumedSize: size.assumed });
	}

	contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || b.minutes - a.minutes);
	const projected = clamp(opts.energy.baseline + projectedSum);

	return {
		date: opts.date,
		projected,
		now: clamp(opts.energy.baseline + nowSum),
		hours: { spark: round1(hours.spark), steady: round1(hours.steady), drain: round1(hours.drain) },
		contributions,
		topDrains: contributions.filter((c) => c.points < 0).sort((a, b) => a.points - b.points).slice(0, 3),
		assumedSizeCount,
		level: levelOf(projected, opts.energy.lowThreshold),
		hasSignal: contributions.some((c) => c.kind !== "steady"),
	};
}
