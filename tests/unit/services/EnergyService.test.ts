import { EnergyService } from "../../../src/services/EnergyService";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

const H = 3_600_000;
const settings = (energy?: "spark" | "drain") => ({
	...DEFAULT_SETTINGS,
	contextGroups: [{ id: "g", name: "G", contexts: [{ id: "c", name: "admin", color: "#000", enabled: true, energy }] }],
});

describe("EnergyService", () => {
	const item = { kind: "event" as const, ref: "e", date: "2026-10-15", allDay: false, contexts: ["@admin"], done: false, trackedMinutes: 0, interval: { start: 0, end: 2 * H } };
	const dayPlan = {
		getDayItems: jest.fn(async () => [item]),
		getDayItemsInRange: jest.fn(async () => new Map([["2026-10-15", [item]], ["2026-10-16", []]])),
		onChange: jest.fn(() => () => undefined),
	};

	it("is inactive until a context has spark or drain", () => {
		expect(new EnergyService({ dayPlan: dayPlan as never, getSettings: () => settings() as never, calibratedMinutes: () => null }).isActive()).toBe(false);
		expect(new EnergyService({ dayPlan: dayPlan as never, getSettings: () => settings("drain") as never, calibratedMinutes: () => null }).isActive()).toBe(true);
	});
	it("resolves context energy with resolveContext (case and @ insensitive)", async () => {
		const svc = new EnergyService({ dayPlan: dayPlan as never, getSettings: () => settings("drain") as never, calibratedMinutes: () => null });
		expect((await svc.getDayEnergy("2026-10-15")).projected).toBe(50);
	});
	it("computes a range with one day-plan range call", async () => {
		const svc = new EnergyService({ dayPlan: dayPlan as never, getSettings: () => settings("drain") as never, calibratedMinutes: () => null });
		dayPlan.getDayItemsInRange.mockClear();
		const range = await svc.getEnergyInRange("2026-10-15", "2026-10-16");
		expect(dayPlan.getDayItemsInRange).toHaveBeenCalledTimes(1);
		expect(range.get("2026-10-16")!.hasSignal).toBe(false);
	});
});
