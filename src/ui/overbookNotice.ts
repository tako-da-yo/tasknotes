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
	/** Local today as YYYY-MM-DD; past days are never warned about. */
	today(): string;
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
		const today = this.deps.today();
		for (const date of new Set(dates)) {
			if (date < today) continue;
			const last = this.lastShown.get(date);
			if (last !== undefined && this.deps.now() - last <= RATE_LIMIT_MS) continue;
			// Claim the slot before awaiting so an overlapping check for this date stays quiet.
			const claimed = this.deps.now();
			this.lastShown.set(date, claimed);
			let c: DayCapacity;
			try {
				c = await this.deps.getCapacity(date);
			} catch (error) {
				this.release(date, claimed, last);
				// The notice is advisory; never let it disturb the save that triggered it.
				logger.warn("Could not compute capacity for overbook notice", {
					category: "stale-data",
					operation: "overbook-check",
					details: { date },
					error,
				});
				continue;
			}
			// Days off have no capacity to exceed.
			if (!c.hasWorkHours || c.overByMinutes <= 0) {
				this.release(date, claimed, last);
				continue;
			}
			this.deps.notify(
				this.deps.t("capacity.overbooked", {
					day: this.deps.formatDay(date),
					over: this.deps.fmt(c.overByMinutes),
				})
			);
		}
	}

	/** Undo a provisional claim, unless a later check has replaced it. */
	private release(date: string, claimed: number, previous: number | undefined): void {
		if (this.lastShown.get(date) !== claimed) return;
		if (previous === undefined) this.lastShown.delete(date);
		else this.lastShown.set(date, previous);
	}
}
