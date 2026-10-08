import type { EventInput } from "@fullcalendar/core";
import type TaskNotesPlugin from "../main";
import type { ICSEvent } from "../types";
import { createICSEvent } from "./calendar-core";
import { colorWithAlpha } from "../utils/themeColors";
import { getExternalEventContext, resolveContext } from "../utils/contextColors";
import { PRIMARY_CALENDAR_ALIAS, ProviderCalendar } from "../services/CalendarProvider";

export type ExternalCalendarProvider = "ics" | "google" | "microsoft";

export type ExternalCalendarEventFactory = (
	event: ICSEvent,
	plugin: TaskNotesPlugin,
	options: { relatedNoteCount?: number }
) => Nullable<EventInput>;

type Nullable<T> = T | null;

/**
 * Classes for Google Calendar's special event types, keyed by the API's eventType.
 * Each type has its own look in advanced-calendar-view.css.
 */
export const GOOGLE_EVENT_TYPE_CLASSES: Readonly<Record<string, string>> = {
	workingLocation: "fc-google-event--working-location",
	outOfOffice: "fc-google-event--out-of-office",
	focusTime: "fc-google-event--focus-time",
	birthday: "fc-google-event--birthday",
	fromGmail: "fc-google-event--from-gmail",
};

/** Display for types drawn differently from a solid block. */
function applyGoogleEventTypeColors(event: EventInput, type: string): void {
	const color = event.borderColor ?? event.backgroundColor;
	if (typeof color !== "string" || !color) return;
	if (type === "workingLocation") {
		// Context only: never editable or interactive (CSS also lets clicks pass through).
		event.editable = false;
		event.interactive = false;
		if (event.allDay) {
			// A faint marker in the all-day row; a background event would shade the whole day.
			event.backgroundColor = "transparent";
			event.textColor = color;
		} else {
			// Timed: drawn behind the day's other events instead of beside them.
			event.display = "background";
			event.backgroundColor = colorWithAlpha(color, 0.12);
		}
	} else if (type === "focusTime") {
		event.backgroundColor = colorWithAlpha(color, 0.15);
		event.textColor = color;
	}
}

function normalizeClassNames(classNames: EventInput["classNames"]): string[] {
	if (!classNames) return [];
	return typeof classNames === "string"
		? classNames.split(/\s+/).filter(Boolean)
		: [...classNames];
}

export interface BuildExternalCalendarEventsInput {
	events: readonly ICSEvent[];
	provider: ExternalCalendarProvider;
	plugin: TaskNotesPlugin;
	toggles?: ReadonlyMap<string, boolean>;
	relatedNoteCountsByEventId?: ReadonlyMap<string, number>;
	createEvent?: ExternalCalendarEventFactory;
}

export function getExternalCalendarToggleId(
	event: Pick<ICSEvent, "subscriptionId">,
	provider: ExternalCalendarProvider
): string {
	if (provider === "google") {
		return event.subscriptionId.replace("google-", "");
	}
	if (provider === "microsoft") {
		return event.subscriptionId.replace("microsoft-", "");
	}
	return event.subscriptionId;
}

/**
 * Registers a provider calendar's visibility toggle. Calendars fetched under the
 * primary alias carry that alias as their calendar id, so the account's own
 * calendar has to answer to both keys for its toggle to take effect.
 */
export function setProviderCalendarToggle(
	toggles: Map<string, boolean>,
	calendar: Pick<ProviderCalendar, "id" | "primary">,
	visible: boolean
): void {
	toggles.set(calendar.id, visible);
	if (calendar.primary) {
		toggles.set(PRIMARY_CALENDAR_ALIAS, visible);
	}
}

export function shouldIncludeExternalCalendarEvent(
	event: Pick<ICSEvent, "subscriptionId">,
	provider: ExternalCalendarProvider,
	toggles?: ReadonlyMap<string, boolean>
): boolean {
	return toggles?.get(getExternalCalendarToggleId(event, provider)) !== false;
}

export function buildExternalCalendarEvents({
	events,
	provider,
	plugin,
	toggles,
	relatedNoteCountsByEventId,
	createEvent = createICSEvent,
}: BuildExternalCalendarEventsInput): EventInput[] {
	const calendarEvents: EventInput[] = [];

	for (const event of events) {
		if (!shouldIncludeExternalCalendarEvent(event, provider, toggles)) {
			continue;
		}

		const calendarEvent = createEvent(event, plugin, {
			relatedNoteCount: relatedNoteCountsByEventId?.get(event.id),
		});
		if (calendarEvent) {
			// A context's color takes precedence over the provider's calendar color.
			const context = resolveContext(
				plugin.settings,
				getExternalEventContext(plugin.settings, event)
			);
			if (context) {
				calendarEvent.borderColor = context.color;
				calendarEvent.backgroundColor = colorWithAlpha(context.color, 0.2);
				if (context.emoji) {
					calendarEvent.extendedProps = {
						...calendarEvent.extendedProps,
						contextEmoji: context.emoji,
					};
				}
			}

			const type = provider === "google" ? event.providerEventType : undefined;
			const typeClass = type ? GOOGLE_EVENT_TYPE_CLASSES[type] : undefined;
			if (type && typeClass) {
				applyGoogleEventTypeColors(calendarEvent, type);
				calendarEvent.classNames = [
					...normalizeClassNames(calendarEvent.classNames),
					typeClass,
				];
			}
			calendarEvents.push(calendarEvent);
		}
	}

	return calendarEvents;
}
