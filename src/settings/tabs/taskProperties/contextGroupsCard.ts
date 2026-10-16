import { setIcon, setTooltip } from "obsidian";
import TaskNotesPlugin from "../../../main";
import type { ContextDefinition, ContextGroup } from "../../../types/settings";
import {
	createCard,
	createCardInput,
	createCardToggle,
	createDeleteHeaderButton,
	setupCardDragAndDrop,
	showCardEmptyState,
} from "../../components/CardComponent";
import { createPropertyDescription, TranslateFn } from "./helpers";
import { ContextPicker } from "../../../components/ContextPicker";
import { EnergyKindControl } from "../../../components/EnergyKindControl";

const DEFAULT_CONTEXT_COLOR = "#6366f1";
// Own drag type, so context drags don't trigger the group cards' drop handling.
const CONTEXT_DRAG_TYPE = "application/x-tasknotes-context";

function toHexColor(color: string | undefined): string {
	return color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_CONTEXT_COLOR;
}

function createId(prefix: string): string {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Moves the dragged item next to the target, keeping everything else in order. */
export function moveById<T extends { id: string }>(
	items: readonly T[],
	draggedId: string,
	targetId: string,
	insertBefore: boolean
): T[] {
	const dragged = items.find((item) => item.id === draggedId);
	if (!dragged || draggedId === targetId) return [...items];
	const rest = items.filter((item) => item.id !== draggedId);
	const targetIndex = rest.findIndex((item) => item.id === targetId);
	if (targetIndex === -1) return [...items];
	rest.splice(insertBefore ? targetIndex : targetIndex + 1, 0, dragged);
	return rest;
}

/**
 * Moves a context next to `targetContextId` in `targetGroupId`, or to the end of
 * that group when there is no target context. Works within and across groups.
 */
export function moveContext(
	groups: ContextGroup[],
	contextId: string,
	targetGroupId: string,
	targetContextId: string | null,
	insertBefore: boolean
): void {
	const sourceGroup = groups.find((group) =>
		group.contexts.some((context) => context.id === contextId)
	);
	const targetGroup = groups.find((group) => group.id === targetGroupId);
	if (!sourceGroup || !targetGroup || contextId === targetContextId) return;

	const context = sourceGroup.contexts.find((candidate) => candidate.id === contextId);
	if (!context) return;
	sourceGroup.contexts = sourceGroup.contexts.filter((candidate) => candidate.id !== contextId);

	const targetIndex = targetContextId
		? targetGroup.contexts.findIndex((candidate) => candidate.id === targetContextId)
		: -1;
	const insertAt =
		targetIndex === -1
			? targetGroup.contexts.length
			: insertBefore
				? targetIndex
				: targetIndex + 1;
	targetGroup.contexts.splice(insertAt, 0, context);
}

function hasContextDrag(event: DragEvent): boolean {
	return event.dataTransfer?.types.includes(CONTEXT_DRAG_TYPE) ?? false;
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
	contextList.addEventListener("dragover", (event) => {
		if (!hasContextDrag(event)) return;
		event.preventDefault();
		contextList.addClass("tn-context-list--drag-over");
	});
	contextList.addEventListener("dragleave", (event) => {
		if (!contextList.contains(event.relatedTarget as Node | null)) {
			contextList.removeClass("tn-context-list--drag-over");
		}
	});
	contextList.addEventListener("drop", (event) => {
		contextList.removeClass("tn-context-list--drag-over");
		const contextId = event.dataTransfer?.getData(CONTEXT_DRAG_TYPE);
		if (!contextId) return;
		event.preventDefault();
		event.stopPropagation();
		moveContext(plugin.settings.contextGroups, contextId, group.id, null, false);
		save();
		rerender();
	});
	for (const context of group.contexts) {
		renderContextRow(
			contextList,
			group,
			context,
			plugin,
			save,
			translate,
			rerender,
			onNamesChanged
		);
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
		draggable: true,
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

	// Group order is the order contexts appear in pickers and menus.
	setupCardDragAndDrop(card, container, (draggedId, targetId, insertBefore) => {
		plugin.settings.contextGroups = moveById(
			plugin.settings.contextGroups,
			draggedId,
			targetId,
			insertBefore
		);
		save();
		rerender();
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

	const dragHandle = row.createDiv("tn-context-row__drag-handle");
	setIcon(dragHandle, "grip-vertical");
	dragHandle.draggable = true;
	setTooltip(dragHandle, translate("contextGroups.settings.dragContext"));
	dragHandle.addEventListener("dragstart", (event) => {
		event.stopPropagation();
		event.dataTransfer?.setData(CONTEXT_DRAG_TYPE, context.id);
		if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
		row.addClass("tn-context-row--dragging");
	});
	dragHandle.addEventListener("dragend", () => row.removeClass("tn-context-row--dragging"));

	const clearDropIndicator = () =>
		row.removeClass("tn-context-row--drop-before", "tn-context-row--drop-after");
	const isUpperHalf = (event: DragEvent) => {
		const rect = row.getBoundingClientRect();
		return event.clientY < rect.top + rect.height / 2;
	};
	row.addEventListener("dragover", (event) => {
		if (!hasContextDrag(event)) return;
		event.preventDefault();
		event.stopPropagation();
		clearDropIndicator();
		row.addClass(
			isUpperHalf(event) ? "tn-context-row--drop-before" : "tn-context-row--drop-after"
		);
	});
	row.addEventListener("dragleave", clearDropIndicator);
	row.addEventListener("drop", (event) => {
		clearDropIndicator();
		const contextId = event.dataTransfer?.getData(CONTEXT_DRAG_TYPE);
		if (!contextId) return;
		event.preventDefault();
		event.stopPropagation();
		moveContext(
			plugin.settings.contextGroups,
			contextId,
			group.id,
			context.id,
			isUpperHalf(event)
		);
		save();
		rerender();
	});

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

	new EnergyKindControl(row, {
		value: context.energy,
		labels: {
			spark: translate("energy.kinds.spark"),
			steady: translate("energy.kinds.steady"),
			drain: translate("energy.kinds.drain"),
		},
		groupLabel: translate("contextGroups.settings.energy"),
		onChange: (energy) => {
			context.energy = energy === "steady" ? undefined : energy;
			save();
		},
	});

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
