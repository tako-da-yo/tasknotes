import { createEnergyPanelDeps } from "../../../src/bootstrap/energyPanelDeps";
import { getTodayString } from "../../../src/utils/dateUtils";

const capacity = { plannedMinutes: 120, availableMinutes: 240, overByMinutes: 0, unestimatedCount: 0, hasWorkHours: true };

const plugin = (getDayCapacity = jest.fn(async () => capacity)) =>
	({
		capacityService: { getDayCapacity },
		i18n: { translate: (k: string) => k },
	}) as never;

describe("createEnergyPanelDeps: capacity line", () => {
	it("shows the capacity line for today", async () => {
		const deps = createEnergyPanelDeps(plugin());
		expect(await deps.getCapacityLine!(getTodayString())).toBe("capacity.status");
	});
	it("omits the capacity line on other dates", async () => {
		const getDayCapacity = jest.fn(async () => capacity);
		const deps = createEnergyPanelDeps(plugin(getDayCapacity));
		expect(await deps.getCapacityLine!("1999-01-01")).toBeNull();
		expect(getDayCapacity).not.toHaveBeenCalled();
	});
});
