import type { EventInput } from "@fullcalendar/core";
import type { TaskInfo, TimeBlock } from "../types";
import type { TaskNotesSettings } from "../types/settings";
import { resolveContext } from "../utils/contextColors";
import { isCssVariableColor } from "../utils/themeColors";

const CONTEXT_COLORED_TASK_EVENT_TYPES = new Set([
	"scheduled",
	"due",
	"scheduledToDueSpan",
	"recurring",
]);

/**
 * Recolors task and timeblock events with their context's color, which takes
 * precedence over priority and timeblock colors. Runs before the tint pass, which
 * derives fills from the border color set here. Time entries keep their own style.
 */
export function applyContextColors(
	events: EventInput[],
	settings: Pick<TaskNotesSettings, "contextGroups" | "fallbackContext" | "externalEventContexts">,
	getThemeTextColor: () => string
): void {
	for (const event of events) {
		const props = event.extendedProps;
		if (!props) continue;

		let context;
		if (props.eventType === "timeblock") {
			context = resolveContext(settings, (props.timeblock as TimeBlock | undefined)?.context);
		} else if (CONTEXT_COLORED_TASK_EVENT_TYPES.has(props.eventType) && props.taskInfo) {
			context = resolveContext(settings, (props.taskInfo as TaskInfo).contexts);
		}
		if (!context) continue;

		event.borderColor = context.color;
		event.textColor = isCssVariableColor(context.color) ? getThemeTextColor() : context.color;
		if (context.emoji) {
			props.contextEmoji = context.emoji;
		}
	}
}
