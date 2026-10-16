import { App, Modal, Notice, TFile } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { DayCapacity } from "../core/dayCapacity";
import { formatTime } from "../utils/helpers";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import { capacityStatusText } from "./capacityText";

const logger = createTaskNotesLogger({ tag: "UI/CapacityPopover" });

/**
 * Shows a day's capacity: planned tasks, unestimated count and shortcuts.
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

	constructor(
		app: App,
		private plugin: TaskNotesPlugin,
		private capacity: DayCapacity,
		private anchor: HTMLElement | null
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, plugin, capacity } = this;
		const t = (key: string, params?: Record<string, string | number>) =>
			plugin.i18n.translate(key, params);

		this.modalEl.addClass("tn-capacity-popover");
		this.setTitle(t("capacity.ariaLabel"));

		const summary =
			capacityStatusText(capacity, t, formatTime) ??
			(capacity.hasWorkHours
				? t("capacity.status", {
						planned: formatTime(0),
						free: formatTime(capacity.availableMinutes),
					})
				: t("capacity.noWorkHours", { planned: formatTime(0) }));
		contentEl.createDiv({
			cls: "tn-capacity-popover__summary",
			text: summary,
		}).toggleClass("is-over", capacity.overByMinutes > 0);

		const rows = capacity.tasks.filter((task) => task.minutes > 0);
		if (rows.length > 0) {
			const list = contentEl.createDiv({ cls: "tn-capacity-popover__list" });
			for (const row of rows) {
				const title =
					plugin.cacheManager.getCachedTaskInfoSync(row.path)?.title ?? row.path;
				const rowEl = list.createEl("button", {
					cls: "tn-capacity-popover__row",
					attr: { type: "button" },
				});
				rowEl.createSpan({ cls: "tn-capacity-popover__title", text: title });
				const meta = rowEl.createSpan({ cls: "tn-capacity-popover__meta" });
				if (row.calibrated) {
					meta.createSpan({
						cls: "tn-capacity-popover__tag",
						text: t("capacity.calibrated"),
					});
				}
				meta.createSpan({ text: formatTime(row.minutes) });
				rowEl.addEventListener("click", () => {
					void this.openTask(row.path);
				});
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
			void plugin.openBasesFileForCommand("open-tasks-view");
		});

		if (plugin.triageService?.isInboxReady()) {
			const moveToInbox = actions.createEl("button", {
				text: t("capacity.moveToInbox"),
				attr: { type: "button" },
			});
			moveToInbox.addEventListener("click", () => {
				this.closeAndNavigate();
				void (async () => {
					await plugin.openBasesFileForCommand("open-tasks-view");
					plugin.taskSelectionService?.enterSelectionMode();
					new Notice(t("capacity.moveToInboxHint"));
				})();
			});
		}
	}

	onClose(): void {
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
