import { App, Modal, Notice, setTooltip, TFile } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { TaskInfo } from "../types";
import { inboxMoveBlock, type DayCapacity } from "../core/dayCapacity";
import { formatTime } from "../utils/helpers";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import { capacityPopoverSummary } from "./capacityText";

const logger = createTaskNotesLogger({ tag: "UI/CapacityPopover" });

/** Name of the Today view in the default Tasks base (defaultBasesFiles.ts). */
const TODAY_VIEW_NAME = "Today";

/**
 * Shows a day's capacity: planned tasks, unestimated count and shortcuts.
 * Each task row can be sent back to the inbox when the inbox is set up.
 *
 * TaskNotes has no anchored popover component, and an Obsidian Menu cannot hold
 * this content, so this is a small modal on every platform. The anchor, when
 * given, gets focus back when the modal closes.
 */
export function openCapacityPopover(
	plugin: TaskNotesPlugin,
	anchor: HTMLElement | null,
	date: string
): void {
	void (async () => {
		try {
			const capacity = await plugin.capacityService.getDayCapacity(date);
			new CapacityModal(plugin.app, plugin, capacity, anchor).open();
		} catch (error) {
			logger.error("Failed to open capacity popover:", {
				category: "internal",
				operation: "open-capacity-popover",
				error,
			});
		}
	})();
}

class CapacityModal extends Modal {
	/** Cleared when the modal closes because the user navigated somewhere. */
	private restoreFocus = true;
	private closed = false;

	constructor(
		app: App,
		private plugin: TaskNotesPlugin,
		private capacity: DayCapacity,
		private anchor: HTMLElement | null
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("tn-capacity-popover");
		this.setTitle(this.t("capacity.ariaLabel"));
		this.render();
	}

	private t(key: string, params?: Record<string, string | number>): string {
		return this.plugin.i18n.translate(key, params);
	}

	private render(): void {
		const { contentEl, plugin, capacity } = this;
		const t = (key: string, params?: Record<string, string | number>) => this.t(key, params);
		contentEl.empty();

		contentEl.createDiv({
			cls: "tn-capacity-popover__summary",
			text: capacityPopoverSummary(capacity, t, formatTime),
		}).toggleClass("is-over", capacity.overByMinutes > 0);

		const inboxReady = !!plugin.triageService?.isInboxReady();
		const rows = capacity.tasks.filter((task) => task.minutes > 0);
		if (rows.length > 0) {
			const list = contentEl.createDiv({ cls: "tn-capacity-popover__list" });
			for (const row of rows) {
				const task = plugin.cacheManager.getCachedTaskInfoSync(row.path);
				const rowEl = list.createDiv({ cls: "tn-capacity-popover__row" });
				const openEl = rowEl.createEl("button", {
					cls: "tn-capacity-popover__open",
					attr: { type: "button" },
				});
				openEl.createSpan({
					cls: "tn-capacity-popover__title",
					text: task?.title ?? row.path,
				});
				const meta = openEl.createSpan({ cls: "tn-capacity-popover__meta" });
				if (row.calibrated) {
					meta.createSpan({
						cls: "tn-capacity-popover__tag",
						text: t("capacity.calibrated"),
					});
				}
				meta.createSpan({ text: formatTime(row.minutes) });
				openEl.addEventListener("click", () => {
					void this.openTask(row.path);
				});

				if (inboxReady && task) {
					this.renderMoveButton(rowEl, task);
				}
			}
		}

		if (capacity.unestimatedCount > 0) {
			contentEl.createDiv({
				cls: "tn-capacity-popover__unestimated",
				text: t("capacity.unestimated", { count: capacity.unestimatedCount }),
			});
		}

		const actions = contentEl.createDiv({ cls: "tn-capacity-popover__actions" });
		const openToday = actions.createEl("button", {
			cls: "mod-cta",
			text: t("capacity.openToday"),
			attr: { type: "button" },
		});
		openToday.addEventListener("click", () => {
			this.closeAndNavigate();
			void plugin.openBasesFileForCommand("open-tasks-view", TODAY_VIEW_NAME);
		});
	}

	private renderMoveButton(rowEl: HTMLElement, task: TaskInfo): void {
		const block = inboxMoveBlock(task, this.capacity.date);
		if (block) {
			const reason = this.t(
				block === "due" ? "capacity.moveBlockedDue" : "capacity.moveBlockedRecurring"
			);
			// Disabled buttons get no hover events, so the tooltip sits on a wrapper. The
			// button keeps its own name and carries the reason as its description.
			const wrapper = rowEl.createSpan({ cls: "tn-capacity-popover__move-wrapper" });
			setTooltip(wrapper, reason);
			const disabled = wrapper.createEl("button", {
				cls: "tn-capacity-popover__move",
				text: this.t("capacity.moveRowToInbox"),
				attr: { type: "button", "aria-description": reason },
			});
			disabled.disabled = true;
			return;
		}
		const button = rowEl.createEl("button", {
			cls: "tn-capacity-popover__move",
			text: this.t("capacity.moveRowToInbox"),
			attr: { type: "button" },
		});
		button.addEventListener("click", () => {
			button.disabled = true;
			void this.moveToInbox(task);
		});
	}

	private async moveToInbox(task: TaskInfo): Promise<void> {
		try {
			await this.plugin.triageService.moveToInbox(task);
			const capacity = await this.plugin.capacityService.getDayCapacity(this.capacity.date);
			if (this.closed) return;
			this.capacity = capacity;
			this.render();
		} catch (error) {
			logger.error("Failed to move task to inbox from capacity popover:", {
				category: "persistence",
				operation: "capacity-move-to-inbox",
				details: { path: task.path },
				error,
			});
			new Notice(this.t("capacity.moveFailed"));
			if (!this.closed) this.render();
		}
	}

	onClose(): void {
		this.closed = true;
		this.contentEl.empty();
		if (this.restoreFocus && this.anchor?.isConnected) this.anchor.focus();
	}

	private closeAndNavigate(): void {
		this.restoreFocus = false;
		this.close();
	}

	private async openTask(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return;
		this.closeAndNavigate();
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}
