import { resolveCaptureStatus } from "../../../src/core/captureStatus";

const triage = { inboxStatus: "inbox", somedayStatus: "someday", captureToInbox: true };

describe("resolveCaptureStatus", () => {
	it("uses inbox when no status and no dates", () => {
		expect(resolveCaptureStatus({ defaultStatus: "open", triage })).toBe("inbox");
	});
	it("explicit status always wins", () => {
		expect(resolveCaptureStatus({ explicitStatus: "in-progress", defaultStatus: "open", triage })).toBe("in-progress");
	});
	it("uses default status when a due or scheduled date is present", () => {
		expect(resolveCaptureStatus({ due: "2026-10-20", defaultStatus: "open", triage })).toBe("open");
		expect(resolveCaptureStatus({ scheduled: "2026-10-20", defaultStatus: "open", triage })).toBe("open");
	});
	it("uses default status when inbox is not configured", () => {
		expect(resolveCaptureStatus({ defaultStatus: "open", triage: { ...triage, inboxStatus: "" } })).toBe("open");
	});
	it("uses default status when captureToInbox is off", () => {
		expect(resolveCaptureStatus({ defaultStatus: "open", triage: { ...triage, captureToInbox: false } })).toBe("open");
	});
});
