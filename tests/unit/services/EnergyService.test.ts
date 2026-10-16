import { EnergyService } from "../../../src/services/EnergyService";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import type { DayItem } from "../../../src/core/dayPlan";
import { TaskFactory } from "../../helpers/mock-factories";

const H = 3_600_000;
const settings = (energy?: "spark" | "drain", o: { enabled?: boolean; contextEnabled?: boolean; fallbackContext?: string } = {}) => ({
	...DEFAULT_SETTINGS,
	energy: { ...DEFAULT_SETTINGS.energy, enabled: o.enabled ?? true },
	fallbackContext: o.fallbackContext,
	contextGroups: [{ id: "g", name: "G", contexts: [{ id: "c", name: "admin", color: "#000", enabled: o.contextEnabled ?? true, energy }] }],
});

describe("EnergyService", () => {
	const item: DayItem = { kind: "event", ref: "e", date: "2026-10-15", allDay: false, contexts: ["@admin"], done: false, trackedMinutes: 0, trackedOnDateMinutes: 0, interval: { start: 0, end: 2 * H } };
	const dayPlan = {
		getDayItems: jest.fn(async (): Promise<DayItem[]> => [item]),
		getDayItemsInRange: jest.fn(async () => new Map([["2026-10-15", [item]], ["2026-10-16", []]])),
		onChange: jest.fn(() => () => undefined),
	};
	const svc = (s: unknown, o: { calibratedMinutes?: () => number | null; now?: () => number } = {}) =>
		new EnergyService({
			dayPlan: dayPlan as never,
			getSettings: () => s as never,
			calibratedMinutes: o.calibratedMinutes ?? (() => null),
			now: o.now ?? (() => 0),
		});

	afterEach(() => dayPlan.getDayItems.mockImplementation(async () => [item]));

	it("is inactive until a context has spark or drain", () => {
		expect(svc(settings()).isActive()).toBe(false);
		expect(svc(settings("drain")).isActive()).toBe(true);
	});
	it("is inactive when energy is turned off, even with a drain context", () => {
		expect(svc(settings("drain", { enabled: false })).isActive()).toBe(false);
	});
	it("is inactive when the only drain context is disabled", () => {
		expect(svc(settings("drain", { contextEnabled: false })).isActive()).toBe(false);
	});
	it("resolves context energy with resolveContext (case and @ insensitive)", async () => {
		expect((await svc(settings("drain")).getDayEnergy("2026-10-15")).projected).toBe(50);
	});
	it("gives an item with no matching context the fallback context's energy", async () => {
		dayPlan.getDayItems.mockImplementation(async () => [{ ...item, contexts: ["unknown"] }]);
		expect((await svc(settings("drain", { fallbackContext: "admin" })).getDayEnergy("2026-10-15")).projected).toBe(50);
		expect((await svc(settings("drain")).getDayEnergy("2026-10-15")).projected).toBe(70);
	});
	it("computes a range with one day-plan range call", async () => {
		dayPlan.getDayItemsInRange.mockClear();
		const range = await svc(settings("drain")).getEnergyInRange("2026-10-15", "2026-10-16");
		expect(dayPlan.getDayItemsInRange).toHaveBeenCalledTimes(1);
		expect(range.get("2026-10-16")!.hasSignal).toBe(false);
	});
	it("counts an event or timeblock that ended after collection as done", async () => {
		const tb: DayItem = { ...item, kind: "timeblock", ref: "tb", interval: { start: 2 * H, end: 3 * H } };
		dayPlan.getDayItems.mockImplementation(async () => [item, tb]);
		const before = await svc(settings("drain"), { now: () => H }).getDayEnergy("2026-10-15");
		expect(before.now).toBe(70);
		const after = await svc(settings("drain"), { now: () => 3 * H }).getDayEnergy("2026-10-15");
		expect(after.now).toBe(40);
		expect(after.projected).toBe(40);
	});
	it("treats a calibrated value of 0 as no calibration and uses the estimate", async () => {
		const task = TaskFactory.createTask({ path: "t.md", contexts: ["admin"], timeEstimate: 120 });
		const taskItem: DayItem = { kind: "task", ref: "t.md", date: "2026-10-15", allDay: true, contexts: ["admin"], done: false, trackedMinutes: 0, trackedOnDateMinutes: 0, task };
		dayPlan.getDayItems.mockImplementation(async () => [taskItem]);
		const s = { ...settings("drain"), calibration: { ...DEFAULT_SETTINGS.calibration, applyToPlanning: true } };
		const e = await svc(s, { calibratedMinutes: () => 0 }).getDayEnergy("2026-10-15");
		expect(e.projected).toBe(50);
		expect(e.assumedSizeCount).toBe(0);
	});
});
