import { rangeContainsDate } from "../../../src/bases/calendarRecreateUtils";

describe("rangeContainsDate", () => {
	const previousDay = new Date(2026, 9, 8);

	it("is true for a visible range that includes the day", () => {
		expect(
			rangeContainsDate(
				{ start: new Date(2026, 9, 8), end: new Date(2026, 9, 13) },
				previousDay
			)
		).toBe(true);
	});

	it("is false for a range the user navigated away to", () => {
		expect(
			rangeContainsDate(
				{ start: new Date(2026, 9, 20), end: new Date(2026, 9, 23) },
				previousDay
			)
		).toBe(false);
	});

	it("treats the range end as exclusive", () => {
		expect(
			rangeContainsDate(
				{ start: new Date(2026, 9, 5), end: new Date(2026, 9, 8) },
				previousDay
			)
		).toBe(false);
	});
});
