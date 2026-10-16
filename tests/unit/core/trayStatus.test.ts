import { currentAndNext, formatWait, trayStatus, TrayStatusInput } from "../../../src/core/trayStatus";
import type { DayItem } from "../../../src/core/dayPlan";
import type { PomodoroState } from "../../../src/types";

const at = (h: number, m = 0) => new Date(2026, 9, 16, h, m).getTime();
const clock = (ms: number) => {
	const d = new Date(ms);
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const t = (k: string, p: Record<string, string | number> = {}) =>
	`${k}${Object.keys(p).length ? JSON.stringify(p) : ""}`;

const idle: PomodoroState = { isRunning: false, timeRemaining: 1500 };
const session = (type: "work" | "short-break" | "long-break") => ({
	id: "s", type, completed: false, plannedDuration: 25, startTime: "", activePeriods: [],
});
const event = (ref: string, start: number, end: number, over: Partial<DayItem> = {}): DayItem => ({
	kind: "event", ref, title: ref, date: "2026-10-16", allDay: false, interval: { start, end },
	contexts: [], done: false, trackedMinutes: 0, trackedOnDateMinutes: 0, ...over,
});

const input = (over: Partial<TrayStatusInput> = {}): TrayStatusInput => ({
	energy: null,
	pomodoro: idle,
	schedule: { current: null, next: null },
	now: at(10),
	formatClock: clock,
	t,
	...over,
});

describe("trayStatus", () => {
	it("is empty when there is nothing to show", () => {
		expect(trayStatus(input()).title).toBe("");
	});

	it("shows the battery like the status bar", () => {
		const energy = { projected: 41, now: 62, level: "ok" as const, hasSignal: true };
		expect(trayStatus(input({ energy })).title).toBe("🔋41%");
		expect(trayStatus(input({ energy: { ...energy, level: "low", projected: 12 } })).title).toBe("🪫12%");
		expect(trayStatus(input({ energy: { ...energy, hasSignal: false } })).title).toBe("");
	});

	it("shows a running, paused or break timer in whole minutes left", () => {
		const running = { isRunning: true, timeRemaining: 61, currentSession: session("work") };
		expect(trayStatus(input({ pomodoro: running })).title).toBe("🍅 2m");
		expect(trayStatus(input({ pomodoro: { ...running, isRunning: false } })).title).toBe("⏸ 2m");
		expect(trayStatus(input({ pomodoro: { ...running, currentSession: session("short-break") } })).title).toBe("☕ 2m");
	});

	it("adds the focus session's chunk position", () => {
		const pomodoro: PomodoroState = {
			isRunning: true,
			timeRemaining: 600,
			currentSession: session("work"),
			plan: {
				id: "p", source: { kind: "task", path: "a.md" }, title: "Report", energyKind: "steady", plannedMinutes: 60,
				chunks: [
					{ type: "work", minutes: 28, status: "done" },
					{ type: "short-break", minutes: 5, status: "done" },
					{ type: "work", minutes: 27, status: "active" },
				],
				current: 2,
			},
		};
		expect(trayStatus(input({ pomodoro })).title).toBe("🍅 10m 2/2");
	});

	it("shows what is on now, a separator, then what is next and how long until it starts", () => {
		const now = event("Standup", at(9, 45), at(10, 15));
		const next = event("Quarterly planning with the whole team", at(11, 30), at(12));
		expect(trayStatus(input({ schedule: { current: now, next } })).title).toBe(
			'● Standup → 10:15 | tray.title.next{"title":"Quarterly planning…","wait":"1h 30m"}'
		);
		expect(trayStatus(input({ schedule: { current: null, next } })).title).toBe(
			'tray.title.next{"title":"Quarterly planning…","wait":"1h 30m"}'
		);
		expect(trayStatus(input({ schedule: { current: now, next: null } })).title).toBe("● Standup → 10:15");
	});

	it("joins the parts and lists them in full for the menu", () => {
		const status = trayStatus(
			input({
				energy: { projected: 41, now: 62, level: "ok", hasSignal: true },
				pomodoro: { isRunning: true, timeRemaining: 300, currentSession: session("work") },
				schedule: { current: null, next: event("Standup", at(11), at(11, 15)) },
			})
		);
		expect(status.title).toBe('🔋41% · 🍅 5m · tray.title.next{"title":"Standup","wait":"1h"}');
		expect(status.lines).toEqual([
			'tray.battery{"now":62,"projected":41}',
			'tray.pomodoro.work{"minutes":5}',
			'tray.event.next{"title":"Standup","start":"11:00","wait":"1h"}',
		]);
	});
});

describe("formatWait", () => {
	it("rounds up to the minute and uses hours past an hour", () => {
		expect(formatWait(30_000)).toBe("1m");
		expect(formatWait(25 * 60_000)).toBe("25m");
		expect(formatWait(65 * 60_000)).toBe("1h 5m");
		expect(formatWait(120 * 60_000)).toBe("2h");
	});
});

describe("currentAndNext", () => {
	const task = (ref: string, start: number, end: number, over: Partial<DayItem> = {}) =>
		event(ref, start, end, { kind: "task", ...over });

	it("takes the item under way that ends first, and the next one to start", () => {
		const items = [
			event("Later", at(14), at(15)),
			event("Long", at(9), at(12)),
			task("Now", at(9, 30), at(10, 30)),
			task("Soon", at(11), at(11, 30)),
		];
		expect(currentAndNext(items, at(10))).toEqual({ current: items[2], next: items[3] });
		expect(currentAndNext(items, at(10, 45))).toEqual({ current: items[1], next: items[3] });
		expect(currentAndNext(items, at(16))).toEqual({ current: null, next: null });
	});

	it("counts timeblocks", () => {
		const block = { ...event("Deep work", at(9), at(11)), kind: "timeblock" as const };
		const next = { ...event("Admin", at(13), at(14)), kind: "timeblock" as const };
		expect(currentAndNext([block, next], at(10))).toEqual({ current: block, next });
	});

	it("leaves out all-day items, done tasks and working locations", () => {
		const items = [
			event("All day", at(0), at(23, 59), { allDay: true }),
			task("Done", at(11), at(12), { done: true }),
			event("Office", at(9), at(17), { eventType: "workingLocation" }),
			event("Home", at(17), at(18), { eventType: "workingLocation" }),
		];
		expect(currentAndNext(items, at(10))).toEqual({ current: null, next: null });
	});
});
