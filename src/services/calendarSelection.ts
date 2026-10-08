/** Delay before refetching after the calendar selection changes, so quick toggles share one refresh. */
export const CALENDAR_SELECTION_REFRESH_DELAY_MS = 1000;

/**
 * Computes the stored selection after enabling or disabling one provider calendar.
 * Calendars are off until selected; calendars no longer on the account are dropped.
 */
export function updateCalendarSelection(
	stored: readonly string[],
	availableIds: readonly string[],
	calendarId: string,
	enabled: boolean
): string[] {
	const current = stored.filter((id) => availableIds.includes(id));
	if (!enabled) {
		return current.filter((id) => id !== calendarId);
	}
	return current.includes(calendarId) ? current : [...current, calendarId];
}
