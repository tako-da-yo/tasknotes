import type { EventInput } from "@fullcalendar/core";
import { colorWithAlpha, isCssVariableColor } from "../utils/themeColors";

/** Strength of the background tint drawn from an event's own color. */
export const CALENDAR_EVENT_TINT_ALPHA = 0.15;

const TINTED_TASK_EVENT_TYPES = new Set(["scheduled", "due", "scheduledToDueSpan", "recurring"]);

/**
 * Gives task and timeblock events a dim background in their own color. The side
 * borders that pair with the tint are drawn in advanced-calendar-view.css.
 * Completion markers and skipped instances keep their existing fills.
 */
export function applyCalendarEventTints(
	events: EventInput[],
	getThemeTextColor: () => string
): void {
	for (const event of events) {
		const props = event.extendedProps;
		const color = event.borderColor;
		if (!props || typeof color !== "string" || !color) continue;

		if (props.eventType === "timeblock") {
			event.backgroundColor = colorWithAlpha(color, CALENDAR_EVENT_TINT_ALPHA);
			// Text sits on the tint now, so match tasks instead of on-accent text.
			event.textColor = isCssVariableColor(color) ? getThemeTextColor() : color;
		} else if (
			TINTED_TASK_EVENT_TYPES.has(props.eventType) &&
			props.taskInfo &&
			!props.isCompletionMarker &&
			!props.isSkipped
		) {
			event.backgroundColor = colorWithAlpha(color, CALENDAR_EVENT_TINT_ALPHA);
		}
	}
}
