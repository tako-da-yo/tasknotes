import { requestUrl } from "obsidian";
import type TaskNotesPlugin from "../../../src/main";
import { GoogleCalendarService } from "../../../src/services/GoogleCalendarService";
import type { OAuthService } from "../../../src/services/OAuthService";

jest.mock("obsidian", () => ({
	Platform: { isDesktopApp: true },
	requestUrl: jest.fn(),
}));

const response = (json: unknown) => ({
	status: 200,
	json,
	text: "",
	arrayBuffer: new ArrayBuffer(0),
	headers: {},
});

/** Fake Google Calendar API: sync tokens only return changes made after they were issued. */
function installFakeGoogle(events: { id: string; summary: string }[]) {
	let version = 1;
	const changedAt = new Map(events.map((event) => [event.id, 1]));
	(requestUrl as jest.MockedFunction<typeof requestUrl>).mockImplementation(async (request) => {
		const url = new URL(typeof request === "string" ? request : request.url);
		if (url.pathname.endsWith("/users/me/calendarList")) {
			return response({ items: [{ id: "work", summary: "Work", primary: true }] }) as any;
		}
		const syncToken = url.searchParams.get("syncToken");
		const since = syncToken ? Number(syncToken.replace("v", "")) : 0;
		const items = events
			.filter((event) => (changedAt.get(event.id) ?? 0) > since)
			.map((event) => ({
				...event,
				start: { date: "2026-10-07" },
				end: { date: "2026-10-08" },
			}));
		return response({ items, nextSyncToken: `v${version}` }) as any;
	});
	return {
		add(event: { id: string; summary: string }) {
			version++;
			events.push(event);
			changedAt.set(event.id, version);
		},
	};
}

describe("Google Calendar sync tokens across restarts", () => {
	const oauthService = {
		isConnected: jest.fn().mockResolvedValue(true),
		getValidToken: jest.fn().mockResolvedValue("access-token"),
	} as unknown as OAuthService;

	it("shows every event after a restart, not only changes since the last sync", async () => {
		const google = installFakeGoogle([
			{ id: "standup", summary: "Standup" },
			{ id: "review", summary: "Review" },
		]);
		const plugin = {
			settings: {
				enabledGoogleCalendars: ["work"],
				googleCalendarSyncTokens: {},
				pendingSelectAllCalendarProviders: [],
			},
			saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined),
		} as unknown as TaskNotesPlugin;

		const firstSession = new GoogleCalendarService(plugin, oauthService);
		await firstSession.refreshAllCalendars();
		expect(
			firstSession
				.getAllEvents()
				.map((event) => event.title)
				.sort()
		).toEqual(["Review", "Standup"]);
		firstSession.destroy();

		// Obsidian restarts: settings (including the sync token) persist, the event cache does not.
		google.add({ id: "planning", summary: "Planning" });
		const secondSession = new GoogleCalendarService(plugin, oauthService);
		await secondSession.refreshAllCalendars();

		expect(
			secondSession
				.getAllEvents()
				.map((event) => event.title)
				.sort()
		).toEqual(["Planning", "Review", "Standup"]);
		secondSession.destroy();
	});

	it("refetches every event of a calendar turned back on after its events were dropped", async () => {
		installFakeGoogle([{ id: "standup", summary: "Standup" }]);
		const plugin = {
			settings: {
				enabledGoogleCalendars: ["work"],
				googleCalendarSyncTokens: {},
				pendingSelectAllCalendarProviders: [],
			},
			saveSettingsDataOnly: jest.fn().mockResolvedValue(undefined),
		} as unknown as TaskNotesPlugin;
		const service = new GoogleCalendarService(plugin, oauthService);
		await service.refreshAllCalendars();

		plugin.settings.enabledGoogleCalendars = [];
		await service.refreshAllCalendars();
		expect(service.getAllEvents()).toEqual([]);

		plugin.settings.enabledGoogleCalendars = ["work"];
		await service.refreshAllCalendars();
		expect(service.getAllEvents().map((event) => event.title)).toEqual(["Standup"]);
		service.destroy();
	});
});
