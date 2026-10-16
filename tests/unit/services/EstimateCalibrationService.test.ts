import { EstimateCalibrationService } from "../../../src/services/EstimateCalibrationService";
import { TaskFactory } from "../../helpers/mock-factories";

describe("EstimateCalibrationService", () => {
	it("memoises until invalidated", () => {
		const tasks = Array.from({ length: 5 }, () =>
			TaskFactory.createTask({
				status: "done",
				completedDate: "2026-10-10",
				timeEstimate: 60,
				totalTrackedTime: 90,
			})
		);
		const getTasks = jest.fn(() => tasks);
		const svc = new EstimateCalibrationService({
			getTasks,
			isCompleted: (s) => s === "done",
			getSettings: () => ({ calibration: { windowDays: 90, applyToPlanning: true } }) as never,
			today: () => "2026-10-15",
		});
		expect(svc.getCalibration().overall?.factor).toBe(1.5);
		svc.getCalibration();
		expect(getTasks).toHaveBeenCalledTimes(1);
		svc.invalidate();
		svc.getCalibration();
		expect(getTasks).toHaveBeenCalledTimes(2);
		expect(svc.calibratedMinutes({ timeEstimate: 40, contexts: [] })).toBe(60);
		expect(svc.factorFor({ timeEstimate: 40, contexts: [] })).toEqual({
			factor: 1.5,
			source: "size",
		});
	});

	it("recomputes when the window setting or the day changes", () => {
		const getTasks = jest.fn(() => []);
		const settings = { calibration: { windowDays: 90, applyToPlanning: true } };
		let today = "2026-10-15";
		const svc = new EstimateCalibrationService({
			getTasks,
			isCompleted: () => true,
			getSettings: () => settings as never,
			today: () => today,
		});
		expect(svc.getCalibration().windowDays).toBe(90);
		settings.calibration.windowDays = 30;
		expect(svc.getCalibration().windowDays).toBe(30);
		today = "2026-10-16";
		svc.getCalibration();
		expect(getTasks).toHaveBeenCalledTimes(3);
	});
});
