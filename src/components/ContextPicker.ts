import { Menu } from "obsidian";
import type { ContextGroup } from "../types/settings";
import { findContext, formatContextLabel } from "../utils/contextColors";
import { addContextChoiceItems } from "./contextChoiceMenu";

export interface ContextPickerOptions {
	groups: readonly ContextGroup[];
	value?: string;
	noneLabel: string;
	onChange: (name: string | undefined) => void;
}

/**
 * Select-style control for choosing one context. Shows the chosen context's emoji and
 * colored name, and opens the grouped context menu when clicked.
 */
export class ContextPicker {
	readonly el: HTMLButtonElement;
	private current: string | undefined;

	constructor(
		container: HTMLElement,
		private readonly options: ContextPickerOptions
	) {
		this.current = options.value?.trim() || undefined;
		this.el = container.createEl("button", {
			cls: "tn-context-picker dropdown",
			attr: { type: "button" },
		});
		this.el.addEventListener("click", (event) => this.openMenu(event));
		this.render();
	}

	/** The chosen context name, or "" for none. */
	get value(): string {
		return this.current ?? "";
	}

	set value(name: string) {
		// Accepts a comma-separated contexts value; a picker holds a single context.
		this.current = name.split(",")[0].trim() || undefined;
		this.render();
	}

	focus(): void {
		this.el.focus();
	}

	private openMenu(event: MouseEvent): void {
		event.preventDefault();
		const menu = new Menu();
		addContextChoiceItems(menu, {
			groups: this.options.groups,
			current: this.current,
			noneLabel: this.options.noneLabel,
			onSelect: (name) => {
				this.current = name;
				this.render();
				this.options.onChange(name);
			},
		});
		const rect = this.el.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom + 4 });
	}

	private render(): void {
		this.el.empty();
		const label = this.el.createSpan("tn-context-picker__label");
		const context = findContext({ contextGroups: [...this.options.groups] }, this.current);
		if (context) {
			label.setText(formatContextLabel(context));
			label.style.color = context.color;
		} else {
			// Unconfigured contexts are shown as-is so they are not silently dropped.
			label.setText(this.current ?? this.options.noneLabel);
			label.toggleClass("tn-context-picker__label--empty", !this.current);
		}
	}
}
