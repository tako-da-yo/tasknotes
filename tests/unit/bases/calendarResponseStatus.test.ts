import {
	buildExternalCalendarEvents,
	RESPONSE_STATUS_CLASSES,
} from "../../../src/bases/calendarExternalEvents";
import type TaskNotesPlugin from "../../../src/main";
import type { CalendarResponseStatus, ICSEvent } from "../../../src/types";
import {
	getGoogleResponseStatus,
	getMicrosoftResponseStatus,
} from "../../../src/utils/calendarResponseStatus";

describe("calendar response status", () => {
	it("reads the user's own Google attendee entry", () => {
		expect(
			getGoogleResponseStatus([
				{ responseStatus: "accepted" },
				{ self: true, responseStatus: "tentative" },
			])
		).toBe("tentative");
		expect(getGoogleResponseStatus([{ responseStatus: "needsAction" }])).toBeUndefined();
		expect(getGoogleResponseStatus(undefined)).toBeUndefined();
	});

	it("maps Microsoft responses and ignores organizer and uninvited events", () => {
		expect(getMicrosoftResponseStatus("notResponded")).toBe("needsAction");
		expect(getMicrosoftResponseStatus("tentativelyAccepted")).toBe("tentative");
		expect(getMicrosoftResponseStatus("organizer")).toBeUndefined();
		expect(getMicrosoftResponseStatus("none")).toBeUndefined();
	});

	it("marks unanswered and maybe invitations only", () => {
		const plugin = { settings: {} } as unknown as TaskNotesPlugin;
		const event = (id: string, responseStatus?: CalendarResponseStatus): ICSEvent => ({
			id,
			subscriptionId: "google-work",
			title: id,
			start: "2026-10-15T09:00:00",
			end: "2026-10-15T10:00:00",
			allDay: false,
			responseStatus,
		});
		const built = buildExternalCalendarEvents({
			events: [
				event("pending", "needsAction"),
				event("maybe", "tentative"),
				event("yes", "accepted"),
				event("none"),
			],
			provider: "google",
			plugin,
			createEvent: (e) => ({ id: e.id, title: e.title }),
		});
		const classesById = Object.fromEntries(built.map((e) => [e.id, e.classNames ?? []]));
		expect(classesById.pending).toEqual([RESPONSE_STATUS_CLASSES.needsAction]);
		expect(classesById.maybe).toEqual([RESPONSE_STATUS_CLASSES.tentative]);
		expect(classesById.yes).toEqual([]);
		expect(classesById.none).toEqual([]);
	});
});
