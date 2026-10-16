import {
	formatCapturedAge,
	keyToAction,
	schedulePresetDates,
} from "../../../src/modals/InboxTriageModal";

describe("keyToAction", () => {
	const opts = { hasSomeday: true, targetIsInput: false };
	it("maps number and letter keys", () => {
		expect(keyToAction("1", opts)).toBe("today");
		expect(keyToAction("2", opts)).toBe("schedule");
		expect(keyToAction("3", opts)).toBe("someday");
		expect(keyToAction("4", opts)).toBe("done");
		expect(keyToAction("5", opts)).toBe("drop");
		expect(keyToAction("e", opts)).toBe("edit");
		expect(keyToAction("ArrowRight", opts)).toBe("skip");
		expect(keyToAction("s", opts)).toBe("skip");
		expect(keyToAction("z", opts)).toBe("undo");
	});
	it("ignores keys typed into inputs", () => {
		expect(keyToAction("1", { ...opts, targetIsInput: true })).toBeNull();
	});
	it("hides someday when not configured", () => {
		expect(keyToAction("3", { ...opts, hasSomeday: false })).toBeNull();
	});
});

describe("formatCapturedAge", () => {
	const now = new Date("2026-10-15T12:00:00Z");
	it("formats past ages in the largest whole unit", () => {
		expect(formatCapturedAge(new Date("2026-10-12T12:00:00Z"), now, "en")).toBe("3 days ago");
		expect(formatCapturedAge(new Date("2026-10-14T12:00:00Z"), now, "en")).toBe("yesterday");
		expect(formatCapturedAge(new Date("2026-10-15T10:00:00Z"), now, "en")).toBe("2 hours ago");
	});
	it("returns null for invalid dates", () => {
		expect(formatCapturedAge(new Date("not a date"), now, "en")).toBeNull();
	});
	it("falls back when the locale is invalid", () => {
		expect(formatCapturedAge(new Date("2026-10-12T12:00:00Z"), now, "??")).toEqual(
			expect.any(String)
		);
	});
});

describe("schedulePresetDates", () => {
	// Week of Mon 2026-10-12 to Sun 2026-10-18 (local dates).
	const cases: [number, string, string, string][] = [
		[12, "2026-10-13", "2026-10-17", "2026-10-19"], // Mon
		[13, "2026-10-14", "2026-10-17", "2026-10-19"], // Tue
		[14, "2026-10-15", "2026-10-17", "2026-10-19"], // Wed
		[15, "2026-10-16", "2026-10-17", "2026-10-19"], // Thu
		[16, "2026-10-17", "2026-10-17", "2026-10-19"], // Fri
		[17, "2026-10-18", "2026-10-17", "2026-10-19"], // Sat: weekend is today
		[18, "2026-10-19", "2026-10-18", "2026-10-19"], // Sun: weekend is today, next week is tomorrow
	];
	it.each(cases)("Oct %i", (day, tomorrow, weekend, nextWeek) => {
		expect(schedulePresetDates(new Date(2026, 9, day))).toEqual({
			tomorrow,
			weekend,
			nextWeek,
		});
	});
	it("ignores the time of day", () => {
		expect(schedulePresetDates(new Date(2026, 9, 17, 23, 30)).weekend).toBe("2026-10-17");
	});
});
