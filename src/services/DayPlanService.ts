import type { ICSEvent, TaskInfo, TimeBlock } from "../types";
import { collectDayItems, DayItem } from "../core/dayPlan";

export interface DayPlanSources {
	getTasks(): TaskInfo[];
	/** ICS, Google and Microsoft events from their caches; must not hit the network. */
	getEvents(): ICSEvent[];
	getTimeblocks(date: string): Promise<TimeBlock[]>;
	isCompleted(s: string): boolean;
	isRecurringOnDate(task: TaskInfo, date: string): boolean;
	externalContextFor(e: ICSEvent): string | undefined;
	resolveAttachment(link: string): string | null;
	now(): number;
}

interface Snapshot {
	now: number;
	tasks: TaskInfo[];
	events: ICSEvent[];
}

function addDays(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

/**
 * Per-day planning items (tasks, external events, timeblocks), cached until
 * invalidate() is called. Data sources are injected so this has no plugin or UI
 * dependency.
 */
export class DayPlanService {
	private cache = new Map<string, Promise<DayItem[]>>();
	private listeners = new Set<() => void>();

	constructor(private readonly sources: DayPlanSources) {}

	getDayItems(date: string): Promise<DayItem[]> {
		return this.load(date, () => this.snapshot());
	}

	/** Items for every date from start to end inclusive (YYYY-MM-DD). */
	async getDayItemsInRange(start: string, end: string): Promise<Map<string, DayItem[]>> {
		// Read tasks and events at most once for the whole range.
		let snap: Snapshot | undefined;
		const shared = () => (snap ??= this.snapshot());
		const dates: string[] = [];
		for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
		const results = await Promise.all(dates.map((d) => this.load(d, shared)));
		return new Map(dates.map((d, i) => [d, results[i]]));
	}

	invalidate(): void {
		this.cache.clear();
		for (const listener of [...this.listeners]) listener();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private snapshot(): Snapshot {
		const s = this.sources;
		return { now: s.now(), tasks: s.getTasks(), events: s.getEvents() };
	}

	private load(date: string, snapshot: () => Snapshot): Promise<DayItem[]> {
		const cached = this.cache.get(date);
		if (cached) return cached;
		const pending = this.compute(date, snapshot());
		this.cache.set(date, pending);
		// Drop failed reads so the next request retries. A result computed before an
		// invalidate() is not re-cached because the map was cleared.
		pending.catch(() => {
			if (this.cache.get(date) === pending) this.cache.delete(date);
		});
		return pending;
	}

	private async compute(date: string, snap: Snapshot): Promise<DayItem[]> {
		const s = this.sources;
		return collectDayItems({
			date,
			now: snap.now,
			tasks: snap.tasks,
			events: snap.events,
			timeblocks: await s.getTimeblocks(date),
			isCompleted: (status) => s.isCompleted(status),
			isRecurringOnDate: (task, d) => s.isRecurringOnDate(task, d),
			externalContextFor: (event) => s.externalContextFor(event),
			resolveAttachment: (link) => s.resolveAttachment(link),
		});
	}
}
