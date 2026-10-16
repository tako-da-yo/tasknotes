import { computeDayEnergy, levelOf, EnergyOptions } from "../../../src/core/energyModel";
import type { DayItem } from "../../../src/core/dayPlan";
import { TaskFactory } from "../../helpers/mock-factories";

const H = 3_600_000;
const energy = { enabled: true, baseline: 70, sparkPerHour: 10, drainPerHour: 10, steadyPerHour: 0, lowThreshold: 25, allDayMinutes: 240 };
const kinds: Record<string, "spark" | "drain" | "steady"> = { fun: "spark", admin: "drain", work: "steady" };
const opts = (o: Partial<EnergyOptions> = {}): EnergyOptions => ({
	date: "2026-10-15", energy,
	kindOf: (cs) => kinds[cs[0]] ?? "steady",
	sizeOpenTask: (t) => t.timeEstimate ?? null,
	defaultEstimate: null,
	...o,
});
const timed = (kind: DayItem["kind"], ctx: string, hours: number, done = false, extra: Partial<DayItem> = {}): DayItem => ({
	kind, ref: `${kind}-${ctx}-${hours}`, date: "2026-10-15", allDay: false, contexts: [ctx], done, trackedMinutes: 0,
	interval: { start: 0, end: hours * H }, ...extra,
});
const task = (ctx: string, estimate: number | undefined, extra: Partial<DayItem> = {}, taskExtra: { totalTrackedTime?: number } = {}): DayItem => ({
	kind: "task", ref: `t-${ctx}-${estimate}.md`, date: "2026-10-15", allDay: true, contexts: [ctx], done: false,
	trackedMinutes: taskExtra.totalTrackedTime ?? 0,
	task: TaskFactory.createTask({ path: `t-${ctx}-${estimate}.md`, contexts: [ctx], timeEstimate: estimate, ...taskExtra }), ...extra,
});

describe("computeDayEnergy", () => {
	it("matches the spec example: 3h drain, 4h steady, 1h spark -> 50", () => {
		const e = computeDayEnergy([timed("event", "admin", 3), timed("event", "work", 4), timed("event", "fun", 1)], opts());
		expect(e.projected).toBe(50);
		expect(e.hours).toEqual({ spark: 1, steady: 4, drain: 3 });
		expect(e.level).toBe("ok");
		expect(e.hasSignal).toBe(true);
	});
	it("now counts only done items", () => {
		const e = computeDayEnergy([timed("event", "admin", 2, true), timed("event", "admin", 2)], opts());
		expect(e.now).toBe(50);
		expect(e.projected).toBe(30);
	});
	it("clamps to 0 and 100", () => {
		expect(computeDayEnergy([timed("event", "admin", 14)], opts()).projected).toBe(0);
		expect(computeDayEnergy([timed("event", "fun", 10)], opts()).projected).toBe(100);
	});
	it("steady costs steadyPerHour", () => {
		expect(computeDayEnergy([timed("event", "work", 10)], opts({ energy: { ...energy, steadyPerHour: 2 } })).projected).toBe(50);
	});
	it("treats unknown contexts as steady and reports no signal", () => {
		const e = computeDayEnergy([timed("event", "renamed-context", 3)], opts());
		expect(e).toMatchObject({ projected: 70, hasSignal: false });
	});
	it("sizes open tasks by remaining estimate and completed tasks by tracked time", () => {
		const e = computeDayEnergy([
			task("admin", 120, {}, { totalTrackedTime: 60 }),            // remaining 60m -> -10
			task("admin", 60, { done: true }, { totalTrackedTime: 120 }), // tracked 120m -> -20
		], opts());
		expect(e.projected).toBe(40);
		expect(e.now).toBe(50);
	});
	it("uses default estimate or 30 for unestimated tasks and counts them as assumed", () => {
		expect(computeDayEnergy([task("admin", undefined)], opts()).assumedSizeCount).toBe(1);
		expect(computeDayEnergy([task("admin", undefined)], opts()).projected).toBe(65);
		expect(computeDayEnergy([task("admin", undefined)], opts({ defaultEstimate: 60 })).projected).toBe(60);
	});
	it("counts all-day events only when spark or drain", () => {
		const allDay = (ctx: string): DayItem => ({ kind: "event", ref: ctx, date: "2026-10-15", allDay: true, contexts: [ctx], done: false, trackedMinutes: 0 });
		expect(computeDayEnergy([allDay("work")], opts()).contributions).toHaveLength(0);
		expect(computeDayEnergy([allDay("admin")], opts()).projected).toBe(30);
	});
	it("skips timeblocks without context, and tasks attached to timeblocks with context", () => {
		const tb = timed("timeblock", "admin", 2, false, { attachments: ["t-admin-60.md"] });
		const tbNoCtx = timed("timeblock", "", 2, false, { contexts: [] });
		const attached = task("admin", 60);
		const e = computeDayEnergy([tb, tbNoCtx, attached], opts());
		expect(e.contributions.map((c) => c.item.kind)).toEqual(["timeblock"]);
		expect(e.projected).toBe(50);
	});
	it("orders contributions by impact and lists top drains", () => {
		const e = computeDayEnergy([timed("event", "admin", 1), timed("event", "fun", 3), timed("event", "admin", 2)], opts());
		expect(e.contributions.map((c) => c.points)).toEqual([30, -20, -10]);
		expect(e.topDrains.map((c) => c.points)).toEqual([-20, -10]);
	});
});

describe("levelOf", () => {
	it("uses lowThreshold and 70", () => {
		expect(levelOf(24, 25)).toBe("low");
		expect(levelOf(25, 25)).toBe("ok");
		expect(levelOf(69, 25)).toBe("ok");
		expect(levelOf(70, 25)).toBe("high");
	});
});
