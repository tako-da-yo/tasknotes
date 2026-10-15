import type { CalendarResponseStatus } from "../types";

const GOOGLE_RESPONSE_STATUSES: ReadonlySet<string> = new Set([
	"needsAction",
	"tentative",
	"accepted",
	"declined",
]);

const MICROSOFT_RESPONSE_STATUSES: Readonly<Record<string, CalendarResponseStatus>> = {
	notResponded: "needsAction",
	tentativelyAccepted: "tentative",
	accepted: "accepted",
	declined: "declined",
};

/** The user's own response from a Google event's attendee list, if they are invited. */
export function getGoogleResponseStatus(
	attendees: ReadonlyArray<{ self?: boolean; responseStatus?: string }> | undefined
): CalendarResponseStatus | undefined {
	const status = attendees?.find((attendee) => attendee.self)?.responseStatus;
	return status && GOOGLE_RESPONSE_STATUSES.has(status)
		? (status as CalendarResponseStatus)
		: undefined;
}

/**
 * The user's response to a Microsoft Graph event. "organizer" and "none" (no
 * invitation) map to undefined, so only real invitations are marked.
 */
export function getMicrosoftResponseStatus(
	response: string | undefined
): CalendarResponseStatus | undefined {
	return response ? MICROSOFT_RESPONSE_STATUSES[response] : undefined;
}
