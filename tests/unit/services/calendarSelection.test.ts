import { updateCalendarSelection } from "../../../src/services/calendarSelection";
import { GoogleCalendarService } from "../../../src/services/GoogleCalendarService";
import { MicrosoftCalendarService } from "../../../src/services/MicrosoftCalendarService";
import { buildSettingsFromLoadedData } from "../../../src/settings/settingsPersistence";

describe("updateCalendarSelection", () => {
	const available = ["a", "b", "c"];

	it("treats an empty selection as no calendars", () => {
		expect(updateCalendarSelection([], available, "b", true)).toEqual(["b"]);
	});

	it("allows deselecting every calendar", () => {
		expect(updateCalendarSelection(["a"], available, "a", false)).toEqual([]);
	});

	it("drops calendars that are no longer available", () => {
		expect(updateCalendarSelection(["a", "gone"], available, "b", true)).toEqual(["a", "b"]);
	});
});

describe("calendar selection migration", () => {
	it("starts new installs with no calendars selected", () => {
		const { settings } = buildSettingsFromLoadedData(null);
		expect(settings.enabledGoogleCalendars).toEqual([]);
		expect(settings.pendingSelectAllCalendarProviders).toEqual([]);
	});

	it("flags providers still on the old fetch-all default when upgrading", () => {
		const { settings } = buildSettingsFromLoadedData({
			enabledGoogleCalendars: [],
			enabledMicrosoftCalendars: ["team"],
		});
		expect(settings.pendingSelectAllCalendarProviders).toEqual(["google"]);
	});

	it("leaves already migrated settings alone", () => {
		const { settings } = buildSettingsFromLoadedData({
			enabledGoogleCalendars: [],
			enabledMicrosoftCalendars: [],
			pendingSelectAllCalendarProviders: [],
		});
		expect(settings.pendingSelectAllCalendarProviders).toEqual([]);
	});
});

describe("provider calendar selection", () => {
	const createPlugin = () => ({
		settings: {
			enabledGoogleCalendars: [] as string[],
			enabledMicrosoftCalendars: [] as string[],
			googleCalendarSyncTokens: { a: "token-a", b: "token-b" } as Record<string, string>,
			microsoftCalendarSyncTokens: { a: "token-a", b: "token-b" } as Record<string, string>,
			pendingSelectAllCalendarProviders: [] as ("google" | "microsoft")[],
		},
		saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined),
	});
	const oauth = () => ({
		isConnected: jest.fn().mockResolvedValue(true),
		getConnectionGeneration: jest.fn().mockReturnValue(0),
	});
	const keys = (name: "google" | "microsoft") =>
		({
			enabled: name === "google" ? "enabledGoogleCalendars" : "enabledMicrosoftCalendars",
		}) as const;
	const createService = (
		name: "google" | "microsoft",
		plugin: ReturnType<typeof createPlugin>,
		connected = true
	) => {
		const oauthService = { ...oauth(), isConnected: jest.fn().mockResolvedValue(connected) };
		return (
			name === "google"
				? new GoogleCalendarService(plugin as any, oauthService as any)
				: new MicrosoftCalendarService(plugin as any, oauthService as any)
		) as any;
	};

	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it.each(["google", "microsoft"] as const)(
		"%s fetches only selected calendars",
		async (name) => {
			const plugin = createPlugin();
			const { enabled } = keys(name);
			const service = createService(name, plugin);
			service.availableCalendars = [{ id: "a" }, { id: "b" }];
			service.refreshAllCalendars = jest.fn().mockResolvedValue(undefined);

			expect(service.isCalendarEnabled("a")).toBe(false);

			await service.setCalendarEnabled("b", true);
			expect(plugin.settings[enabled]).toEqual(["b"]);
			expect(plugin.saveSettingsDataOnly).toHaveBeenCalled();

			await service.setCalendarEnabled("b", false);
			expect(plugin.settings[enabled]).toEqual([]);
			expect(service.isCalendarEnabled("b")).toBe(false);

			jest.runOnlyPendingTimers();
			expect(service.refreshAllCalendars).toHaveBeenCalledTimes(1);
			service.destroy();
		}
	);

	it.each(["google", "microsoft"] as const)(
		"%s selects every calendar once after upgrading from fetch-all",
		async (name) => {
			const plugin = createPlugin();
			const { enabled } = keys(name);
			plugin.settings.pendingSelectAllCalendarProviders = ["google", "microsoft"];
			const service = createService(name, plugin);
			service.listCalendars = jest.fn().mockResolvedValue([{ id: "a" }, { id: "b" }]);
			service.fetchCalendarEvents = jest
				.fn()
				.mockResolvedValue({ events: [], isFullSync: true, hasDeletes: false });

			await service.refreshAllCalendars();

			expect(plugin.settings[enabled]).toEqual(["a", "b"]);
			expect(plugin.settings.pendingSelectAllCalendarProviders).toEqual([
				name === "google" ? "microsoft" : "google",
			]);
			expect(service.fetchCalendarEvents).toHaveBeenCalledTimes(2);
			service.destroy();
		}
	);

	it.each(["google", "microsoft"] as const)(
		"%s starts with no calendars when the account was not connected at upgrade",
		async (name) => {
			const plugin = createPlugin();
			const { enabled } = keys(name);
			plugin.settings.pendingSelectAllCalendarProviders = ["google", "microsoft"];
			const service = createService(name, plugin, false);

			await service.initialize();

			expect(plugin.settings[enabled]).toEqual([]);
			expect(plugin.settings.pendingSelectAllCalendarProviders).toEqual([
				name === "google" ? "microsoft" : "google",
			]);
			service.destroy();
		}
	);
});
