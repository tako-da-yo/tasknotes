import { buildSettingsFromLoadedData } from "../../../src/settings/settingsPersistence";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";

describe("energy settings", () => {
	it("has defaults", () => {
		expect(buildSettingsFromLoadedData(null).settings.energy).toEqual({
			enabled: true, baseline: 70, sparkPerHour: 10, drainPerHour: 10, steadyPerHour: 0, lowThreshold: 25, allDayMinutes: 240,
		});
	});
	it("merges partial values and keeps context energy", () => {
		const { settings } = buildSettingsFromLoadedData({
			energy: { baseline: 80 },
			contextGroups: [{ id: "g", name: "Work", contexts: [{ id: "c", name: "admin", color: "#000", enabled: true, energy: "drain" }] }],
		} as never);
		expect(settings.energy.baseline).toBe(80);
		expect(settings.energy.drainPerHour).toBe(10);
		expect(settings.contextGroups[0].contexts[0].energy).toBe("drain");
	});
	it("falls back to defaults when saved energy is not an object", () => {
		for (const energy of ["broken", 5, [1, 2], null]) {
			const { settings } = buildSettingsFromLoadedData({ energy } as never);
			expect(settings.energy).toEqual(DEFAULT_SETTINGS.energy);
		}
	});
	it("does not share the energy object with the defaults", () => {
		const { settings } = buildSettingsFromLoadedData(null);
		expect(settings.energy).not.toBe(DEFAULT_SETTINGS.energy);
	});
	it("drops invalid context energy values and keeps other context fields", () => {
		const { settings } = buildSettingsFromLoadedData({
			contextGroups: [
				{
					id: "g",
					name: "Work",
					contexts: [
						{ id: "a", name: "a", color: "#111111", enabled: true, energy: "turbo" },
						{ id: "b", name: "b", color: "#222222", emoji: "x", enabled: false, energy: "spark" },
						{ id: "c", name: "c", color: "#333333", enabled: true },
					],
				},
			],
		} as never);
		const [a, b, c] = settings.contextGroups[0].contexts;
		expect(a.energy).toBeUndefined();
		expect("energy" in a).toBe(false);
		expect(b).toEqual({ id: "b", name: "b", color: "#222222", emoji: "x", enabled: false, energy: "spark" });
		expect(c).toEqual({ id: "c", name: "c", color: "#333333", enabled: true });
	});
	it("falls back to no context groups when saved groups are not an array", () => {
		const { settings } = buildSettingsFromLoadedData({ contextGroups: "broken" } as never);
		expect(settings.contextGroups).toEqual([]);
	});
});
