import type { TaskInfo } from "../types";
import type { DayCapacity } from "../core/dayCapacity";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const logger = createTaskNotesLogger({ tag: "UI/OverbookNotifier" });

const RATE_LIMIT_MS = 5 * 60_000;

/**
 * The date a task now occupies (scheduled, or due when unscheduled), if it changed.
 */
export function datesTouched(before: Partial<TaskInfo>, after: Partial<TaskInfo>): string[] {
	const pick = (t: Partial<TaskInfo>) => (t.scheduled || t.due)?.slice(0, 10);
	const next = pick(after);
	return next && next !== pick(before) ? [next] : [];
}

export interface OverbookNotifierDeps {
	getCapacity(date: string): Promise<DayCapacity>;
	enabled(): boolean;
	notify(message: string): void;
	now(): number;
	formatDay(date: string): string;
	t(k: string, p?: Record<string, string | number>): string;
	fmt(m: number): string;
}

/**
 * Tells the user when something they scheduled pushed a day past its available time.
 * Called only from UI scheduling paths, never from API, MCP or webhook updates.
 */
export class OverbookNotifier {
	private lastShown = new Map<string, number>();

	constructor(private readonly deps: OverbookNotifierDeps) {}

	async check(dates: string[]): Promise<void> {
		if (dates.length === 0 || !this.deps.enabled()) return;
		for (const date of new Set(dates)) {
			const last = this.lastShown.get(date);
			if (last !== undefined && this.deps.now() - last <= RATE_LIMIT_MS) continue;
			let c: DayCapacity;
			try {
				c = await this.deps.getCapacity(date);
			} catch (error) {
				// The notice is advisory; never let it disturb the save that triggered it.
				logger.warn("Could not compute capacity for overbook notice", {
					category: "stale-data",
					operation: "overbook-check",
					details: { date },
					error,
				});
				continue;
			}
			if (c.overByMinutes <= 0) continue;
			this.lastShown.set(date, this.deps.now());
			this.deps.notify(
				this.deps.t("capacity.overbooked", {
					day: this.deps.formatDay(date),
					over: this.deps.fmt(c.overByMinutes),
				})
			);
		}
	}
}
