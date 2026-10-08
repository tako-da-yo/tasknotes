import type { EventInput } from "@fullcalendar/core";
import { applyContextColors } from "../../../src/bases/calendarContextColors";
import { buildExternalCalendarEvents } from "../../../src/bases/calendarExternalEvents";
import type TaskNotesPlugin from "../../../src/main";
import { buildSettingsFromLoadedData } from "../../../src/settings/settingsPersistence";
import type { ICSEvent } from "../../../src/types";
import type { TaskNotesSettings } from "../../../src/types/settings";
import {
	findContext,
	formatContextLabel,
	getContextChoices,
	getExternalEventContext,
	getExternalEventContextKey,
	resolveContextColor,
	setExternalEventContext,
} from "../../../src/utils/contextColors";
import { TaskFactory } from "../../helpers/mock-factories";

type ContextSettings = Pick<
	TaskNotesSettings,
	"contextGroups" | "fallbackContext" | "externalEventContexts"
>;

function createSettings(overrides: Partial<ContextSettings> = {}): ContextSettings {
	return {
		contextGroups: [
			{
				id: "work",
				name: "Work",
				contexts: [
					{ id: "meetings", name: "Meetings", color: "#ff8800", enabled: true, emoji: "🎃" },
					{ id: "focus", name: "Deep Focus", color: "#3366ff", enabled: true },
					{ id: "old", name: "Archived", color: "#999999", enabled: false },
				],
			},
			{
				id: "self",
				name: "Self",
				contexts: [{ id: "health", name: "Health", color: "#00aa55", enabled: true }],
			},
		],
		fallbackContext: "",
		externalEventContexts: {},
		...overrides,
	};
}

const googleEvent = (overrides: Partial<ICSEvent> = {}): ICSEvent => ({
	id: "google-work-abc",
	subscriptionId: "google-work",
	title: "Standup",
	start: "2026-10-08T09:00:00",
	allDay: false,
	color: "#4285F4",
	...overrides,
});

describe("context colors", () => {
	it("finds enabled contexts by name, ignoring case and a leading @", () => {
		const settings = createSettings();
		expect(findContext(settings, "@meetings")?.id).toBe("meetings");
		expect(findContext(settings, "deep focus")?.id).toBe("focus");
		expect(findContext(settings, "Archived")).toBeUndefined();
		expect(findContext(settings, "Unknown")).toBeUndefined();
	});

	it("uses the first configured context, then the fallback context", () => {
		expect(resolveContextColor(createSettings(), ["errands", "Health"])).toBe("#00aa55");
		expect(resolveContextColor(createSettings(), ["errands"])).toBeUndefined();
		expect(
			resolveContextColor(createSettings({ fallbackContext: "Meetings" }), undefined)
		).toBe("#ff8800");
	});

	it("puts a context's emoji before its name", () => {
		expect(formatContextLabel({ name: "Meetings", emoji: "🎃" })).toBe("🎃 Meetings");
		expect(formatContextLabel({ name: "Health", emoji: " " })).toBe("Health");
	});

	it("keys recurring events by series and other events by id", () => {
		expect(getExternalEventContextKey(googleEvent())).toBe("google-work-abc");
		expect(
			getExternalEventContextKey(
				googleEvent({ id: "google-work-abc_20261008", recurringEventId: "abc" })
			)
		).toBe("google-work::series::abc");
	});

	it("stores and clears an event's context for the whole series", () => {
		const settings = createSettings();
		const monday = googleEvent({ id: "google-work-abc_20261005", recurringEventId: "abc" });
		const tuesday = googleEvent({ id: "google-work-abc_20261006", recurringEventId: "abc" });

		setExternalEventContext(settings, monday, "Meetings");
		expect(getExternalEventContext(settings, tuesday)).toBe("Meetings");

		setExternalEventContext(settings, tuesday, undefined);
		expect(settings.externalEventContexts).toEqual({});
	});

	it("lists enabled contexts as choices labelled with their group", () => {
		expect(getContextChoices(createSettings())).toEqual([
			{ value: "Meetings", label: "Work › 🎃 Meetings" },
			{ value: "Deep Focus", label: "Work › Deep Focus" },
			{ value: "Health", label: "Self › Health" },
		]);
	});

	it("recolors tasks and timeblocks, leaving time entries alone", () => {
		const settings = createSettings();
		const task = TaskFactory.createTask({ path: "Tasks/a.md", contexts: ["Meetings"] });
		const events: EventInput[] = [
			{
				borderColor: "#ff0000",
				textColor: "#ff0000",
				extendedProps: { eventType: "scheduled", taskInfo: task },
			},
			{
				borderColor: "#6366f1",
				extendedProps: {
					eventType: "timeblock",
					timeblock: { id: "tb", title: "Block", startTime: "10:00", endTime: "11:00", context: "Health" },
				},
			},
			{
				borderColor: "#123456",
				extendedProps: { eventType: "timeEntry", taskInfo: task },
			},
		];

		applyContextColors(events, settings, () => "#202124");

		expect(events[0].borderColor).toBe("#ff8800");
		expect(events[0].textColor).toBe("#ff8800");
		expect(events[0].extendedProps?.contextEmoji).toBe("🎃");
		expect(events[1].extendedProps?.contextEmoji).toBeUndefined();
		expect(events[1].borderColor).toBe("#00aa55");
		expect(events[2].borderColor).toBe("#123456");
	});

	it("overrides an external event's calendar color with its stored context", () => {
		const settings = createSettings();
		const event = googleEvent();
		setExternalEventContext(settings, event, "Deep Focus");
		const plugin = { settings } as unknown as TaskNotesPlugin;

		const [calendarEvent] = buildExternalCalendarEvents({
			events: [event],
			provider: "google",
			plugin,
			createEvent: (icsEvent) => ({
				id: icsEvent.id,
				title: icsEvent.title,
				borderColor: icsEvent.color,
				backgroundColor: icsEvent.color,
			}),
		});

		expect(calendarEvent.borderColor).toBe("#3366ff");
		expect(calendarEvent.backgroundColor).toBe("rgba(51, 102, 255, 0.2)");
	});

	it("defaults to no context groups", () => {
		const { settings } = buildSettingsFromLoadedData({});
		expect(settings.contextGroups).toEqual([]);
		expect(settings.fallbackContext).toBe("");
		expect(settings.externalEventContexts).toEqual({});
	});
});
