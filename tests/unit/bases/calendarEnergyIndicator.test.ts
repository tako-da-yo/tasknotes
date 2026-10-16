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
	it("keeps pointer, mouse and touch starts on the glyph from reaching the host", () => {
		const host = document.createElement("div");
		const onClick = jest.fn();
		renderEnergyGlyph(host, energy(40), t, onClick);
		const seen: string[] = [];
		for (const type of ["pointerdown", "mousedown", "touchstart"]) host.addEventListener(type, () => seen.push(type));
		const glyph = host.querySelector(".tn-energy-glyph")!;
		glyph.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
		const mouse = new Event("mousedown", { bubbles: true, cancelable: true });
		glyph.dispatchEvent(mouse);
		glyph.dispatchEvent(new Event("touchstart", { bubbles: true, cancelable: true }));
		expect(seen).toEqual([]);
		expect(mouse.defaultPrevented).toBe(true);
		expect(onClick).not.toHaveBeenCalled();
	});
	it("writes the projected percentage inside the battery, hidden from screen readers", () => {
		const host = document.createElement("div");
		renderEnergyGlyph(host, energy(45), t);
		const label = host.querySelector(".tn-energy-glyph__label");
		expect(label?.textContent).toBe("45%");
		expect(label?.getAttribute("aria-hidden")).toBe("true");
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
	it("makes no range call when no hosts are registered", async () => {
		const getEnergyInRange = jest.fn(async () => new Map());
		const ind = new CalendarEnergyIndicators({ energy: { getEnergyInRange, isActive: () => true } as never, t, onClick: jest.fn() });
		await ind.refresh("2026-10-01", "2026-10-31");
		const gone = document.createElement("div");
		ind.register("2026-10-15", gone);
		ind.prune();
		await ind.refresh("2026-10-01", "2026-10-31");
		expect(getEnergyInRange).not.toHaveBeenCalled();
	});
	it("renders nothing when energy is inactive", async () => {
		const getEnergyInRange = jest.fn();
		const ind = new CalendarEnergyIndicators({ energy: { getEnergyInRange, isActive: () => false } as never, t, onClick: jest.fn() });
		ind.register("2026-10-15", document.createElement("div"));
		await ind.refresh("2026-10-15", "2026-10-15");
		expect(getEnergyInRange).not.toHaveBeenCalled();
	});
	it("keeps a connected host through prune and refreshes it after a range change", async () => {
		const getEnergyInRange = jest.fn(async () => new Map([["2026-10-01", energy(40)]]));
		const ind = new CalendarEnergyIndicators({ energy: { getEnergyInRange, isActive: () => true } as never, t, onClick: jest.fn() });
		const reused = document.createElement("div");
		document.body.appendChild(reused);
		ind.register("2026-10-01", reused);
		// September's rendered range ends on Oct 10; October reuses that cell without re-mounting it.
		await ind.refresh("2026-08-30", "2026-10-10");
		reused.querySelector(".tn-energy-glyph")?.remove();
		ind.prune();
		await ind.refresh("2026-09-27", "2026-11-07");
		expect(reused.querySelector(".tn-energy-glyph")).not.toBeNull();
		reused.remove();
	});
	it("prunes disconnected hosts", async () => {
		const getEnergyInRange = jest.fn(async () => new Map([["2026-10-15", energy(40)]]));
		const ind = new CalendarEnergyIndicators({ energy: { getEnergyInRange, isActive: () => true } as never, t, onClick: jest.fn() });
		const gone = document.createElement("div");
		ind.register("2026-10-15", gone);
		ind.prune();
		await ind.refresh("2026-10-01", "2026-10-31");
		expect(gone.querySelector(".tn-energy-glyph")).toBeNull();
	});
	it("does not let a second host for the same date displace a connected host", async () => {
		const getEnergyInRange = jest.fn(async () => new Map([["2026-10-31", energy(40)]]));
		const ind = new CalendarEnergyIndicators({ energy: { getEnergyInRange, isActive: () => true } as never, t, onClick: jest.fn() });
		const real = document.createElement("div");
		const duplicate = document.createElement("div");
		document.body.append(real, duplicate);
		ind.register("2026-10-31", real);
		ind.register("2026-10-31", duplicate);
		ind.register("2026-10-31", real);
		await ind.refresh("2026-10-01", "2026-10-31");
		expect(real.querySelectorAll(".tn-energy-glyph")).toHaveLength(1);
		expect(duplicate.querySelector(".tn-energy-glyph")).not.toBeNull();
		real.remove();
		duplicate.remove();
	});
});
