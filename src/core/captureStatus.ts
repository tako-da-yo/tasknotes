import type { TriageSettings } from "../types/settings";

/** Status for a newly captured task: explicit status, else inbox when dateless, else the default. */
export function resolveCaptureStatus(input: {
	explicitStatus?: string;
	due?: string;
	scheduled?: string;
	defaultStatus: string;
	triage: TriageSettings;
}): string {
	if (input.explicitStatus) return input.explicitStatus;
	const { inboxStatus, captureToInbox } = input.triage;
	if (inboxStatus && captureToInbox && !input.due && !input.scheduled) return inboxStatus;
	return input.defaultStatus;
}
