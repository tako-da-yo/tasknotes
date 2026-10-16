import { renderEnergyGlyph, CalendarEnergyIndicators, toLocalDateRange } from "../../../src/bases/calendarEnergyIndicator";

describe("toLocalDateRange", () => {
	it("turns FullCalendar's exclusive end into an inclusive local date", () => {
		expect(toLocalDateRange(new Date(2026, 9, 1), new Date(2026, 10, 1))).toEqual({
			start: "2026-10-01",
			end: "2026-10-31",
		});
	});
});

const t = (k: string, p: Record<string, string | number> = {}) => `${k}:${p.level ?? ""}`;
const energy = (projected: number, hasSignal = true) => ({
	date: "2026-10-15", projected, now: projected, hours: { spark: 1, steady: 2, drain: 3 }, contributions: [], topDrains: [],
	assumedSizeCount: 0, level: projected < 25 ? "low" : projected < 70 ? "ok" : "high", hasSignal,
}) as never;

describe("renderEnergyGlyph", () => {
	it("renders level, class and aria label; is idempotent", () => {
		const host = document.createElement("div");
		renderEnergyGlyph(host, energy(40), t);
		renderEnergyGlyph(host, energy(10), t);
		const glyphs = host.querySelectorAll(".tn-energy-glyph");
		expect(glyphs).toHaveLength(1);
		expect(glyphs[0].classList.contains("is-low")).toBe(true);
		expect(glyphs[0].getAttribute("aria-label")).toBe("energy.glyph.aria:10");
		expect((glyphs[0] as HTMLElement).style.getPropertyValue("--tn-energy-level")).toBe("10%");
	});
	it("renders nothing without signal", () => {
		const host = document.createElement("div");
		renderEnergyGlyph(host, energy(70, false), t);
		expect(host.querySelector(".tn-energy-glyph")).toBeNull();
	});
	it("clamps the level for display", () => {
		const host = document.createElement("div");
		renderEnergyGlyph(host, energy(0), t);
		expect((host.querySelector(".tn-energy-glyph") as HTMLElement).style.getPropertyValue("--tn-energy-level")).toBe("0%");
	});
});

describe("CalendarEnergyIndicators", () => {
	it("refreshes all registered hosts with a single range call", async () => {
		const getEnergyInRange = jest.fn(async () => new Map([["2026-10-15", energy(40)], ["2026-10-16", energy(80)]]));
		const ind = new CalendarEnergyIndicators({ energy: { getEnergyInRange, isActive: () => true } as never, t, onClick: jest.fn() });
		const a = document.createElement("div");
		const b = document.createElement("div");
		ind.register("2026-10-15", a);
		ind.register("2026-10-16", b);
		await ind.refresh("2026-10-15", "2026-10-16");
		expect(getEnergyInRange).toHaveBeenCalledTimes(1);
		expect(a.querySelector(".is-ok")).not.toBeNull();
		expect(b.querySelector(".is-high")).not.toBeNull();
	});
	it("renders nothing when energy is inactive", async () => {
		const getEnergyInRange = jest.fn();
		const ind = new CalendarEnergyIndicators({ energy: { getEnergyInRange, isActive: () => false } as never, t, onClick: jest.fn() });
		ind.register("2026-10-15", document.createElement("div"));
		await ind.refresh("2026-10-15", "2026-10-15");
		expect(getEnergyInRange).not.toHaveBeenCalled();
	});
	it("prune drops hosts outside the range so they are not rendered", async () => {
		const getEnergyInRange = jest.fn(async () => new Map([["2026-10-15", energy(40)], ["2026-11-01", energy(80)]]));
		const ind = new CalendarEnergyIndicators({ energy: { getEnergyInRange, isActive: () => true } as never, t, onClick: jest.fn() });
		const old = document.createElement("div");
		const kept = document.createElement("div");
		ind.register("2026-10-15", kept);
		ind.register("2026-11-01", old);
		ind.prune("2026-10-01", "2026-10-31");
		await ind.refresh("2026-10-01", "2026-11-30");
		expect(kept.querySelector(".tn-energy-glyph")).not.toBeNull();
		expect(old.querySelector(".tn-energy-glyph")).toBeNull();
	});
});
