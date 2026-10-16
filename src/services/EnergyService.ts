import type { TaskInfo } from "../types";
import type { EnergyKind, TaskNotesSettings } from "../types/settings";
import { computeDayEnergy, DayEnergy } from "../core/energyModel";
import type { DayItem } from "../core/dayPlan";
import { resolveContext } from "../utils/contextColors";
import type { DayPlanService } from "./DayPlanService";

export class EnergyService {
	constructor(private readonly deps: {
		dayPlan: DayPlanService;
		getSettings(): TaskNotesSettings;
		calibratedMinutes(t: TaskInfo): number | null;
	}) {}

	isActive(): boolean {
		const s = this.deps.getSettings();
		if (!s.energy.enabled) return false;
		return s.contextGroups.some((g) => g.contexts.some((c) => c.enabled && (c.energy === "spark" || c.energy === "drain")));
	}

	async getDayEnergy(date: string): Promise<DayEnergy> {
		return this.compute(date, await this.deps.dayPlan.getDayItems(date));
	}

	async getEnergyInRange(start: string, end: string): Promise<Map<string, DayEnergy>> {
		const items = await this.deps.dayPlan.getDayItemsInRange(start, end);
		const out = new Map<string, DayEnergy>();
		for (const [date, dayItems] of items) out.set(date, this.compute(date, dayItems));
		return out;
	}

	onChange(listener: () => void): () => void {
		return this.deps.dayPlan.onChange(listener);
	}

	private compute(date: string, items: DayItem[]): DayEnergy {
		const s = this.deps.getSettings();
		return computeDayEnergy(items, {
			date,
			energy: s.energy,
			kindOf: (contexts): EnergyKind => resolveContext(s, contexts)?.energy ?? "steady",
			sizeOpenTask: (task) => {
				if (!task.timeEstimate) return null;
				const calibrated = s.calibration?.applyToPlanning ? this.deps.calibratedMinutes(task) : null;
				return calibrated ?? task.timeEstimate;
			},
			defaultEstimate: s.planning?.defaultEstimate ?? null,
		});
	}
}
