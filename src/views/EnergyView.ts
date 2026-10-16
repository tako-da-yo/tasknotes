import { ItemView, WorkspaceLeaf } from "obsidian";
import type TaskNotesPlugin from "../main";
import { ENERGY_VIEW_TYPE, EVENT_DATE_CHANGED } from "../types";
import { EnergyPanel, followTodayDate } from "../components/EnergyPanel";
import { PomodoroPanel } from "../components/PomodoroPanel";
import { createEnergyPanelDeps } from "../bootstrap/energyPanelDeps";
import { getTodayString } from "../utils/dateUtils";

/** Sidebar view with the focus timer above one day's energy, with day navigation. */
export class EnergyView extends ItemView {
	private panel: EnergyPanel | null = null;
	private pomodoro: PomodoroPanel | null = null;
	private pendingDate: string | null = null;
	private unsubscribe: (() => void) | null = null;
	// Today as of the last render: a view showing it is "following today".
	private lastToday = getTodayString();

	constructor(leaf: WorkspaceLeaf, private readonly plugin: TaskNotesPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return ENERGY_VIEW_TYPE;
	}

	getDisplayText(): string {
		return this.plugin.i18n.translate("energy.view.title");
	}

	getIcon(): string {
		return "battery-medium";
	}

	async onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("tn-energy-focus-view");
		this.lastToday = getTodayString();
		const date = this.pendingDate ?? this.lastToday;
		this.pendingDate = null;
		const focusEl = this.contentEl.createDiv({ cls: "tn-energy-focus-view__focus" });
		const energyEl = this.contentEl.createDiv({ cls: "tn-energy-focus-view__energy" });
		this.pomodoro = this.addChild(new PomodoroPanel(focusEl, this.plugin, this.contentEl));
		this.panel = new EnergyPanel(energyEl, createEnergyPanelDeps(this.plugin), {
			date,
			navigable: true,
		});
		this.unsubscribe = this.plugin.energyService.onChange(() => void this.refresh());
		this.registerEvent(this.plugin.emitter.on(EVENT_DATE_CHANGED, () => void this.refresh()));
		await Promise.all([this.pomodoro.open(), this.panel.render()]);
	}

	onResize(): void {
		this.pomodoro?.onResize();
	}

	/** Re-render; a view that was on today moves to the new today after midnight or sleep. */
	async refresh(): Promise<void> {
		const panel = this.panel;
		if (!panel) return;
		// The day's tasks or timeblocks changed, so the focus suggestions may have too.
		this.pomodoro?.refreshSuggestions();
		const today = getTodayString();
		const date = followTodayDate(panel.getDate(), this.lastToday, today);
		this.lastToday = today;
		await (date === panel.getDate() ? panel.render() : panel.setDate(date));
	}

	async onClose(): Promise<void> {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.panel = null;
		if (this.pomodoro) this.removeChild(this.pomodoro);
		this.pomodoro = null;
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
