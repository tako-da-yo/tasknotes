import { buildSettingsFromLoadedData } from "../../../src/settings/settingsPersistence";

describe("triage settings", () => {
	it("defaults to off", () => {
		const { settings } = buildSettingsFromLoadedData(null);
		expect(settings.triage).toEqual({ inboxStatus: "", somedayStatus: "", captureToInbox: true });
		expect(settings.triageLastFreshStart).toBeNull();
	});
	it("merges partial saved triage settings with defaults", () => {
		const { settings } = buildSettingsFromLoadedData({ triage: { inboxStatus: "inbox" } } as never);
		expect(settings.triage).toEqual({ inboxStatus: "inbox", somedayStatus: "", captureToInbox: true });
	});
});
