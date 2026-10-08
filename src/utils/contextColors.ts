import type { ICSEvent } from "../types";
import type { ContextDefinition, ContextGroup, TaskNotesSettings } from "../types/settings";

type ContextSettings = Pick<
	TaskNotesSettings,
	"contextGroups" | "fallbackContext" | "externalEventContexts"
>;

function normalizeContextName(name: string): string {
	return name.trim().replace(/^@/, "").toLowerCase();
}

/** Enabled configured context with this name (case-insensitive, leading @ ignored). */
export function findContext(
	settings: Pick<ContextSettings, "contextGroups"> | undefined,
	name: string | undefined
): ContextDefinition | undefined {
	if (!name) return undefined;
	const wanted = normalizeContextName(name);
	if (!wanted) return undefined;
	for (const group of settings?.contextGroups ?? []) {
		for (const context of group.contexts) {
			if (context.enabled && normalizeContextName(context.name) === wanted) {
				return context;
			}
		}
	}
	return undefined;
}

/**
 * Context that styles an item: the first configured context it has, otherwise the
 * fallback context. Undefined when neither applies, so the item keeps its own style.
 */
export function resolveContext(
	settings: ContextSettings | undefined,
	contexts: readonly string[] | string | undefined
): ContextDefinition | undefined {
	const names = typeof contexts === "string" ? [contexts] : (contexts ?? []);
	for (const name of names) {
		const context = findContext(settings, name);
		if (context) return context;
	}
	return findContext(settings, settings?.fallbackContext);
}

/**
 * The group and context of an item's first configured context. Unlike resolveContext,
 * the fallback context is not used: this reports what the item actually has.
 */
export function findContextGroup(
	settings: Pick<ContextSettings, "contextGroups"> | undefined,
	contexts: readonly string[] | string | undefined
): { group: ContextGroup; context: ContextDefinition } | undefined {
	const names = typeof contexts === "string" ? [contexts] : (contexts ?? []);
	for (const name of names) {
		const context = findContext(settings, name);
		if (!context) continue;
		const group = settings?.contextGroups.find((candidate) =>
			candidate.contexts.includes(context)
		);
		if (group) return { group, context };
	}
	return undefined;
}

/** Color of the context that styles an item; see resolveContext. */
export function resolveContextColor(
	settings: ContextSettings | undefined,
	contexts: readonly string[] | string | undefined
): string | undefined {
	return resolveContext(settings, contexts)?.color;
}

/** A context's name with its emoji in front, when it has one. */
export function formatContextLabel(context: Pick<ContextDefinition, "name" | "emoji">): string {
	const emoji = context.emoji?.trim();
	return emoji ? `${emoji} ${context.name}` : context.name;
}

/**
 * Key for an external event's stored context. Recurring occurrences share their
 * series key, so a context applies to every occurrence.
 */
export function getExternalEventContextKey(
	event: Pick<ICSEvent, "id" | "subscriptionId" | "recurringEventId">
): string {
	return event.recurringEventId
		? `${event.subscriptionId}::series::${event.recurringEventId}`
		: event.id;
}

export function getExternalEventContext(
	settings: Pick<ContextSettings, "externalEventContexts"> | undefined,
	event: Pick<ICSEvent, "id" | "subscriptionId" | "recurringEventId">
): string | undefined {
	return settings?.externalEventContexts?.[getExternalEventContextKey(event)];
}

/** Sets or clears (with an empty name) the stored context for an external event. */
export function setExternalEventContext(
	settings: Pick<ContextSettings, "externalEventContexts">,
	event: Pick<ICSEvent, "id" | "subscriptionId" | "recurringEventId">,
	name: string | undefined
): void {
	const key = getExternalEventContextKey(event);
	const next = { ...(settings.externalEventContexts ?? {}) };
	if (name) {
		next[key] = name;
	} else {
		delete next[key];
	}
	settings.externalEventContexts = next;
}

/** Enabled contexts as dropdown choices, labelled with their group. */
export function getContextChoices(
	settings: Pick<ContextSettings, "contextGroups">
): Array<{ value: string; label: string }> {
	const choices: Array<{ value: string; label: string }> = [];
	for (const group of settings.contextGroups ?? []) {
		for (const context of group.contexts) {
			const name = context.name.trim();
			if (!context.enabled || !name) continue;
			const label = formatContextLabel(context);
			choices.push({ value: name, label: group.name ? `${group.name} › ${label}` : label });
		}
	}
	return choices;
}
