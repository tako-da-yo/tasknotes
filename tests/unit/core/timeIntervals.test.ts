import { clip, mergeIntervals, totalMinutes, localDayBounds, localTime } from "../../../src/core/timeIntervals";

const m = (min: number) => min * 60_000;

describe("timeIntervals", () => {
	it("clips to a window and drops non-overlapping", () => {
		expect(clip({ start: m(0), end: m(100) }, { start: m(50), end: m(200) })).toEqual({ start: m(50), end: m(100) });
		expect(clip({ start: m(0), end: m(10) }, { start: m(50), end: m(200) })).toBeNull();
	});
	it("merges overlapping, nested and touching intervals", () => {
		expect(mergeIntervals([
			{ start: m(60), end: m(120) }, { start: m(0), end: m(30) }, { start: m(30), end: m(45) },
			{ start: m(70), end: m(80) }, { start: m(100), end: m(150) },
		])).toEqual([{ start: m(0), end: m(45) }, { start: m(60), end: m(150) }]);
	});
	it("totals merged minutes", () => {
		expect(totalMinutes([{ start: m(0), end: m(60) }, { start: m(30), end: m(90) }])).toBe(90);
	});
	it("builds local day bounds and times (TZ=UTC in jest)", () => {
		expect(localDayBounds("2026-10-15")).toEqual({ start: Date.parse("2026-10-15T00:00:00Z"), end: Date.parse("2026-10-16T00:00:00Z") });
		expect(localTime("2026-10-15", "09:30")).toBe(Date.parse("2026-10-15T09:30:00Z"));
	});
});
