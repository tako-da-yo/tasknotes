import { App, SuggestModal } from "obsidian";
import type { TaskInfo } from "../types";
import { schedulePresetDates } from "./InboxTriageModal";

/** A move-to choice for a drain task; `date: null` means "pick a date". */
export interface RescheduleOption {
	label: string;
	date: string | null;
}

/**
 * The triage Schedule presets (from today), minus any that is the day the task is
 * already on (`fromDate`, the panel's date), followed by "Pick date…".
 */
export function drainRescheduleOptions(today: Date, fromDate: string, t: (key: string) => string): RescheduleOption[] {
	const dates = schedulePresetDates(today);
	const presets: RescheduleOption[] = [
		{ label: t("modals.inboxTriage.schedule.tomorrow"), date: dates.tomorrow },
		{ label: t("modals.inboxTriage.schedule.weekend"), date: dates.weekend },
		{ label: t("modals.inboxTriage.schedule.nextWeek"), date: dates.nextWeek },
	];
	return [
		...presets.filter((o) => o.date !== fromDate),
		{ label: t("modals.inboxTriage.schedule.pick"), date: null },
	];
}

/** Chooser for where to move a drain task. */
export class EnergyRescheduleModal extends SuggestModal<RescheduleOption> {
	constructor(
		app: App,
		private readonly options: RescheduleOption[],
		placeholder: string,
		private readonly onChoose: (option: RescheduleOption) => void
	) {
		super(app);
		this.setPlaceholder(placeholder);
		this.containerEl.addClass("tn-energy-suggest-modal");
	}

	getSuggestions(query: string): RescheduleOption[] {
		const q = query.trim().toLowerCase();
		if (!q) return this.options;
		return this.options.filter((o) => o.label.toLowerCase().includes(q));
	}

	renderSuggestion(option: RescheduleOption, el: HTMLElement): void {
		el.createDiv({ text: option.label });
		if (option.date) el.createEl("small", { cls: "tn-energy-suggest-modal__date", text: option.date });
	}

	onChooseSuggestion(option: RescheduleOption): void {
		this.onChoose(option);
	}
}

/** A plain task picker used by the energy panel's low-battery actions. */
export class EnergyTaskSuggestModal extends SuggestModal<TaskInfo> {
	constructor(
		app: App,
		private readonly tasks: TaskInfo[],
		placeholder: string,
		private readonly onChoose: (task: TaskInfo) => void
	) {
		super(app);
		this.setPlaceholder(placeholder);
		this.containerEl.addClass("tn-energy-suggest-modal");
	}

	getSuggestions(query: string): TaskInfo[] {
		const q = query.trim().toLowerCase();
		if (!q) return this.tasks;
		return this.tasks.filter((task) => task.title.toLowerCase().includes(q));
	}

	renderSuggestion(task: TaskInfo, el: HTMLElement): void {
		el.setText(task.title);
	}

	onChooseSuggestion(task: TaskInfo): void {
		this.onChoose(task);
	}
}
