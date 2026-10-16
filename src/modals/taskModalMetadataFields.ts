import { App, Setting } from "obsidian";
import TaskNotesPlugin from "../main";
import { sanitizeTags } from "../utils/helpers";
import { ContextSuggest, TagSuggest } from "./taskModalSuggests";
import { ContextPicker } from "../components/ContextPicker";
import { splitListPreservingLinksAndQuotes } from "../utils/stringSplit";

/** The contexts control: a text input, or a context picker when contexts are configured. */
export interface TaskModalContextsControl {
	value: string;
	focus(): void;
}

export interface TaskModalMetadataFieldContext {
	app: App;
	plugin: TaskNotesPlugin;
	translate: (key: string) => string;
	attachMobileKeyboardScrollGuard: (input: HTMLInputElement) => void;
}

export interface CreateTaskModalTextFieldOptions {
	container: HTMLElement;
	value: string;
	onChange: (value: string) => void;
}

export interface TaskModalEstimateHint {
	text: string;
	minutes: number;
}

export interface CreateTaskModalTimeEstimateFieldOptions {
	container: HTMLElement;
	value: number;
	onChange: (value: number) => void;
	/** Optional calibration hint shown under the input for the current estimate. */
	hint?: (estimate: number) => TaskModalEstimateHint | null;
}

export function parseTaskModalTimeEstimate(value: string): number {
	return parseInt(value) || 0;
}

export function createTaskModalContextsField(
	context: TaskModalMetadataFieldContext,
	options: CreateTaskModalTextFieldOptions
): TaskModalContextsControl {
	const groups = context.plugin.settings?.contextGroups ?? [];
	if (groups.some((group) => group.contexts.some((entry) => entry.enabled))) {
		// Configured contexts: choose one from a picker instead of typing.
		const setting = new Setting(options.container);
		setting.setName(context.translate("modals.task.contextsLabel"));
		return new ContextPicker(setting.controlEl, {
			groups,
			value: splitListPreservingLinksAndQuotes(options.value)[0],
			noneLabel: context.translate("contextGroups.menu.none"),
			onChange: (name) => options.onChange(name ?? ""),
		});
	}

	let inputEl: HTMLInputElement | null = null;
	const setting = new Setting(options.container);
	setting.settingEl.addClass("tn-task-modal__wide-text-setting");
	setting.setName(context.translate("modals.task.contextsLabel")).addText((text) => {
		text.setPlaceholder(context.translate("modals.task.contextsPlaceholder"))
			.setValue(options.value)
			.onChange(options.onChange);

		inputEl = text.inputEl;
		context.attachMobileKeyboardScrollGuard(text.inputEl);
		new ContextSuggest(context.app, text.inputEl, context.plugin);
	});

	if (!inputEl) {
		throw new Error("Failed to create contexts input");
	}
	return inputEl;
}

export function createTaskModalTagsField(
	context: TaskModalMetadataFieldContext,
	options: CreateTaskModalTextFieldOptions
): HTMLInputElement {
	let inputEl: HTMLInputElement | null = null;
	const setting = new Setting(options.container);
	setting.settingEl.addClass("tn-task-modal__wide-text-setting");
	setting.setName(context.translate("modals.task.tagsLabel")).addText((text) => {
		text.setPlaceholder(context.translate("modals.task.tagsPlaceholder"))
			.setValue(options.value)
			.onChange((value) => {
				options.onChange(sanitizeTags(value));
			});

		inputEl = text.inputEl;
		context.attachMobileKeyboardScrollGuard(text.inputEl);
		new TagSuggest(context.app, text.inputEl, context.plugin);
	});

	if (!inputEl) {
		throw new Error("Failed to create tags input");
	}
	return inputEl;
}

export function createTaskModalTimeEstimateField(
	context: TaskModalMetadataFieldContext,
	options: CreateTaskModalTimeEstimateFieldOptions
): HTMLInputElement {
	let inputEl: HTMLInputElement | null = null;
	new Setting(options.container)
		.setName(context.translate("modals.task.timeEstimateLabel"))
		.addText((text) => {
			text.setPlaceholder(context.translate("modals.task.timeEstimatePlaceholder"))
				.setValue(options.value.toString())
				.onChange((value) => {
					const estimate = parseTaskModalTimeEstimate(value);
					options.onChange(estimate);
					refresh(estimate);
				});

			inputEl = text.inputEl;
			context.attachMobileKeyboardScrollGuard(text.inputEl);
		});

	if (!inputEl) {
		throw new Error("Failed to create time estimate input");
	}
	const input: HTMLInputElement = inputEl;
	const hintEl = options.hint ? options.container.createDiv({ cls: "tn-estimate-hint" }) : null;

	function refresh(estimate: number): void {
		if (!hintEl || !options.hint) return;
		hintEl.empty();
		const hint = options.hint(estimate);
		if (!hint) return;
		hintEl.createSpan({ text: hint.text });
		const useEl = hintEl.createEl("a", {
			cls: "tn-estimate-hint__use",
			text: context.translate("modals.task.estimateHintUse"),
			attr: { href: "#" },
		});
		useEl.addEventListener("click", (event) => {
			event.preventDefault();
			input.value = hint.minutes.toString();
			options.onChange(hint.minutes);
			// The applied value is already calibrated; re-hinting it would compound.
			hintEl.empty();
		});
	}

	refresh(options.value);
	return input;
}
