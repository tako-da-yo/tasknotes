import { ItemView, WorkspaceLeaf } from "obsidian";
import type TaskNotesPlugin from "../main";
import { ENERGY_VIEW_TYPE, POMODORO_VIEW_TYPE } from "../types";

/**
 * The Pomodoro timer now lives in the energy & focus sidebar. This view type stays
 * registered so a saved workspace with a Pomodoro tab opens that sidebar instead.
 */
export class PomodoroView extends ItemView {
	constructor(leaf: WorkspaceLeaf, private readonly plugin: TaskNotesPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return POMODORO_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.plugin.i18n.translate("energy.view.title");
	}

	getIcon(): string {
		return "battery-medium";
	}

	async onOpen(): Promise<void> {
		await this.plugin.onReady();
		if (this.app.workspace.getLeavesOfType(ENERGY_VIEW_TYPE).length > 0) {
			this.leaf.detach();
			return;
		}
		await this.leaf.setViewState({ type: ENERGY_VIEW_TYPE, active: true });
	}
}
