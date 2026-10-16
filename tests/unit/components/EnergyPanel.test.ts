import { EnergyPanel, EnergyPanelDeps } from "../../../src/components/EnergyPanel";

const t = (k: string, p: Record<string, string | number> = {}) => `${k}${Object.keys(p).length ? JSON.stringify(p) : ""}`;
const contribution = (points: number, kind = "drain", doneMinutes = 0) => ({
	item: { kind: "event", ref: `e${points}`, date: "2026-10-15", allDay: false, contexts: [], done: false, trackedMinutes: 0, trackedOnDateMinutes: 0 },
	kind, minutes: 90, points, doneMinutes, donePoints: 0, assumedSize: false,
});
const dayEnergy = (projected: number, now = 62, contributions: unknown[] = [contribution(-15)]) => ({
	date: "2026-10-15", projected, now, hours: { spark: 1, steady: 4, drain: 3 },
	contributions,
	topDrains: [], assumedSizeCount: 2, level: projected < 25 ? "low" : "ok", hasSignal: true,
}) as never;
const deps = (o: Partial<EnergyPanelDeps> = {}): EnergyPanelDeps => ({
	getDayEnergy: async () => dayEnergy(40), isActive: () => true, titleOf: () => "Quarterly report",
	openItem: jest.fn(), showDrainTasks: jest.fn(), findSpark: jest.fn(), openSettings: jest.fn(), t, today: () => "2026-10-15", ...o,
});

describe("EnergyPanel", () => {
	it("renders gauge, biggest effects and assumed count", async () => {
		const el = document.createElement("div");
		await new EnergyPanel(el, deps(), { date: "2026-10-15", navigable: false }).render();
		expect(el.querySelector(".tn-energy-gauge")?.getAttribute("aria-label")).toContain('"now":62');
		expect(el.textContent).toContain("Quarterly report");
		expect(el.textContent).toContain("−15");
		expect(el.textContent).toContain("energy.panel.assumed");
		expect(el.querySelector(".tn-energy-panel__low")).toBeNull();
	});
	it("shows the low-battery suggestion below threshold", async () => {
		const el = document.createElement("div");
		const d = deps({ getDayEnergy: async () => dayEnergy(10) });
		await new EnergyPanel(el, d, { date: "2026-10-15", navigable: false }).render();
		const low = el.querySelector(".tn-energy-panel__low")!;
		expect(low).not.toBeNull();
		(low.querySelector("button") as HTMLElement).click();
		expect(d.showDrainTasks).toHaveBeenCalled();
	});
	it("counts done hours from the spent part of each contribution", async () => {
		const el = document.createElement("div");
		// An open task with 60 of its 90 minutes tracked today.
		const d = deps({ getDayEnergy: async () => dayEnergy(40, 62, [contribution(-15, "drain", 60)]) });
		await new EnergyPanel(el, d, { date: "2026-10-15", navigable: false }).render();
		expect(el.querySelector(".tn-energy-panel__mix-row--drain")?.textContent).toContain('"done":1');
	});
	it("shows the empty state when inactive", async () => {
		const el = document.createElement("div");
		await new EnergyPanel(el, deps({ isActive: () => false }), { date: "2026-10-15", navigable: false }).render();
		expect(el.textContent).toContain("energy.panel.emptyTitle");
	});
	it("labels the now marker only for today", async () => {
		const el = document.createElement("div");
		await new EnergyPanel(el, deps(), { date: "2026-10-20", navigable: true }).render();
		expect(el.textContent).not.toContain("energy.panel.now");
		expect(el.textContent).toContain("energy.panel.projected");
	});
	it("omits zero-point effects, including -0", async () => {
		const el = document.createElement("div");
		const d = deps({ getDayEnergy: async () => dayEnergy(40, 62, [contribution(-0, "steady"), contribution(0, "steady")]) });
		await new EnergyPanel(el, d, { date: "2026-10-15", navigable: false }).render();
		expect(el.querySelector(".tn-energy-panel__effects")).toBeNull();
		expect(el.textContent).not.toContain("−0");
	});
	it("renders the capacity line when provided and omits it on null", async () => {
		const el = document.createElement("div");
		await new EnergyPanel(el, deps({ getCapacityLine: async () => "Today: 3h planned" }), { date: "2026-10-15", navigable: false }).render();
		expect(el.querySelector(".tn-energy-panel__capacity")?.textContent).toBe("Today: 3h planned");
		const el2 = document.createElement("div");
		await new EnergyPanel(el2, deps({ getCapacityLine: async () => null }), { date: "2026-10-15", navigable: false }).render();
		expect(el2.querySelector(".tn-energy-panel__capacity")).toBeNull();
	});
	it("does not let a slower older render overwrite a newer one", async () => {
		const el = document.createElement("div");
		const resolvers: Array<(v: unknown) => void> = [];
		const d = deps({ getDayEnergy: () => new Promise((r) => resolvers.push(r as (v: unknown) => void)) as never });
		const panel = new EnergyPanel(el, d, { date: "2026-10-15", navigable: false });
		const first = panel.render();
		const second = panel.render();
		resolvers[1](dayEnergy(80));
		await second;
		resolvers[0](dayEnergy(10));
		await first;
		expect(el.querySelector(".tn-energy-panel__low")).toBeNull();
		expect(el.querySelectorAll(".tn-energy-gauge")).toHaveLength(1);
	});
	it("navigates days and back to today", async () => {
		const el = document.createElement("div");
		const getDayEnergy = jest.fn(async () => dayEnergy(40));
		const panel = new EnergyPanel(el, deps({ getDayEnergy }), { date: "2026-10-15", navigable: true });
		await panel.render();
		expect(el.querySelector(".tn-energy-panel__date")?.textContent).toBe("energy.panel.today");
		await panel.setDate("2026-10-16");
		expect(getDayEnergy).toHaveBeenLastCalledWith("2026-10-16");
		expect(el.querySelector(".tn-energy-panel__date")?.textContent).toBe("2026-10-16");
	});
	it("lists drains first (most negative first), then sparks (largest first)", async () => {
		const el = document.createElement("div");
		const d = deps({
			titleOf: (item) => item.ref,
			getDayEnergy: async () => dayEnergy(40, 62, [contribution(20, "spark"), contribution(-15), contribution(5, "spark"), contribution(-30)]),
		});
		await new EnergyPanel(el, d, { date: "2026-10-15", navigable: false }).render();
		const titles = [...el.querySelectorAll(".tn-energy-panel__effect-title")].map((b) => b.textContent);
		expect(titles).toEqual(["e-30", "e-15", "e20", "e5"]);
	});
	it("opens an item when its title is clicked", async () => {
		const el = document.createElement("div");
		const d = deps();
		await new EnergyPanel(el, d, { date: "2026-10-15", navigable: false }).render();
		(el.querySelector(".tn-energy-panel__effect-title") as HTMLElement).click();
		expect(d.openItem).toHaveBeenCalledWith(expect.objectContaining({ ref: "e-15" }));
	});
});
