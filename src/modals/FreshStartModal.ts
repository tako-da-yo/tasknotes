import { App, Modal, Setting, type ButtonComponent } from "obsidian";
import { canConfirmFreshStart, type FreshStartPreview } from "../core/freshStartPlanning";

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
	private confirmButton: ButtonComponent | null = null;

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
						this.updateConfirm();
					})
				);
		}

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText(this.t("common.cancel")).onClick(() => this.finish(false))
			)
			.addButton((button) => {
				this.confirmButton = button
					.setCta()
					.setButtonText(this.t("modals.freshStart.confirm"))
					.onClick(() => {
						if (canConfirmFreshStart(this.preview, this.clearDue)) this.finish(true);
					});
			});
		this.updateConfirm();
	}

	/** Due-only selections change nothing unless "clear due" is on, so confirm stays disabled. */
	private updateConfirm(): void {
		this.confirmButton?.setDisabled(!canConfirmFreshStart(this.preview, this.clearDue));
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
