import type { TaskInfo } from "../types";

export interface CalibrationGroup {
	factor: number;
	n: number;
	p25: number;
	p75: number;
}
export type SizeBucket = "small" | "medium" | "large";
export interface CalibrationResult {
	overall: CalibrationGroup | null;
	bySize: Record<SizeBucket, CalibrationGroup | null>;
	byContext: Record<string, CalibrationGroup>;
	byProject: Record<string, CalibrationGroup>;
	windowDays: number;
	sampleCount: number;
}

export const MIN_SAMPLES = 5;
const MIN_RATIO = 0.2;
const MAX_RATIO = 10;

export function sizeBucket(estimateMinutes: number): SizeBucket {
	if (estimateMinutes <= 30) return "small";
	if (estimateMinutes <= 120) return "medium";
	return "large";
}

const normalizeContext = (c: string) => c.trim().replace(/^@/, "").toLowerCase();

function quantile(sorted: number[], q: number): number {
	const pos = (sorted.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function group(ratios: number[]): CalibrationGroup | null {
	if (ratios.length < MIN_SAMPLES) return null;
	const sorted = [...ratios].sort((a, b) => a - b);
	const round = (v: number) => Math.round(v * 100) / 100;
	return {
		factor: round(quantile(sorted, 0.5)),
		n: sorted.length,
		p25: round(quantile(sorted, 0.25)),
		p75: round(quantile(sorted, 0.75)),
	};
}

function windowStart(today: string, days: number): string {
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - days);
	return d.toISOString().slice(0, 10);
}

export function computeCalibration(
	tasks: TaskInfo[],
	opts: { today: string; windowDays: number; isCompleted: (s: string) => boolean }
): CalibrationResult {
	const since = windowStart(opts.today, opts.windowDays);
	const all: number[] = [];
	const size: Record<SizeBucket, number[]> = { small: [], medium: [], large: [] };
	const ctx: Record<string, number[]> = {};
	const proj: Record<string, number[]> = {};

	for (const task of tasks) {
		const estimate = task.timeEstimate ?? 0;
		const tracked = task.totalTrackedTime ?? 0;
		const completed = task.completedDate?.slice(0, 10);
		if (
			!opts.isCompleted(task.status) ||
			!completed ||
			completed < since ||
			completed > opts.today
		)
			continue;
		if (estimate <= 0 || tracked <= 0) continue;
		const ratio = tracked / estimate;
		if (ratio < MIN_RATIO || ratio > MAX_RATIO) continue;
		all.push(ratio);
		size[sizeBucket(estimate)].push(ratio);
		const c = task.contexts?.[0];
		if (c) (ctx[normalizeContext(c)] ??= []).push(ratio);
		const p = task.projects?.[0];
		if (p) (proj[p] ??= []).push(ratio);
	}

	const keep = (rec: Record<string, number[]>) => {
		const out: Record<string, CalibrationGroup> = {};
		for (const [k, v] of Object.entries(rec)) {
			const g = group(v);
			if (g) out[k] = g;
		}
		return out;
	};

	return {
		overall: group(all),
		bySize: {
			small: group(size.small),
			medium: group(size.medium),
			large: group(size.large),
		},
		byContext: keep(ctx),
		byProject: keep(proj),
		windowDays: opts.windowDays,
		sampleCount: all.length,
	};
}

export function factorFor(
	result: CalibrationResult,
	task: Pick<TaskInfo, "timeEstimate" | "contexts">
): { factor: number; source: "context" | "size" | "overall" } | null {
	const c = task.contexts?.[0];
	const byContext = c ? result.byContext[normalizeContext(c)] : undefined;
	if (byContext) return { factor: byContext.factor, source: "context" };
	const bySize = task.timeEstimate ? result.bySize[sizeBucket(task.timeEstimate)] : null;
	if (bySize) return { factor: bySize.factor, source: "size" };
	if (result.overall) return { factor: result.overall.factor, source: "overall" };
	return null;
}

export function calibratedMinutes(
	result: CalibrationResult,
	task: Pick<TaskInfo, "timeEstimate" | "contexts">
): number | null {
	if (!task.timeEstimate || task.timeEstimate <= 0) return null;
	const f = factorFor(result, task);
	if (!f) return null;
	return Math.max(5, Math.round((task.timeEstimate * f.factor) / 5) * 5);
}

export function shouldShowHint(factor: number): boolean {
	return Math.abs(factor - 1) >= 0.15 - 1e-9;
}
