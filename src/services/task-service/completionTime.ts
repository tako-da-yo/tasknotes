import { getCurrentDateString, getCurrentTimestamp, getDatePart } from "../../utils/dateUtils";

/**
 * Completion timestamp to store alongside a completion date.
 * An existing timestamp on the same date is kept, so switching between completed
 * statuses does not move it. Completion dates other than today (for example one
 * picked from the context menu) have an unknown time, so no timestamp is stored.
 */
export function resolveCompletedAt(
	completionDate: string,
	existing: unknown,
	now: string = getCurrentTimestamp(),
	today: string = getCurrentDateString()
): string | undefined {
	if (typeof existing === "string" && getDatePart(existing) === completionDate) {
		return existing;
	}
	return completionDate === today ? now : undefined;
}

/** Normalizes a frontmatter completion-time map, dropping entries that are not strings. */
export function normalizeCompleteInstanceTimes(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return undefined;
	}
	const entries = Object.entries(value as Record<string, unknown>).filter(
		(entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0
	);
	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Returns the completion-time map after an instance is completed or un-completed.
 * Undefined means the map is empty and the field should be removed.
 */
export function updateCompleteInstanceTimes(
	times: Record<string, string> | undefined,
	instanceDate: string,
	completed: boolean,
	now: string = getCurrentTimestamp()
): Record<string, string> | undefined {
	const next = { ...(times ?? {}) };
	if (completed) {
		next[instanceDate] = next[instanceDate] ?? now;
	} else {
		delete next[instanceDate];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}
