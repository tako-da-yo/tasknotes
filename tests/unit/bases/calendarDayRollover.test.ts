import { getDayRolloverTargetDate } from "../../../src/bases/calendarRecreateUtils";

describe("getDayRolloverTargetDate", () => {
	const previousDay = new Date(2026, 9, 8);
	const now = new Date(2026, 9, 9, 8, 30);

	it("moves a view that was showing the previous today to the new today", () => {
		const visibleRange = { start: new Date(2026, 9, 8), end: new Date(2026, 9, 13) };
		expect(getDayRolloverTargetDate(previousDay, now, visibleRange, new Date(2026, 9, 8))).toBe(
			now
		);
	});

	it("keeps the date of a view the user navigated away from today", () => {
		const currentDate = new Date(2026, 9, 20);
		const visibleRange = { start: new Date(2026, 9, 20), end: new Date(2026, 9, 23) };
		expect(getDayRolloverTargetDate(previousDay, now, visibleRange, currentDate)).toBe(
			currentDate
		);
	});

	it("treats the visible range end as exclusive", () => {
		const currentDate = new Date(2026, 9, 5);
		const visibleRange = { start: new Date(2026, 9, 5), end: new Date(2026, 9, 8) };
		expect(getDayRolloverTargetDate(previousDay, now, visibleRange, currentDate)).toBe(
			currentDate
		);
	});
});
