import type { TaskInfo } from "../types";

export type TriageAction =
	| { kind: "today" }
	| { kind: "schedule"; date: string }
	| { kind: "someday" }
	| { kind: "done" }
	| { kind: "drop" }
	| { kind: "skip" };

export interface TriageConfig {
	today: string;
	defaultStatus: string;
	somedayStatus: string;
	completedStatus: string;
}

export type TriageUpdate =
	| { kind: "update"; updates: Partial<TaskInfo> }
	| { kind: "archive" }
	| { kind: "none" };

export function selectInboxTasks(tasks: TaskInfo[], inboxStatus: string): TaskInfo[] {
	if (!inboxStatus) return [];
	return tasks
		.filter((t) => t.status === inboxStatus && !t.archived)
		.sort((a, b) => (a.dateCreated ?? "").localeCompare(b.dateCreated ?? ""));
}

export function updatesForAction(_task: TaskInfo, action: TriageAction, cfg: TriageConfig): TriageUpdate {
	switch (action.kind) {
		case "today":
			return { kind: "update", updates: { status: cfg.defaultStatus, scheduled: cfg.today } };
		case "schedule":
			return { kind: "update", updates: { status: cfg.defaultStatus, scheduled: action.date } };
		case "someday":
			return { kind: "update", updates: { status: cfg.somedayStatus } };
		case "done":
			return { kind: "update", updates: { status: cfg.completedStatus } };
		case "drop":
			return { kind: "archive" };
		case "skip":
			return { kind: "none" };
	}
}

export class TriageSession {
	private index = 0;
	private history: { task: TaskInfo; action: TriageAction | null }[] = [];

	constructor(private readonly queue: TaskInfo[]) {}

	current(): TaskInfo | null {
		return this.queue[this.index] ?? null;
	}

	position(): { index: number; total: number } {
		return { index: this.index, total: this.queue.length };
	}

	record(task: TaskInfo, action: TriageAction | null): void {
		this.history.push({ task, action });
		this.index++;
	}

	undo(): { task: TaskInfo; action: TriageAction | null } | null {
		const last = this.history.pop();
		if (!last) return null;
		this.index = Math.max(0, this.index - 1);
		return last;
	}

	summary(): { sorted: number; skipped: number } {
		const skipped = this.history.filter((h) => h.action?.kind === "skip").length;
		return { sorted: this.history.length - skipped, skipped };
	}
}
