import {
	CALENDAR_CLICK_DEFAULT_TIME_ESTIMATE_MINUTES,
	calculateTaskCreationValues,
} from "../../../src/bases/calendar-core";

const start = new Date(2026, 9, 7, 14, 0);
const at = (minutesAfterStart: number) => new Date(start.getTime() + minutesAfterStart * 60000);

describe("calculateTaskCreationValues", () => {
	it("uses the 15 minute fallback for a timed click when no default is configured", () => {
		expect(calculateTaskCreationValues(start, at(30), false, 30, 0)).toEqual({
			scheduled: "2026-10-07T14:00",
			timeEstimate: CALENDAR_CLICK_DEFAULT_TIME_ESTIMATE_MINUTES,
		});
		expect(CALENDAR_CLICK_DEFAULT_TIME_ESTIMATE_MINUTES).toBe(15);
	});

	it("leaves the estimate unset for a timed click when a default is configured", () => {
		expect(calculateTaskCreationValues(start, at(30), false, 30, 45)).toEqual({
			scheduled: "2026-10-07T14:00",
		});
	});

	it("uses the dragged duration for timed drags", () => {
		expect(calculateTaskCreationValues(start, at(90), false, 30, 0).timeEstimate).toBe(90);
	});

	it("does not add an estimate to single-day all-day clicks", () => {
		const dayStart = new Date(2026, 9, 7);
		const nextDay = new Date(2026, 9, 8);
		expect(calculateTaskCreationValues(dayStart, nextDay, true, 30, 0)).toEqual({
			scheduled: "2026-10-07",
		});
	});
});
