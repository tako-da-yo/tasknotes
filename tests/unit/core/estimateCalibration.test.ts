import { computeCalibration, factorFor, calibratedMinutes, sizeBucket, shouldShowHint } from "../../../src/core/estimateCalibration";
import { TaskFactory } from "../../helpers/mock-factories";

const isCompleted = (s: string) => s === "done";
const opts = { today: "2026-10-15", windowDays: 90, isCompleted };
const done = (estimate: number, tracked: number, extra: object = {}) =>
	TaskFactory.createTask({ status: "done", completedDate: "2026-10-10", timeEstimate: estimate, totalTrackedTime: tracked, ...extra });

describe("sizeBucket", () => {
	it("uses inclusive boundaries 30 and 120", () => {
		expect(sizeBucket(30)).toBe("small");
		expect(sizeBucket(31)).toBe("medium");
		expect(sizeBucket(120)).toBe("medium");
		expect(sizeBucket(121)).toBe("large");
	});
});

describe("computeCalibration", () => {
	it("returns null overall under 5 samples", () => {
		const r = computeCalibration([done(60, 90), done(60, 90)], opts);
		expect(r.overall).toBeNull();
		expect(r.sampleCount).toBe(2);
	});
	it("uses the median ratio and quartiles", () => {
		// ratios: 1, 1.5, 2, 2, 3  -> median 2, p25 1.5, p75 2
		const tasks = [done(60, 60), done(60, 90), done(60, 120), done(60, 120), done(60, 180)];
		const r = computeCalibration(tasks, opts);
		expect(r.overall).toEqual({ factor: 2, n: 5, p25: 1.5, p75: 2 });
	});
	it("drops outliers below 0.2 and above 10", () => {
		const tasks = [done(60, 60), done(60, 60), done(60, 60), done(60, 60), done(60, 60), done(60, 6), done(10, 200)];
		expect(computeCalibration(tasks, opts).sampleCount).toBe(5);
	});
	it("excludes tasks outside the window, open tasks, and tasks missing estimate or tracking", () => {
		const tasks = [
			done(60, 60, { completedDate: "2026-07-01" }),
			TaskFactory.createTask({ status: "open", timeEstimate: 60, totalTrackedTime: 60 }),
			done(0, 60),
			done(60, 0),
		];
		expect(computeCalibration(tasks, opts).sampleCount).toBe(0);
	});
	it("groups by context only when n >= 5", () => {
		const call = Array.from({ length: 5 }, () => done(20, 60, { contexts: ["@Calls"] }));
		const other = Array.from({ length: 2 }, () => done(60, 60, { contexts: ["errands"] }));
		const r = computeCalibration([...call, ...other], opts);
		expect(r.byContext.calls.factor).toBe(3);
		expect(r.byContext.errands).toBeUndefined();
	});
});

describe("factorFor / calibratedMinutes", () => {
	const small = Array.from({ length: 5 }, () => done(20, 40));            // small bucket factor 2
	const ctx = Array.from({ length: 5 }, () => done(100, 150, { contexts: ["deep"] })); // context factor 1.5
	const r = computeCalibration([...small, ...ctx], opts);
	it("prefers context, then size, then overall", () => {
		expect(factorFor(r, { timeEstimate: 20, contexts: ["deep"] })).toEqual({ factor: 1.5, source: "context" });
		expect(factorFor(r, { timeEstimate: 20, contexts: [] })).toEqual({ factor: 2, source: "size" });
		expect(factorFor(r, { timeEstimate: 500, contexts: [] })?.source).toBe("overall");
	});
	it("rounds calibrated minutes to 5 with a minimum of 5", () => {
		expect(calibratedMinutes(r, { timeEstimate: 22, contexts: [] })).toBe(45); // 44 -> 45
		expect(calibratedMinutes(r, { timeEstimate: 1, contexts: [] })).toBe(5);
	});
	it("returns null without an estimate", () => {
		expect(calibratedMinutes(r, { timeEstimate: undefined, contexts: [] })).toBeNull();
	});
});

describe("shouldShowHint", () => {
	it("needs at least 15% difference", () => {
		expect(shouldShowHint(1.1)).toBe(false);
		expect(shouldShowHint(1.15)).toBe(true);
		expect(shouldShowHint(0.8)).toBe(true);
	});
});
