import {
	captureBlockedByDefaults,
	isCaptureToInboxEnabled,
	isTriageStatusUsable,
	resolveCaptureStatus,
} from "../../../src/core/captureStatus";

const triage = { inboxStatus: "inbox", somedayStatus: "someday", captureToInbox: true };
const statusExists = (v: string) => ["inbox", "someday", "open", "in-progress"].includes(v);

describe("resolveCaptureStatus", () => {
	it("uses inbox when no status and no dates", () => {
		expect(resolveCaptureStatus({ defaultStatus: "open", triage, statusExists })).toBe("inbox");
	});
	it("explicit status always wins", () => {
		expect(resolveCaptureStatus({ explicitStatus: "in-progress", defaultStatus: "open", triage, statusExists })).toBe("in-progress");
	});
	it("uses default status when a due or scheduled date is present", () => {
		expect(resolveCaptureStatus({ due: "2026-10-20", defaultStatus: "open", triage, statusExists })).toBe("open");
		expect(resolveCaptureStatus({ scheduled: "2026-10-20", defaultStatus: "open", triage, statusExists })).toBe("open");
	});
	it("uses default status when inbox is not configured", () => {
		expect(resolveCaptureStatus({ defaultStatus: "open", triage: { ...triage, inboxStatus: "" }, statusExists })).toBe("open");
	});
	it("uses default status when captureToInbox is off", () => {
		expect(resolveCaptureStatus({ defaultStatus: "open", triage: { ...triage, captureToInbox: false }, statusExists })).toBe("open");
	});
});

describe("deleted triage statuses", () => {
	it("uses default status when the configured inbox status no longer exists", () => {
		expect(
			resolveCaptureStatus({
				defaultStatus: "open",
				triage: { ...triage, inboxStatus: "deleted" },
				statusExists,
			})
		).toBe("open");
	});
	it("treats a deleted inbox status as capture disabled", () => {
		expect(isCaptureToInboxEnabled(triage, statusExists)).toBe(true);
		expect(isCaptureToInboxEnabled({ ...triage, inboxStatus: "deleted" }, statusExists)).toBe(false);
	});
	it("a triage status is usable only when set and existing", () => {
		expect(isTriageStatusUsable("someday", statusExists)).toBe(true);
		expect(isTriageStatusUsable("", statusExists)).toBe(false);
		expect(isTriageStatusUsable("deleted", statusExists)).toBe(false);
	});
});

describe("captureBlockedByDefaults", () => {
	it("lists default dates that stop capture to the inbox", () => {
		expect(captureBlockedByDefaults({ defaultScheduledDate: "none", defaultDueDate: "none" })).toEqual([]);
		expect(captureBlockedByDefaults({ defaultScheduledDate: "today", defaultDueDate: "none" })).toEqual(["scheduled"]);
		expect(
			captureBlockedByDefaults({ defaultScheduledDate: "tomorrow", defaultDueDate: "next-week" })
		).toEqual(["scheduled", "due"]);
	});
});
