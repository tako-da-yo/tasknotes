import { capacityPopoverSummary, capacityStatusText, energyPrefix } from "../../../src/ui/capacityText";

const t = (k: string, p: Record<string, string | number> = {}) =>
	({ "capacity.status": `Today: ${p.planned} planned · ${p.free} free`, "capacity.over": ` · ${p.over} over`,
	   "capacity.noWorkHours": `Today: ${p.planned} planned`, "capacity.empty": "Nothing planned for today." } as Record<string, string>)[k];
const fmt = (m: number) => `${m}m`;
const base = { date: "2026-10-15", unestimatedCount: 0, tasks: [], hasWorkHours: true };

describe("capacityStatusText", () => {
	it("hides when nothing is planned", () => {
		expect(capacityStatusText({ ...base, availableMinutes: 300, plannedMinutes: 0, overByMinutes: 0 }, t, fmt)).toBeNull();
	});
	it("shows planned and free", () => {
		expect(capacityStatusText({ ...base, availableMinutes: 200, plannedMinutes: 250, overByMinutes: 50 }, t, fmt))
			.toBe("Today: 250m planned · 200m free · 50m over");
	});
	it("omits free on a day off", () => {
		expect(capacityStatusText({ ...base, hasWorkHours: false, availableMinutes: 0, plannedMinutes: 60, overByMinutes: 60 }, t, fmt))
			.toBe("Today: 60m planned");
	});
});

describe("capacityPopoverSummary", () => {
	it("shows an empty state instead of 0m planned", () => {
		expect(capacityPopoverSummary({ ...base, availableMinutes: 300, plannedMinutes: 0, overByMinutes: 0 }, t, fmt))
			.toBe("Nothing planned for today.");
		expect(capacityPopoverSummary({ ...base, hasWorkHours: false, availableMinutes: 0, plannedMinutes: 0, overByMinutes: 0 }, t, fmt))
			.toBe("Nothing planned for today.");
	});
	it("matches the status bar text when something is planned", () => {
		expect(capacityPopoverSummary({ ...base, availableMinutes: 200, plannedMinutes: 100, overByMinutes: 0 }, t, fmt))
			.toBe("Today: 100m planned · 200m free");
	});
});

describe("energyPrefix", () => {
	const e = (projected: number, level: string, hasSignal = true) => ({ projected, level, hasSignal }) as never;
	it("is empty without signal", () => { expect(energyPrefix(null)).toBe(""); expect(energyPrefix(e(70, "high", false))).toBe(""); });
	it("shows the battery level", () => { expect(energyPrefix(e(40, "ok"))).toBe("🔋40% · "); });
	it("uses the low battery glyph", () => { expect(energyPrefix(e(10, "low"))).toBe("🪫10% · "); });
});
