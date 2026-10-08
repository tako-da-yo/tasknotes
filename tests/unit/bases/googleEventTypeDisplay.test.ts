import { requestUrl } from "obsidian";
import {
	buildExternalCalendarEvents,
	GHOST_EVENT_CLASS,
} from "../../../src/bases/calendarExternalEvents";
import type TaskNotesPlugin from "../../../src/main";
import { GoogleCalendarService } from "../../../src/services/GoogleCalendarService";
import type { OAuthService } from "../../../src/services/OAuthService";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import { buildSettingsFromLoadedData } from "../../../src/settings/settingsPersistence";
import type { ICSEvent } from "../../../src/types";

jest.mock("obsidian", () => ({
	...jest.requireActual("obsidian"),
	requestUrl: jest.fn(),
}));

const googleEvent = (id: string, eventType?: string) => ({
	id,
	summary: id,
	eventType,
	start: { date: "2026-10-07" },
	end: { date: "2026-10-08" },
});

function createPlugin() {
	const plugin = {
		settings: {
			enabledGoogleCalendars: ["work"],
			googleCalendarSyncTokens: {},
			pendingSelectAllCalendarProviders: [],
			googleCalendarEventTypeDisplay: {
				...DEFAULT_SETTINGS.googleCalendarEventTypeDisplay,
				focusTime: "ghost",
			},
		},
		saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined),
	} as unknown as TaskNotesPlugin;
	const oauthService = {
		isConnected: jest.fn().mockResolvedValue(true),
		getValidToken: jest.fn().mockResolvedValue("access-token"),
	} as unknown as OAuthService;
	const service = new GoogleCalendarService(plugin, oauthService);
	(plugin as { googleCalendarService: GoogleCalendarService }).googleCalendarService = service;
	return { plugin, service };
}

describe("Google event type display", () => {
	beforeEach(() => {
		(requestUrl as jest.Mock).mockImplementation(async ({ url }: { url: string }) => ({
			status: 200,
			json: url.includes("/calendarList")
				? { items: [{ id: "work", summary: "Work", primary: true }] }
				: {
						items: [
							googleEvent("Meeting", "default"),
							googleEvent("Office", "workingLocation"),
							googleEvent("Deep work", "focusTime"),
						],
						nextSyncToken: "token",
					},
		}));
	});

	it("hides, ghosts, or shows events by type", async () => {
		const { plugin, service } = createPlugin();
		await service.refreshAllCalendars();

		expect(service.getAllEvents().map((event) => event.title)).toEqual([
			"Meeting",
			"Deep work",
		]);

		const createEvent = (event: ICSEvent) => ({
			id: event.id,
			title: event.title,
			backgroundColor: "#4285F4",
			borderColor: "#4285F4",
			textColor: "#ffffff",
		});
		const [meeting, deepWork] = buildExternalCalendarEvents({
			events: service.getAllEvents(),
			provider: "google",
			plugin,
			createEvent,
		});
		expect(meeting.classNames).toBeUndefined();
		expect(meeting.backgroundColor).toBe("#4285F4");
		expect(deepWork.classNames).toEqual([GHOST_EVENT_CLASS]);
		expect(deepWork.backgroundColor).toBe("transparent");
		expect(deepWork.textColor).toBe("#4285F4");
		service.destroy();
	});

	it("keeps hidden events cached so showing their type again needs no resync", async () => {
		const { service } = createPlugin();
		await service.refreshAllCalendars();
		// An incremental refresh with no changes must not drop hidden events.
		(requestUrl as jest.Mock).mockImplementation(async ({ url }: { url: string }) => ({
			status: 200,
			json: url.includes("/calendarList")
				? { items: [{ id: "work", summary: "Work", primary: true }] }
				: { items: [], nextSyncToken: "token-2" },
		}));
		await service.refreshAllCalendars();

		const changed = jest.fn();
		service.on("data-changed", changed);
		await service.setEventTypeDisplayMode("workingLocation", "show");

		expect(service.getAllEvents().map((event) => event.title)).toContain("Office");
		expect(changed).toHaveBeenCalledTimes(1);
		service.destroy();
	});

	it("fills in event types missing from saved settings", () => {
		const { settings } = buildSettingsFromLoadedData({
			googleCalendarEventTypeDisplay: { focusTime: "hide" } as never,
		});
		expect(settings.googleCalendarEventTypeDisplay).toEqual({
			...DEFAULT_SETTINGS.googleCalendarEventTypeDisplay,
			focusTime: "hide",
		});
	});
});
