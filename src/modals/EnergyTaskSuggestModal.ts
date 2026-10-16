import { App, SuggestModal } from "obsidian";
import type { TaskInfo } from "../types";

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
