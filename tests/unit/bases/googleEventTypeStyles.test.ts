import { requestUrl } from "obsidian";
import {
	buildExternalCalendarEvents,
	GOOGLE_EVENT_TYPE_CLASSES,
} from "../../../src/bases/calendarExternalEvents";
import type TaskNotesPlugin from "../../../src/main";
import { GoogleCalendarService } from "../../../src/services/GoogleCalendarService";
import type { OAuthService } from "../../../src/services/OAuthService";
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

function createService() {
	const plugin = {
		settings: {
			enabledGoogleCalendars: ["work"],
			googleCalendarSyncTokens: {},
			pendingSelectAllCalendarProviders: [],
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

const createEvent = (event: ICSEvent) => ({
	id: event.id,
	title: event.title,
	allDay: event.allDay,
	backgroundColor: "#4285F4",
	borderColor: "#4285F4",
	textColor: "#ffffff",
});

describe("Google event type styles", () => {
	beforeEach(() => {
		(requestUrl as jest.Mock).mockImplementation(async ({ url }: { url: string }) => ({
			status: 200,
			json: url.includes("/calendarList")
				? { items: [{ id: "work", summary: "Work", primary: true }] }
				: {
						items: [
							googleEvent("Meeting", "default"),
							googleEvent("Office", "workingLocation"),
							googleEvent("Away", "outOfOffice"),
							googleEvent("Deep work", "focusTime"),
						],
						nextSyncToken: "token",
					},
		}));
	});

	it("shows every event type and tags special types with their class", async () => {
		const { plugin, service } = createService();
		await service.refreshAllCalendars();

		const [meeting, office, away, deepWork] = buildExternalCalendarEvents({
			events: service.getAllEvents(),
			provider: "google",
			plugin,
			createEvent,
		});

		expect(meeting.classNames).toBeUndefined();
		expect(meeting.backgroundColor).toBe("#4285F4");

		expect(office.classNames).toEqual([GOOGLE_EVENT_TYPE_CLASSES.workingLocation]);
		// Working location is never editable or interactive.
		expect(office.editable).toBe(false);
		expect(office.interactive).toBe(false);

		expect(away.classNames).toEqual([GOOGLE_EVENT_TYPE_CLASSES.outOfOffice]);
		expect(away.backgroundColor).toBe("#4285F4");

		expect(deepWork.classNames).toEqual([GOOGLE_EVENT_TYPE_CLASSES.focusTime]);
		expect(deepWork.backgroundColor).toBe("rgba(66, 133, 244, 0.15)");
		expect(deepWork.textColor).toBe("#4285F4");
		service.destroy();
	});

	it("draws timed working locations behind other events and all-day ones as markers", () => {
		const { plugin } = createService();
		const workingLocation = (allDay: boolean): ICSEvent => ({
			id: `google-work-${allDay ? "day" : "timed"}`,
			subscriptionId: "google-work",
			title: "Office",
			start: allDay ? "2026-10-07" : "2026-10-07T08:00:00",
			allDay,
			providerEventType: "workingLocation",
		});
		const [allDay, timed] = buildExternalCalendarEvents({
			events: [workingLocation(true), workingLocation(false)],
			provider: "google",
			plugin,
			createEvent,
		});

		expect(allDay.display).toBeUndefined();
		expect(allDay.backgroundColor).toBe("transparent");
		expect(allDay.textColor).toBe("#4285F4");
		expect(timed.display).toBe("background");
		expect(timed.backgroundColor).toBe("rgba(66, 133, 244, 0.12)");
		expect(timed.editable).toBe(false);
	});

	it("does not tag events from other providers", () => {
		const { plugin } = createService();
		const [event] = buildExternalCalendarEvents({
			events: [
				{
					id: "ics-1",
					subscriptionId: "sub",
					title: "Focus",
					start: "2026-10-07T10:00:00",
					allDay: false,
					providerEventType: "focusTime",
				},
			],
			provider: "ics",
			plugin,
			createEvent,
		});
		expect(event.classNames).toBeUndefined();
	});

	it("drops the old per-type display setting from saved data", () => {
		const { settings } = buildSettingsFromLoadedData({
			googleCalendarEventTypeDisplay: { focusTime: "hide" },
		});
		expect(settings).not.toHaveProperty("googleCalendarEventTypeDisplay");
	});
});
