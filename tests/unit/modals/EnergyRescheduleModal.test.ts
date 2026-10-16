import { drainRescheduleOptions } from "../../../src/modals/EnergyTaskSuggestModal";

const t = (k: string) => k.split(".").pop()!;

describe("drainRescheduleOptions", () => {
	it("offers Tomorrow, This weekend, Next week and Pick date from today's presets", () => {
		// Wednesday 2026-10-14
		expect(drainRescheduleOptions(new Date(2026, 9, 14), "2026-10-14", t)).toEqual([
			{ label: "tomorrow", date: "2026-10-15" },
			{ label: "weekend", date: "2026-10-17" },
			{ label: "nextWeek", date: "2026-10-19" },
			{ label: "pick", date: null },
		]);
	});
	it("leaves out a preset that is the day the task is already on", () => {
		// Saturday 2026-10-17: "This weekend" is today.
		const options = drainRescheduleOptions(new Date(2026, 9, 17), "2026-10-17", t);
		expect(options.map((o) => o.label)).toEqual(["tomorrow", "nextWeek", "pick"]);
		// Viewing tomorrow's panel: "Tomorrow" would not move the task.
		const ahead = drainRescheduleOptions(new Date(2026, 9, 14), "2026-10-15", t);
		expect(ahead.map((o) => o.label)).toEqual(["weekend", "nextWeek", "pick"]);
	});
});
