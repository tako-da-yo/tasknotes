import type { DayCapacity } from "../core/dayCapacity";

/**
 * Status bar text for a day's capacity, or null when the item should be hidden.
 */
export function capacityStatusText(
	c: DayCapacity,
	t: (k: string, p?: Record<string, string | number>) => string,
	fmt: (m: number) => string
): string | null {
	if (c.plannedMinutes === 0 && c.unestimatedCount === 0) return null;
	if (!c.hasWorkHours) return t("capacity.noWorkHours", { planned: fmt(c.plannedMinutes) });
	let text = t("capacity.status", { planned: fmt(c.plannedMinutes), free: fmt(c.availableMinutes) });
	if (c.overByMinutes > 0) text += t("capacity.over", { over: fmt(c.overByMinutes) });
	return text;
}

/** Summary line for the capacity popover; never hidden, so an empty day says so. */
export function capacityPopoverSummary(
	c: DayCapacity,
	t: (k: string, p?: Record<string, string | number>) => string,
	fmt: (m: number) => string
): string {
	return capacityStatusText(c, t, fmt) ?? t("capacity.empty");
}
