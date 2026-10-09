export type CalendarRecreateNavigationState = {
	initialDate: string;
	initialDateProperty: string | null;
	initialDateStrategy: "first" | "earliest" | "latest";
};

export function shouldPreserveVisibleDateOnCalendarRecreate(
	previousState: CalendarRecreateNavigationState,
	nextState: CalendarRecreateNavigationState
): boolean {
	return (
		previousState.initialDate === nextState.initialDate &&
		previousState.initialDateProperty === nextState.initialDateProperty &&
		previousState.initialDateStrategy === nextState.initialDateStrategy
	);
}

/**
 * Where the calendar should land after the local date rolls over while it is open.
 * A view that still contains the previous day was following "today", so it moves to
 * the new today; a view the user navigated elsewhere keeps its date.
 */
export function getDayRolloverTargetDate(
	previousDay: Date,
	now: Date,
	visibleRange: { start: Date; end: Date },
	currentDate: Date
): Date {
	const previousDayTime = previousDay.getTime();
	const wasShowingToday =
		previousDayTime >= visibleRange.start.getTime() &&
		previousDayTime < visibleRange.end.getTime();
	return wasShowingToday ? now : currentDate;
}
