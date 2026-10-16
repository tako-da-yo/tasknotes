import type { TaskInfo } from "../types";
import type { TaskNotesSettings } from "../types/settings";
import { computeDayCapacity, DayCapacity } from "../core/dayCapacity";
import type { DayPlanService } from "./DayPlanService";

export class CapacityService {
	constructor(private readonly deps: {
		dayPlan: DayPlanService;
		getSettings(): TaskNotesSettings;
		calibratedMinutes(task: TaskInfo): number | null;
		now(): number;
	}) {}

	async getDayCapacity(date: string): Promise<DayCapacity> {
		const settings = this.deps.getSettings();
		const items = await this.deps.dayPlan.getDayItems(date);
		return computeDayCapacity(items, {
			date,
			now: this.deps.now(),
			planning: settings.planning,
			sizeTask: (task) => {
				if (!task.timeEstimate) return null;
				const calibrated = settings.calibration.applyToPlanning ? this.deps.calibratedMinutes(task) : null;
				return calibrated ? { minutes: calibrated, calibrated: true } : { minutes: task.timeEstimate, calibrated: false };
			},
		});
	}
}
