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

/** True when `date` falls inside the half-open range [start, end). */
export function rangeContainsDate(range: { start: Date; end: Date }, date: Date): boolean {
	const time = date.getTime();
	return time >= range.start.getTime() && time < range.end.getTime();
}
