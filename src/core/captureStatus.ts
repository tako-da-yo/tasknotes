import type { TaskCreationDefaults, TriageSettings } from "../types/settings";

/** Fallback when triage settings are missing: the capture rule is off. */
export const TRIAGE_DISABLED: TriageSettings = {
	inboxStatus: "",
	somedayStatus: "",
	captureToInbox: false,
};

/** Whether a status value exists in the configured statuses. */
export type StatusExists = (value: string) => boolean;

/**
 * Whether a configured triage status (inbox or someday) can be used: it is set and still
 * exists. A deleted status stays in settings but is treated as not configured.
 */
export function isTriageStatusUsable(value: string, statusExists: StatusExists): boolean {
	return Boolean(value) && statusExists(value);
}

/** Whether dateless tasks without an explicit status are captured to the inbox status. */
export function isCaptureToInboxEnabled(
	triage: TriageSettings,
	statusExists: StatusExists
): boolean {
	return triage.captureToInbox && isTriageStatusUsable(triage.inboxStatus, statusExists);
}

/** Status for a newly captured task: explicit status, else inbox when dateless, else the default. */
export function resolveCaptureStatus(input: {
	explicitStatus?: string;
	due?: string;
	scheduled?: string;
	defaultStatus: string;
	triage: TriageSettings;
	statusExists: StatusExists;
}): string {
	if (input.explicitStatus) return input.explicitStatus;
	if (isCaptureToInboxEnabled(input.triage, input.statusExists) && !input.due && !input.scheduled) {
		return input.triage.inboxStatus;
	}
	return input.defaultStatus;
}

/** Creation-default dates that would stop new tasks from being captured to the inbox. */
export function captureBlockedByDefaults(
	defaults: Pick<TaskCreationDefaults, "defaultScheduledDate" | "defaultDueDate">
): ("scheduled" | "due")[] {
	const blocked: ("scheduled" | "due")[] = [];
	if (defaults.defaultScheduledDate !== "none") blocked.push("scheduled");
	if (defaults.defaultDueDate !== "none") blocked.push("due");
	return blocked;
}
