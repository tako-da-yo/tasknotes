import { App, Modal, Setting } from "obsidian";
import type { FreshStartPreview } from "../core/freshStartPlanning";

export interface FreshStartModalResult {
	confirmed: boolean;
	clearDue: boolean;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Confirms a fresh start and asks whether past due dates should be cleared too. */
export class FreshStartModal extends Modal {
	private resolve: ((result: FreshStartModalResult) => void) | null = null;
	private clearDue = false;
	private settled = false;

	constructor(
		app: App,
		private readonly preview: FreshStartPreview,
		private readonly hasInbox: boolean,
		private readonly t: Translate
	) {
		super(app);
	}

	show(): Promise<FreshStartModalResult> {
		return new Promise((resolve) => {
			this.resolve = resolve;
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		new Setting(contentEl).setName(this.t("modals.freshStart.title")).setHeading();
		contentEl.createEl("p", {
			text: this.t("modals.freshStart.summary", { total: this.preview.total }),
		});

		const list = contentEl.createEl("ul");
		if (this.preview.scheduledCount > 0) {
			list.createEl("li", {
				text: this.t(
					this.hasInbox
						? "modals.freshStart.scheduledLine"
						: "modals.freshStart.scheduledLineNoInbox",
					{ count: this.preview.scheduledCount }
				),
			});
		}
		if (this.preview.dueCount > 0) {
			list.createEl("li", {
				text: this.t("modals.freshStart.dueLine", { count: this.preview.dueCount }),
			});
			new Setting(contentEl)
				.setName(this.t("modals.freshStart.clearDue"))
				.setDesc(this.t("modals.freshStart.clearDueHint"))
				.addToggle((toggle) =>
					toggle.setValue(false).onChange((value) => {
						this.clearDue = value;
					})
				);
		}

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText(this.t("common.cancel")).onClick(() => this.finish(false))
			)
			.addButton((button) =>
				button
					.setCta()
					.setButtonText(this.t("modals.freshStart.confirm"))
					.onClick(() => this.finish(true))
			);
	}

	private finish(confirmed: boolean): void {
		this.settle({ confirmed, clearDue: this.clearDue });
		this.close();
	}

	private settle(result: FreshStartModalResult): void {
		if (this.settled) return;
		this.settled = true;
		this.resolve?.(result);
	}

	onClose(): void {
		this.settle({ confirmed: false, clearDue: false });
		this.contentEl.empty();
	}
}
