import { buildSettingsFromLoadedData } from "../../../src/settings/settingsPersistence";

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
});
