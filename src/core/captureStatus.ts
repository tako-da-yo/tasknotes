import type { TriageSettings } from "../types/settings";

/** Fallback when triage settings are missing: the capture rule is off. */
export const TRIAGE_DISABLED: TriageSettings = {
	inboxStatus: "",
	somedayStatus: "",
	captureToInbox: false,
};

/** Whether dateless tasks without an explicit status are captured to the inbox status. */
export function isCaptureToInboxEnabled(triage: TriageSettings): boolean {
	return Boolean(triage.inboxStatus) && triage.captureToInbox;
}

/** Status for a newly captured task: explicit status, else inbox when dateless, else the default. */
export function resolveCaptureStatus(input: {
	explicitStatus?: string;
	due?: string;
	scheduled?: string;
	defaultStatus: string;
	triage: TriageSettings;
}): string {
	if (input.explicitStatus) return input.explicitStatus;
	if (isCaptureToInboxEnabled(input.triage) && !input.due && !input.scheduled) {
		return input.triage.inboxStatus;
	}
	return input.defaultStatus;
}
