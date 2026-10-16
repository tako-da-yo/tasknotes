import type { TaskInfo } from "../types";
import type { TaskNotesSettings } from "../types/settings";
import {
	planFreshStart,
	planFreshStartUndo,
	previewFreshStart,
	FreshStartPreview,
} from "../core/freshStartPlanning";
import { selectInboxTasks, updatesForAction, TriageAction } from "../core/triageSession";
import { isTriageStatusUsable } from "../core/captureStatus";

export type TriageRevert =
	| { kind: "updates"; path: string; previous: Partial<TaskInfo> }
	/** `task` is the TaskInfo returned by archiveTask (archived: true, current path). */
	| { kind: "archived"; task: TaskInfo };

export interface TriageServiceDeps {
	getTasks(): TaskInfo[];
	updateTask(task: TaskInfo, updates: Partial<TaskInfo>): Promise<TaskInfo>;
	archiveTask(task: TaskInfo): Promise<TaskInfo>;
	isCompleted(status: string): boolean;
	firstCompletedStatus(): string;
	statusExists(value: string): boolean;
	getSettings(): TaskNotesSettings;
	saveSettings(): Promise<void>;
	today(): string;
}

export class TriageService {
	constructor(private readonly deps: TriageServiceDeps) {}

	isInboxReady(): boolean {
		const { inboxStatus } = this.deps.getSettings().triage;
		return isTriageStatusUsable(inboxStatus, (v) => this.deps.statusExists(v));
	}

	/** Whether the Someday action is available: the someday status is set and still exists. */
	isSomedayReady(): boolean {
		const { somedayStatus } = this.deps.getSettings().triage;
		return isTriageStatusUsable(somedayStatus, (v) => this.deps.statusExists(v));
	}

	getInboxTasks(): TaskInfo[] {
		if (!this.isInboxReady()) return [];
		return selectInboxTasks(this.deps.getTasks(), this.deps.getSettings().triage.inboxStatus);
	}

	/** Applies an action and returns what is needed to revert it (null when nothing changed). */
	async applyAction(task: TaskInfo, action: TriageAction): Promise<TriageRevert | null> {
		if (action.kind === "someday" && !this.isSomedayReady()) return null;
		const settings = this.deps.getSettings();
		const result = updatesForAction(task, action, {
			today: this.deps.today(),
			defaultStatus: settings.defaultTaskStatus,
			somedayStatus: settings.triage.somedayStatus,
			completedStatus: this.deps.firstCompletedStatus(),
		});
		if (result.kind === "none") return null;
		if (result.kind === "archive") {
			const archived = await this.deps.archiveTask(task);
			return { kind: "archived", task: archived };
		}
		const current = this.findTask(task.path) ?? task;
		const previous: Partial<TaskInfo> = {};
		for (const key of Object.keys(result.updates) as (keyof TaskInfo)[]) {
			(previous as Record<string, unknown>)[key] = current[key];
		}
		await this.deps.updateTask(current, result.updates);
		return { kind: "updates", path: current.path, previous };
	}

	async revertAction(revert: TriageRevert): Promise<void> {
		if (revert.kind === "archived") {
			// Only unarchive; toggling an unarchived task would archive it again.
			if (revert.task.archived) await this.deps.archiveTask(revert.task);
			return;
		}
		const current = this.findTask(revert.path);
		if (!current) return;
		await this.deps.updateTask(current, revert.previous);
	}

	private findTask(path: string): TaskInfo | undefined {
		return this.deps.getTasks().find((t) => t.path === path);
	}

	previewFreshStart(): FreshStartPreview {
		return previewFreshStart(this.deps.getTasks(), this.deps.today(), (s) =>
			this.deps.isCompleted(s)
		);
	}

	async runFreshStart(
		clearDue: boolean,
		onProgress?: (done: number, total: number) => void
	): Promise<number> {
		return this.runFreshStartFor(this.deps.getTasks(), clearDue, onProgress);
	}

	/** Fresh start limited to `tasks`; the snapshot (and so undo) covers only these tasks. */
	async runFreshStartFor(
		tasks: TaskInfo[],
		clearDue: boolean,
		onProgress?: (done: number, total: number) => void
	): Promise<number> {
		const settings = this.deps.getSettings();
		const entries = planFreshStart(tasks, {
			today: this.deps.today(),
			clearDue,
			inboxStatus: this.isInboxReady() ? settings.triage.inboxStatus : "",
			isCompleted: (s) => this.deps.isCompleted(s),
		});
		if (entries.length === 0) return 0;
		// Persist the snapshot before writing so an interrupted run can still be undone.
		settings.triageLastFreshStart = { runAt: new Date().toISOString(), entries };
		await this.deps.saveSettings();
		const byPath = new Map(tasks.map((t) => [t.path, t]));
		let done = 0;
		for (const entry of entries) {
			const task = byPath.get(entry.path);
			if (task) await this.deps.updateTask(task, entry.after);
			onProgress?.(++done, entries.length);
		}
		return entries.length;
	}

	hasFreshStartSnapshot(): boolean {
		return !!this.deps.getSettings().triageLastFreshStart;
	}

	async undoFreshStart(): Promise<{ restored: number; skipped: number }> {
		const settings = this.deps.getSettings();
		const snapshot = settings.triageLastFreshStart;
		if (!snapshot) return { restored: 0, skipped: 0 };
		const current = new Map(this.deps.getTasks().map((t) => [t.path, t]));
		const { restores, skipped } = planFreshStartUndo(snapshot, current);
		for (const { path, updates } of restores) {
			const task = current.get(path);
			if (task) await this.deps.updateTask(task, updates);
		}
		settings.triageLastFreshStart = null;
		await this.deps.saveSettings();
		return { restored: restores.length, skipped };
	}
}
