import {
	planFocusChunks,
	FocusPlanOptions,
	plannedMinutesForTask,
	plannedMinutesForTimeblock,
	workProgress,
	minutesAfterCurrent,
	focusCandidates,
} from "../../../src/core/focusPlan";
import type { FocusPlan, TaskInfo } from "../../../src/types";
import type { DayItem } from "../../../src/core/dayPlan";

const opts: FocusPlanOptions = {
	splitThreshold: 30,
	chunkMinutes: { drain: 20, steady: 25, spark: 45 },
	shortBreak: 5,
	longBreak: 15,
	longBreakInterval: 4,
};

const shape = (minutes: number, kind: "drain" | "steady" | "spark", o = opts) =>
	planFocusChunks(minutes, kind, o).map((c) => `${c.type === "work" ? "w" : c.type === "short-break" ? "b" : "B"}${c.minutes}`);

const total = (minutes: number, kind: "drain" | "steady" | "spark", o = opts) =>
	planFocusChunks(minutes, kind, o).reduce((sum, c) => sum + c.minutes, 0);

describe("planFocusChunks", () => {
	it("keeps planned time at or under the split threshold as one chunk", () => {
		expect(shape(30, "steady")).toEqual(["w30"]);
		expect(shape(12, "drain")).toEqual(["w12"]);
	});

	it("splits by the energy kind's target with breaks inside the planned time", () => {
		expect(shape(100, "steady")).toEqual(["w22", "b5", "w21", "b5", "w21", "b5", "w21"]);
		expect(shape(75, "spark")).toEqual(["w35", "b5", "w35"]);
		expect(shape(50, "drain")).toEqual(["w23", "b5", "w22"]);
		expect(shape(120, "steady")).toEqual(["w27", "b5", "w26", "b5", "w26", "b5", "w26"]);
	});

	it("always fills exactly the planned time", () => {
		for (const minutes of [31, 47, 61, 90, 133, 240]) {
			for (const kind of ["drain", "steady", "spark"] as const) {
				expect(total(minutes, kind)).toBe(minutes);
			}
		}
	});

	it("makes every long-break-interval-th break a long break", () => {
		const chunks = planFocusChunks(200, "drain", opts);
		const breaks = chunks.filter((c) => c.type !== "work");
		expect(breaks[3].type).toBe("long-break");
		expect(breaks[3].minutes).toBe(15);
		expect(breaks.slice(0, 3).every((c) => c.type === "short-break")).toBe(true);
	});

	it("uses fewer chunks rather than work chunks under 10 minutes", () => {
		const tight = { ...opts, chunkMinutes: { drain: 5, steady: 5, spark: 5 } };
		const chunks = planFocusChunks(40, "drain", tight);
		expect(chunks.filter((c) => c.type === "work").every((c) => c.minutes >= 10)).toBe(true);
		expect(total(40, "drain", tight)).toBe(40);
	});

	it("starts every chunk as pending", () => {
		expect(planFocusChunks(60, "steady", opts).every((c) => c.status === "pending")).toBe(true);
	});

	it("returns no chunks for no planned time", () => {
		expect(planFocusChunks(0, "steady", opts)).toEqual([]);
	});
});

describe("planned time", () => {
	it("is a task's estimate minus tracked time, or null when nothing is left", () => {
		expect(plannedMinutesForTask(90, 25)).toBe(65);
		expect(plannedMinutesForTask(30, 30)).toBeNull();
		expect(plannedMinutesForTask(undefined, 0)).toBeNull();
	});

	it("is a timeblock's remaining minutes from now, or null once it has ended", () => {
		const start = Date.parse("2026-10-16T10:00:00");
		const end = Date.parse("2026-10-16T12:00:00");
		expect(plannedMinutesForTimeblock(start, end, Date.parse("2026-10-16T09:00:00"))).toBe(120);
		expect(plannedMinutesForTimeblock(start, end, Date.parse("2026-10-16T11:15:00"))).toBe(45);
		expect(plannedMinutesForTimeblock(start, end, Date.parse("2026-10-16T12:00:00"))).toBeNull();
	});
});

describe("plan progress", () => {
	const plan = (current: number): FocusPlan => ({
		id: "p",
		source: { kind: "task", path: "t.md" },
		title: "T",
		energyKind: "steady",
		plannedMinutes: 60,
		chunks: planFocusChunks(60, "steady", opts),
		current,
	});

	it("counts the current work chunk among all work chunks", () => {
		expect(workProgress(plan(0))).toEqual({ index: 1, count: 2 });
		expect(workProgress(plan(1))).toEqual({ index: 1, count: 2 });
		expect(workProgress(plan(2))).toEqual({ index: 2, count: 2 });
	});

	it("sums the minutes after the current chunk", () => {
		expect(minutesAfterCurrent(plan(0))).toBe(60 - plan(0).chunks[0].minutes);
		expect(minutesAfterCurrent(plan(2))).toBe(0);
	});
});

describe("focusCandidates", () => {
	const at = (h: number, m = 0) => new Date(2026, 9, 16, h, m).getTime();
	const item = (ref: string, over: Partial<DayItem>): DayItem => ({
		kind: "task", ref, date: "2026-10-16", allDay: true, contexts: [], done: false,
		trackedMinutes: 0, trackedOnDateMinutes: 0, ...over,
	});
	const estimated = { timeEstimate: 45 } as TaskInfo;

	it("puts a timeblock under way first, then the soonest timed items, then estimated tasks", () => {
		const items = [
			item("loose", { task: estimated }),
			item("later", { kind: "timeblock", allDay: false, interval: { start: at(15), end: at(16) } }),
			item("now", { kind: "timeblock", allDay: false, interval: { start: at(10), end: at(12) } }),
			item("soon", { allDay: false, interval: { start: at(13), end: at(13, 30) }, task: estimated }),
		];
		expect(focusCandidates(items, at(11), 4).map((i) => i.ref)).toEqual(["now", "soon", "later", "loose"]);
	});

	it("leaves out events, done items, past items and tasks without an estimate", () => {
		const items = [
			item("event", { kind: "event", allDay: false, interval: { start: at(12), end: at(13) } }),
			item("done", { done: true, task: estimated }),
			item("past", { kind: "timeblock", allDay: false, interval: { start: at(8), end: at(9) } }),
			item("unsized", { task: {} as TaskInfo }),
		];
		expect(focusCandidates(items, at(11))).toEqual([]);
	});
});
