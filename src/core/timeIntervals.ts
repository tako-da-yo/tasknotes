export interface Interval { start: number; end: number }

export function clip(i: Interval, window: Interval): Interval | null {
	const start = Math.max(i.start, window.start);
	const end = Math.min(i.end, window.end);
	return end > start ? { start, end } : null;
}

export function mergeIntervals(list: Interval[]): Interval[] {
	const sorted = [...list].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
	const out: Interval[] = [];
	for (const i of sorted) {
		const last = out[out.length - 1];
		if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
		else out.push({ ...i });
	}
	return out;
}

export function totalMinutes(list: Interval[]): number {
	return mergeIntervals(list).reduce((sum, i) => sum + (i.end - i.start), 0) / 60_000;
}

export function localTime(date: string, hhmm: string): number {
	const [y, mo, d] = date.split("-").map(Number);
	const [h, mi] = hhmm.split(":").map(Number);
	return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

export function localDayBounds(date: string): Interval {
	const [y, mo, d] = date.split("-").map(Number);
	return { start: new Date(y, mo - 1, d).getTime(), end: new Date(y, mo - 1, d + 1).getTime() };
}
