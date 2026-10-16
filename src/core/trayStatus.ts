import type { PomodoroState } from "../types";
import type { DayEnergy } from "./energyModel";
import type { DayItem } from "./dayPlan";
import { workProgress } from "./focusPlan";

/** What is under way now and what starts next today: timed tasks, timeblocks and calendar events. */
export interface TraySchedule {
	current: DayItem | null;
	next: DayItem | null;
}

export interface TrayStatusInput {
	energy: Pick<DayEnergy, "projected" | "now" | "level" | "hasSignal"> | null;
	pomodoro: PomodoroState;
	schedule: TraySchedule;
	now: number;
	formatClock: (ms: number) => string;
	t: (key: string, params?: Record<string, string | number>) => string;
}

export interface TrayStatus {
	/** Short text beside the menu bar icon. */
	title: string;
	/** One full line per part, for the tooltip and menu. */
	lines: string[];
}

const MAX_TITLE = 20;

function shorten(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// Whole minutes left, rounded up, so the menu bar changes once a minute rather than every second.
function minutesLeft(seconds: number): number {
	return Math.ceil(Math.max(0, seconds) / 60);
}

/** "25m", "1h 5m" or "2h": time until something starts, rounded up to the minute. */
export function formatWait(ms: number): string {
	const minutes = Math.max(1, Math.ceil(ms / 60_000));
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The timed task, timeblock or calendar event under way now (the one ending first) and
 * the next one to start today. Done tasks, all-day items and working locations (which
 * say where you are rather than what you are doing) are left out.
 */
export function currentAndNext(items: DayItem[], now: number): TraySchedule {
	const timed = items.flatMap((item) => {
		const scheduled =
			(item.kind === "task" && !item.done) ||
			item.kind === "timeblock" ||
			(item.kind === "event" && item.eventType !== "workingLocation");
		return scheduled && !item.allDay && item.interval && item.interval.end > now
			? [{ item, start: item.interval.start, end: item.interval.end }]
			: [];
	});
	const current = timed.filter((e) => e.start <= now).sort((a, b) => a.end - b.end)[0];
	const next = timed.filter((e) => e.start > now).sort((a, b) => a.start - b.start)[0];
	return { current: current?.item ?? null, next: next?.item ?? null };
}

function titleOf(item: DayItem): string {
	return item.title || item.task?.title || item.ref;
}

/** Menu bar text and menu lines for the battery, the Pomodoro or focus session, and what is on now and next. */
export function trayStatus(input: TrayStatusInput): TrayStatus {
	const parts: string[] = [];
	const lines: string[] = [];
	const { t } = input;

	const e = input.energy;
	if (e?.hasSignal) {
		parts.push(`${e.level === "low" ? "🪫" : "🔋"}${e.projected}%`);
		lines.push(t("tray.battery", { now: e.now, projected: e.projected }));
	}

	const p = input.pomodoro;
	const session = p.currentSession;
	if (session) {
		const icon = !p.isRunning ? "⏸" : session.type === "work" ? "🍅" : "☕";
		let text = `${icon} ${minutesLeft(p.timeRemaining)}m`;
		if (p.plan) {
			const { index, count } = workProgress(p.plan);
			if (count > 1) text += ` ${index}/${count}`;
		}
		parts.push(text);
		const key = !p.isRunning ? "tray.pomodoro.paused" : session.type === "work" ? "tray.pomodoro.work" : "tray.pomodoro.break";
		lines.push(t(key, { minutes: minutesLeft(p.timeRemaining) }));
		if (p.plan) lines.push(t("tray.pomodoro.focus", { title: p.plan.title }));
	}

	const { current, next } = input.schedule;
	const schedule: string[] = [];
	if (current?.interval) {
		const title = titleOf(current);
		const end = input.formatClock(current.interval.end);
		schedule.push(`● ${shorten(title, MAX_TITLE)} → ${end}`);
		lines.push(t("tray.event.now", { title, end }));
	}
	if (next?.interval) {
		const title = titleOf(next);
		const wait = formatWait(next.interval.start - input.now);
		schedule.push(t("tray.title.next", { title: shorten(title, MAX_TITLE), wait }));
		lines.push(t("tray.event.next", { title, start: input.formatClock(next.interval.start), wait }));
	}
	if (schedule.length) parts.push(schedule.join(" | "));

	return { title: parts.join(" · "), lines };
}
