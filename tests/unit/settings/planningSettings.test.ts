import { buildSettingsFromLoadedData } from "../../../src/settings/settingsPersistence";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

describe("planning and calibration settings", () => {
	it("has defaults", () => {
		const { settings } = buildSettingsFromLoadedData(null);
		const nineToFive = { start: "09:00", end: "17:00" };
		expect(settings.planning).toEqual({
			workHours: [null, nineToFive, nineToFive, nineToFive, nineToFive, nineToFive, null],
			busyCalendars: null,
			allDayEventsBusy: false,
			defaultEstimate: null,
			showInStatusBar: true,
			warnOnOverbook: true,
		});
		expect(settings.calibration).toEqual({ windowDays: 90, applyToPlanning: true });
	});
	it("merges partial saved values", () => {
		const { settings } = buildSettingsFromLoadedData({ planning: { defaultEstimate: 30 }, calibration: { windowDays: 30 } } as never);
		expect(settings.planning.defaultEstimate).toBe(30);
		expect(settings.planning.showInStatusBar).toBe(true);
		expect(settings.calibration).toEqual({ windowDays: 30, applyToPlanning: true });
	});
	it("does not share nested planning objects with DEFAULT_SETTINGS", () => {
		const { settings } = buildSettingsFromLoadedData(null);
		const workDay = settings.planning.workHours[1];
		if (!workDay) throw new Error("expected Monday work hours");
		workDay.start = "08:00";
		settings.planning.workHours[0] = { start: "10:00", end: "12:00" };
		expect(DEFAULT_SETTINGS.planning.workHours[1]?.start).toBe("09:00");
		expect(DEFAULT_SETTINGS.planning.workHours[0]).toBeNull();
		expect(buildSettingsFromLoadedData(null).settings.planning.workHours[1]?.start).toBe("09:00");
	});
	it("copies saved busyCalendars and workHours", () => {
		const saved = {
			planning: { busyCalendars: ["google-a"], workHours: [null, { start: "07:00", end: "15:00" }, null, null, null, null, null] },
		};
		const { settings } = buildSettingsFromLoadedData(saved as never);
		expect(settings.planning.busyCalendars).toEqual(["google-a"]);
		expect(settings.planning.busyCalendars).not.toBe(saved.planning.busyCalendars);
		expect(settings.planning.workHours[1]).toEqual({ start: "07:00", end: "15:00" });
		expect(settings.planning.workHours[1]).not.toBe(saved.planning.workHours[1]);
	});
});
