import type { TaskInfo } from "../types";
import type { EnergyKind, EnergySettings } from "../types/settings";
import type { DayItem } from "./dayPlan";

export interface EnergyContribution { item: DayItem; kind: EnergyKind; minutes: number; points: number; assumedSize: boolean }

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

function sizeOf(item: DayItem, kind: EnergyKind, opts: EnergyOptions): { minutes: number; assumed: boolean } | null {
	if (item.kind === "task" && item.task) {
		const t = item.task;
		const fallback = opts.defaultEstimate ?? FALLBACK_TASK_MINUTES;
		if (item.done) {
			if (item.trackedMinutes > 0) return { minutes: item.trackedMinutes, assumed: false };
			if (t.timeEstimate) return { minutes: t.timeEstimate, assumed: false };
			return { minutes: fallback, assumed: true };
		}
		const size = opts.sizeOpenTask(t);
		if (size === null) return { minutes: fallback, assumed: true };
		return { minutes: Math.max(0, size - item.trackedMinutes), assumed: false };
	}
	if (item.allDay) {
		return kind === "steady" ? null : { minutes: opts.energy.allDayMinutes, assumed: false };
	}
	if (!item.interval) return null;
	return { minutes: (item.interval.end - item.interval.start) / 60_000, assumed: false };
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
		if (!size || size.minutes <= 0) continue;
		const h = size.minutes / 60;
		const points = Math.round(rate(kind, opts.energy) * h * 10) / 10;
		hours[kind] += h;
		if (size.assumed) assumedSizeCount++;
		projectedSum += points;
		if (item.done) nowSum += points;
		contributions.push({ item, kind, minutes: size.minutes, points, assumedSize: size.assumed });
	}

	contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points) || b.minutes - a.minutes);
	const projected = clamp(opts.energy.baseline + projectedSum);
	const round1 = (v: number) => Math.round(v * 10) / 10;

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
