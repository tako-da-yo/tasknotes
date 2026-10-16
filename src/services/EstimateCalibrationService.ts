import type { TaskInfo } from "../types";
import type { TaskNotesSettings } from "../types/settings";
import {
	type CalibrationResult,
	calibratedMinutes,
	computeCalibration,
	factorFor,
} from "../core/estimateCalibration";

export interface EstimateCalibrationDeps {
	getTasks(): TaskInfo[];
	isCompleted(s: string): boolean;
	getSettings(): TaskNotesSettings;
	today(): string;
}

type CalibrationTask = Pick<TaskInfo, "timeEstimate" | "contexts">;

/**
 * Memoised access to estimate calibration statistics. The cached result is
 * dropped whenever task data changes (see pluginBootstrap wiring), and is
 * recomputed when the day or the calibration window changes.
 */
export class EstimateCalibrationService {
	private cached: { key: string; result: CalibrationResult } | null = null;

	constructor(private readonly deps: EstimateCalibrationDeps) {}

	invalidate(): void {
		this.cached = null;
	}

	getCalibration(): CalibrationResult {
		const today = this.deps.today();
		const windowDays = this.deps.getSettings().calibration.windowDays;
		// The key also covers a changed window setting or a new calendar day.
		const key = `${today}|${windowDays}`;
		if (!this.cached || this.cached.key !== key) {
			this.cached = {
				key,
				result: computeCalibration(this.deps.getTasks(), {
					today,
					windowDays,
					isCompleted: (status) => this.deps.isCompleted(status),
				}),
			};
		}
		return this.cached.result;
	}

	calibratedMinutes(task: CalibrationTask): number | null {
		return calibratedMinutes(this.getCalibration(), task);
	}

	factorFor(
		task: CalibrationTask
	): { factor: number; source: "context" | "size" | "overall" } | null {
		return factorFor(this.getCalibration(), task);
	}
}
