import { ItemView, WorkspaceLeaf } from "obsidian";
import type TaskNotesPlugin from "../main";
import { ENERGY_VIEW_TYPE } from "../types";
import { EnergyPanel } from "../components/EnergyPanel";
import { createEnergyPanelDeps } from "../bootstrap/energyPanelDeps";
import { getTodayString } from "../utils/dateUtils";

/** Sidebar view showing one day's energy, with day navigation. */
export class EnergyView extends ItemView {
	private panel: EnergyPanel | null = null;
	private pendingDate: string | null = null;
	private unsubscribe: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: TaskNotesPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return ENERGY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.plugin.i18n.translate("energy.panel.title");
	}

	getIcon(): string {
		return "battery-medium";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		const date = this.pendingDate ?? getTodayString();
		this.pendingDate = null;
		this.panel = new EnergyPanel(this.contentEl, createEnergyPanelDeps(this.plugin), {
			date,
			navigable: true,
		});
		this.unsubscribe = this.plugin.energyService.onChange(() => void this.panel?.render());
		await this.panel.render();
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.panel = null;
		this.contentEl.empty();
	}

	async setDate(date: string): Promise<void> {
		if (!this.panel) {
			this.pendingDate = date;
			return;
		}
		await this.panel.setDate(date);
	}
}
