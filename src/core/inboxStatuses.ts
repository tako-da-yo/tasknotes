import type { StatusConfig } from "../types";

const INBOX_VALUE = "inbox";
const SOMEDAY_VALUE = "someday";

function makeStatus(value: string, label: string, color: string): StatusConfig {
	return {
		id: value,
		value,
		label,
		color,
		isCompleted: false,
		excludeFromCycle: true,
		order: 0,
		autoArchive: false,
		autoArchiveDelay: 5,
	};
}

/** Adds Inbox (before the first open status) and Someday statuses if missing, and renumbers orders. */
export function ensureInboxStatuses(
	statuses: StatusConfig[],
	labels: { inbox: string; someday: string }
): { statuses: StatusConfig[]; inboxValue: string; somedayValue: string } {
	const sorted = [...statuses].sort((a, b) => a.order - b.order);
	if (!sorted.some((s) => s.value === INBOX_VALUE)) {
		const firstOpen = sorted.findIndex((s) => !s.isCompleted && s.value !== "none");
		sorted.splice(
			firstOpen === -1 ? 0 : firstOpen,
			0,
			makeStatus(INBOX_VALUE, labels.inbox, "#8b5cf6")
		);
	}
	if (!sorted.some((s) => s.value === SOMEDAY_VALUE)) {
		const firstCompleted = sorted.findIndex((s) => s.isCompleted);
		sorted.splice(
			firstCompleted === -1 ? sorted.length : firstCompleted,
			0,
			makeStatus(SOMEDAY_VALUE, labels.someday, "#94a3b8")
		);
	}
	return {
		statuses: sorted.map((s, i) => ({ ...s, order: i })),
		inboxValue: INBOX_VALUE,
		somedayValue: SOMEDAY_VALUE,
	};
}

/**
 * Options for an inbox/someday status picker: None, then the open statuses. A configured
 * status that no longer exists is kept as a "missing" option so the picker does not
 * pretend the setting is empty.
 */
export function triageStatusOptions(
	statuses: StatusConfig[],
	configured: string,
	labels: { none: string; missing: (value: string) => string }
): { value: string; label: string }[] {
	const options = [
		{ value: "", label: labels.none },
		...statuses
			.filter((s) => !s.isCompleted)
			.map((s) => ({ value: s.value, label: s.label || s.value })),
	];
	if (configured && !options.some((o) => o.value === configured)) {
		const existing = statuses.find((s) => s.value === configured);
		options.push({
			value: configured,
			label: existing ? existing.label || existing.value : labels.missing(configured),
		});
	}
	return options;
}
