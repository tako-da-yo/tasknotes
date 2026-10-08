import type { EventInput } from "@fullcalendar/core";
import type TaskNotesPlugin from "../main";
import type { ICSEvent } from "../types";
import { createICSEvent } from "./calendar-core";
import { PRIMARY_CALENDAR_ALIAS, ProviderCalendar } from "../services/CalendarProvider";

export type ExternalCalendarProvider = "ics" | "google" | "microsoft";

export type ExternalCalendarEventFactory = (
	event: ICSEvent,
	plugin: TaskNotesPlugin,
	options: { relatedNoteCount?: number }
) => Nullable<EventInput>;

type Nullable<T> = T | null;

/** Class for external events shown de-emphasized, such as Google working location. */
export const GHOST_EVENT_CLASS = "fc-event--ghost";

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

		const displayMode =
			provider === "google"
				? plugin.googleCalendarService?.getEventDisplayMode(event)
				: "show";
		if (displayMode === "hide") {
			continue;
		}

		const calendarEvent = createEvent(event, plugin, {
			relatedNoteCount: relatedNoteCountsByEventId?.get(event.id),
		});
		if (calendarEvent) {
			if (displayMode === "ghost") {
				// Outline in the calendar color instead of filling with it.
				calendarEvent.textColor =
					calendarEvent.borderColor ??
					calendarEvent.backgroundColor ??
					calendarEvent.textColor;
				calendarEvent.backgroundColor = "transparent";
				calendarEvent.classNames = [
					...normalizeClassNames(calendarEvent.classNames),
					GHOST_EVENT_CLASS,
				];
			}
			calendarEvents.push(calendarEvent);
		}
	}

	return calendarEvents;
}
