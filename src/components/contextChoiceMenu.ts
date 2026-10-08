import type { Menu, MenuItem } from "obsidian";
import type { ContextGroup } from "../types/settings";
import { findContext, formatContextLabel } from "../utils/contextColors";

type MenuItemDom = { dom?: HTMLElement; domEl?: HTMLElement };

function colorMenuItemTitle(item: MenuItem, color: string): void {
	// Obsidian builds the item element after the callback returns.
	window.setTimeout(() => {
		const menuItem = item as unknown as MenuItemDom;
		const titleEl = (menuItem.dom ?? menuItem.domEl)?.querySelector(".menu-item-title");
		if (titleEl) {
			(titleEl as HTMLElement).style.color = color;
		}
	}, 10);
}

export interface ContextChoiceMenuOptions {
	groups: readonly ContextGroup[];
	/** The item's current context name, if any. */
	current: string | undefined;
	noneLabel: string;
	onSelect: (name: string | undefined) => void;
}

/**
 * Adds one item per enabled context, under a label for each group, plus a "none"
 * item. Choosing a context replaces the current one. Returns false when no
 * contexts are configured, so callers can offer something else instead.
 */
export function addContextChoiceItems(menu: Menu, options: ContextChoiceMenuOptions): boolean {
	const groups = options.groups ?? [];
	const currentContext = findContext({ contextGroups: [...groups] }, options.current);
	let added = false;

	for (const group of groups) {
		const contexts = group.contexts.filter((context) => context.enabled && context.name.trim());
		if (contexts.length === 0) continue;

		if (added) menu.addSeparator();
		menu.addItem((item) => item.setTitle(group.name || "—").setIsLabel(true));
		for (const context of contexts) {
			menu.addItem((item) => {
				item.setTitle(formatContextLabel(context))
					.setChecked(currentContext?.id === context.id)
					.onClick(() => options.onSelect(context.name));
				colorMenuItemTitle(item, context.color);
			});
		}
		added = true;
	}

	if (!added) return false;

	menu.addSeparator();
	menu.addItem((item) =>
		item
			.setTitle(options.noneLabel)
			.setIcon("x")
			.setChecked(!options.current)
			.onClick(() => options.onSelect(undefined))
	);
	return true;
}
