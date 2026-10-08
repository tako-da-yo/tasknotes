import type { EventInput } from "@fullcalendar/core";
import { applyCalendarEventTints } from "../../../src/bases/calendarEventTints";
import { TaskFactory } from "../../helpers/mock-factories";

const taskInfo = TaskFactory.createTask({ path: "Tasks/a.md" });
const themeText = () => "#202124";

function tint(event: EventInput): EventInput {
	applyCalendarEventTints([event], themeText);
	return event;
}

describe("applyCalendarEventTints", () => {
	it("tints scheduled tasks with their own color", () => {
		const event = tint({
			backgroundColor: "transparent",
			borderColor: "#ff0000",
			extendedProps: { eventType: "scheduled", taskInfo },
		});
		expect(event.backgroundColor).toBe("rgba(255, 0, 0, 0.15)");
	});

	it("uses color-mix for theme variable colors", () => {
		const event = tint({
			borderColor: "var(--color-accent)",
			extendedProps: { eventType: "due", taskInfo },
		});
		expect(event.backgroundColor).toBe(
			"color-mix(in srgb, var(--color-accent) 15%, transparent)"
		);
	});

	it("keeps completion markers, skipped instances and time entries unchanged", () => {
		for (const extendedProps of [
			{ eventType: "scheduled", taskInfo, isCompletionMarker: true },
			{ eventType: "recurring", taskInfo, isSkipped: true },
			{ eventType: "timeEntry", taskInfo },
			{ eventType: "ics" },
		]) {
			const event = tint({ backgroundColor: "transparent", borderColor: "#ff0000", extendedProps });
			expect(event.backgroundColor).toBe("transparent");
		}
	});

	it("tints timeblocks and switches their text off on-accent", () => {
		const hex = tint({
			backgroundColor: "#6366f1",
			borderColor: "#6366f1",
			textColor: "var(--text-on-accent)",
			extendedProps: { eventType: "timeblock" },
		});
		expect(hex.backgroundColor).toBe("rgba(99, 102, 241, 0.15)");
		expect(hex.textColor).toBe("#6366f1");

		const themed = tint({
			borderColor: "var(--color-accent)",
			textColor: "var(--text-on-accent)",
			extendedProps: { eventType: "timeblock" },
		});
		expect(themed.textColor).toBe("#202124");
	});
});
