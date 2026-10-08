import { setIcon, setTooltip } from "obsidian";
import TaskNotesPlugin from "../../../main";
import type { ContextDefinition, ContextGroup } from "../../../types/settings";
import {
	createCard,
	createCardInput,
	createCardToggle,
	createDeleteHeaderButton,
	showCardEmptyState,
} from "../../components/CardComponent";
import { createPropertyDescription, TranslateFn } from "./helpers";
import { ContextPicker } from "../../../components/ContextPicker";

const DEFAULT_CONTEXT_COLOR = "#6366f1";

function toHexColor(color: string | undefined): string {
	return color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_CONTEXT_COLOR;
}

function createId(prefix: string): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Renders the Context groups card: groups of named, colored contexts, and the
 * context whose color is used for items without one.
 */
export function renderContextGroupsCard(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	translate: TranslateFn
): void {
	const fallbackContainer = activeWindow.createDiv("tn-context-fallback");
	const refreshFallbackOptions = () => {
		fallbackContainer.empty();
		new ContextPicker(fallbackContainer, {
			groups: plugin.settings.contextGroups,
			value: plugin.settings.fallbackContext,
			noneLabel: translate("contextGroups.settings.fallbackNone"),
			onChange: (name) => {
				plugin.settings.fallbackContext = name ?? "";
				save();
			},
		});
	};
	refreshFallbackOptions();

	const groupsContainer = activeWindow.createDiv("tasknotes-settings__nested-cards");
	const rerender = () => {
		renderGroups(groupsContainer, plugin, save, translate, rerender, refreshFallbackOptions);
		refreshFallbackOptions();
	};
	renderGroups(groupsContainer, plugin, save, translate, rerender, refreshFallbackOptions);

	const addGroupButton = activeWindow.createEl("button", {
		text: translate("contextGroups.settings.addGroup"),
		cls: "tn-btn tn-btn--ghost",
	});
	addGroupButton.addEventListener("click", () => {
		plugin.settings.contextGroups = [
			...plugin.settings.contextGroups,
			{ id: createId("context_group"), name: "", contexts: [] },
		];
		save();
		rerender();
	});

	createCard(container, {
		id: "property-context-groups",
		collapsible: true,
		defaultCollapsed: true,
		header: {
			primaryText: translate("contextGroups.settings.name"),
		},
		content: {
			sections: [
				{
					rows: [
						{
							label: "",
							input: createPropertyDescription(
								translate("contextGroups.settings.description")
							),
							fullWidth: true,
						},
						{
							label: translate("contextGroups.settings.fallback"),
							input: fallbackContainer,
						},
						{ label: "", input: groupsContainer, fullWidth: true },
						{ label: "", input: addGroupButton, fullWidth: true },
					],
				},
			],
		},
	});
}

function renderGroups(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	translate: TranslateFn,
	rerender: () => void,
	onNamesChanged: () => void
): void {
	container.empty();
	if (plugin.settings.contextGroups.length === 0) {
		showCardEmptyState(container, translate("contextGroups.settings.emptyState"));
		return;
	}

	for (const group of plugin.settings.contextGroups) {
		renderGroupCard(container, group, plugin, save, translate, rerender, onNamesChanged);
	}
}

function renderGroupCard(
	container: HTMLElement,
	group: ContextGroup,
	plugin: TaskNotesPlugin,
	save: () => void,
	translate: TranslateFn,
	rerender: () => void,
	onNamesChanged: () => void
): void {
	const nameInput = createCardInput(
		"text",
		translate("contextGroups.settings.groupNamePlaceholder"),
		group.name
	);

	const contextList = activeWindow.createDiv("tn-context-list");
	for (const context of group.contexts) {
		renderContextRow(contextList, group, context, plugin, save, translate, rerender, onNamesChanged);
	}

	const addContextButton = activeWindow.createEl("button", {
		text: translate("contextGroups.settings.addContext"),
		cls: "tn-btn tn-btn--ghost",
	});
	addContextButton.addEventListener("click", () => {
		group.contexts.push({
			id: createId("context"),
			name: "",
			color: DEFAULT_CONTEXT_COLOR,
			enabled: true,
		});
		save();
		rerender();
	});

	const card = createCard(container, {
		id: group.id,
		collapsible: true,
		defaultCollapsed: false,
		header: {
			primaryText: group.name || translate("contextGroups.settings.groupNamePlaceholder"),
			actions: [
				createDeleteHeaderButton(() => {
					plugin.settings.contextGroups = plugin.settings.contextGroups.filter(
						(candidate) => candidate.id !== group.id
					);
					if (
						group.contexts.some(
							(context) => context.name === plugin.settings.fallbackContext
						)
					) {
						plugin.settings.fallbackContext = "";
					}
					save();
					rerender();
				}, translate("contextGroups.settings.deleteGroup")),
			],
		},
		content: {
			sections: [
				{
					rows: [
						{ label: translate("contextGroups.settings.groupName"), input: nameInput },
						{ label: "", input: contextList, fullWidth: true },
						{ label: "", input: addContextButton, fullWidth: true },
					],
				},
			],
		},
	});

	nameInput.addEventListener("input", () => {
		group.name = nameInput.value;
		const title = card.querySelector(".tasknotes-settings__card-primary-text");
		if (title) {
			title.textContent =
				group.name || translate("contextGroups.settings.groupNamePlaceholder");
		}
		save();
		onNamesChanged();
	});
}

function renderContextRow(
	container: HTMLElement,
	group: ContextGroup,
	context: ContextDefinition,
	plugin: TaskNotesPlugin,
	save: () => void,
	translate: TranslateFn,
	rerender: () => void,
	onNamesChanged: () => void
): void {
	const row = container.createDiv("tn-context-row");

	// Native color picker; contexts store hex colors.
	const colorInput = createCardInput("color", undefined, toHexColor(context.color));
	colorInput.addClass("tn-context-row__color");
	setTooltip(colorInput, translate("contextGroups.settings.color"));
	colorInput.addEventListener("input", () => {
		context.color = colorInput.value;
		nameInput.style.color = context.color;
		save();
	});
	row.appendChild(colorInput);

	const emojiInput = createCardInput("text", "🙂", context.emoji ?? "");
	emojiInput.addClass("tn-context-row__emoji");
	setTooltip(emojiInput, translate("contextGroups.settings.emoji"));
	emojiInput.addEventListener("input", () => {
		context.emoji = emojiInput.value.trim() || undefined;
		save();
		onNamesChanged();
	});
	row.appendChild(emojiInput);

	const nameInput = createCardInput(
		"text",
		translate("contextGroups.settings.contextNamePlaceholder"),
		context.name
	);
	nameInput.addClass("tn-context-row__name");
	nameInput.style.color = context.color;
	nameInput.addEventListener("input", () => {
		const previousName = context.name;
		context.name = nameInput.value;
		if (previousName && previousName === plugin.settings.fallbackContext) {
			plugin.settings.fallbackContext = context.name;
		}
		save();
		onNamesChanged();
	});
	row.appendChild(nameInput);

	const toggle = createCardToggle(context.enabled, (value) => {
		context.enabled = value;
		save();
	});
	setTooltip(toggle, translate("contextGroups.settings.enabled"));
	row.appendChild(toggle);

	const deleteButton = row.createEl("button", {
		cls: "clickable-icon tn-context-row__delete",
		attr: { "aria-label": translate("contextGroups.settings.deleteContext") },
	});
	setIcon(deleteButton, "trash-2");
	deleteButton.addEventListener("click", () => {
		group.contexts = group.contexts.filter((candidate) => candidate.id !== context.id);
		if (context.name === plugin.settings.fallbackContext) {
			plugin.settings.fallbackContext = "";
		}
		save();
		rerender();
	});
}
