import { Setting } from "obsidian";
import {
	isValidWorkRange,
	parseHHMM,
	renderPlanningSettings,
	setCalendarBusy,
} from "../../../src/settings/tabs/features/planningSettings";
import { DEFAULT_SETTINGS } from "../../../src/settings/defaults";
import type TaskNotesPlugin from "../../../src/main";

describe("parseHHMM", () => {
	it("accepts valid times and normalises", () => {
		expect(parseHHMM("9:05")).toBe("09:05");
		expect(parseHHMM("17:00")).toBe("17:00");
		expect(parseHHMM(" 00:00 ")).toBe("00:00");
	});
	it("rejects invalid", () => {
		expect(parseHHMM("25:00")).toBeNull();
		expect(parseHHMM("12:60")).toBeNull();
		expect(parseHHMM("abc")).toBeNull();
		expect(parseHHMM("")).toBeNull();
	});
});

describe("isValidWorkRange", () => {
	it("requires the end after the start", () => {
		expect(isValidWorkRange("09:00", "17:00")).toBe(true);
		expect(isValidWorkRange("17:00", "09:00")).toBe(false);
		expect(isValidWorkRange("09:00", "09:00")).toBe(false);
	});
	it("treats an end of 00:00 as midnight unless the start is also 00:00", () => {
		expect(isValidWorkRange("18:00", "00:00")).toBe(true);
		expect(isValidWorkRange("00:00", "00:00")).toBe(false);
	});
});

describe("setCalendarBusy", () => {
	it("excludes an unticked calendar", () => {
		expect(setCalendarBusy([], "ics1", false)).toEqual(["ics1"]);
		expect(setCalendarBusy(["ics1"], "ics1", false)).toEqual(["ics1"]);
	});
	it("removes a ticked calendar from the exclusions", () => {
		expect(setCalendarBusy(["google-a", "ics1"], "ics1", true)).toEqual(["google-a"]);
		expect(setCalendarBusy([], "ics1", true)).toEqual([]);
	});
	it("does not mutate the input", () => {
		const current = ["google-a"];
		setCalendarBusy(current, "ics1", false);
		expect(current).toEqual(["google-a"]);
	});
});

describe("renderPlanningSettings", () => {
	type Handler = { setting: Setting; fn: (value: never) => void; inputEl?: HTMLInputElement };
	let toggles: Handler[];
	let texts: Handler[];

	beforeEach(() => {
		toggles = [];
		texts = [];
		jest.spyOn(Setting.prototype, "addToggle").mockImplementation(function (this: Setting, cb) {
			const toggle: Record<string, unknown> = {
				toggleEl: document.createElement("div"),
				setValue: () => toggle,
				setTooltip: () => toggle,
				onChange: (fn: (value: never) => void) => {
					toggles.push({ setting: this, fn });
					return toggle;
				},
			};
			cb(toggle as never);
			return this;
		});
		jest.spyOn(Setting.prototype, "addText").mockImplementation(function (this: Setting, cb) {
			const inputEl = document.createElement("input");
			const text: Record<string, unknown> = {
				inputEl,
				setValue: (v: string) => {
					inputEl.value = v;
					return text;
				},
				setPlaceholder: () => text,
				setDisabled: () => text,
				onChange: (fn: (value: never) => void) => {
					texts.push({ setting: this, fn, inputEl });
					return text;
				},
			};
			cb(text as never);
			return this;
		});
	});
	afterEach(() => jest.restoreAllMocks());

	function setup() {
		const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as typeof DEFAULT_SETTINGS;
		const plugin = {
			settings,
			dayPlanService: { invalidate: jest.fn() },
			estimateCalibrationService: { invalidate: jest.fn() },
			icsSubscriptionService: { getSubscriptions: () => [{ id: "ics1", name: "Team ICS" }] },
			googleCalendarService: { getAvailableCalendars: () => [{ id: "a", summary: "Work" }] },
			microsoftCalendarService: { getAvailableCalendars: () => [] },
		};
		settings.enabledGoogleCalendars = ["a"];
		settings.enabledMicrosoftCalendars = ["b"];
		const save = jest.fn();
		const container = document.createElement("div");
		renderPlanningSettings(container, plugin as unknown as TaskNotesPlugin, save, (key) => key);
		return { plugin, settings, save, container };
	}
	const named = (h: Handler[], name: string) => h.filter((x) => x.setting.nameEl.textContent === name);

	it("renders weekday rows and calendar names, falling back to the id", () => {
		const { container } = setup();
		expect(container.textContent).toContain("settings.features.planning.workHours");
		expect(container.textContent).toContain("Monday");
		expect(container.textContent).toContain("Team ICS");
		expect(container.textContent).toContain("Work");
		expect(container.textContent).toContain("microsoft-b");
	});

	it("unticking a calendar excludes only that calendar and invalidates services", () => {
		const { plugin, settings, save } = setup();
		const before = settings.planning;
		named(toggles, "Team ICS")[0].fn(false as never);
		expect(settings.planning.nonBusyCalendars).toEqual(["ics1"]);
		expect(settings.planning).not.toBe(before);
		expect(save).toHaveBeenCalled();
		expect(plugin.dayPlanService.invalidate).toHaveBeenCalled();
		expect(plugin.estimateCalibrationService.invalidate).toHaveBeenCalled();
	});

	it("rejects invalid or reversed work hours and keeps the previous value", () => {
		const { settings, save } = setup();
		const [start, end] = named(texts, "Monday");
		end.inputEl!.value = "08:00";
		end.fn("08:00" as never);
		expect(settings.planning.workHours[1]).toEqual({ start: "09:00", end: "17:00" });
		expect(end.inputEl!.classList.contains("is-invalid")).toBe(true);
		start.inputEl!.value = "99:00";
		start.fn("99:00" as never);
		expect(start.inputEl!.classList.contains("is-invalid")).toBe(true);
		expect(save).not.toHaveBeenCalled();
	});

	it("saves valid work hours as new objects, accepting 00:00 as midnight", () => {
		const { settings, save } = setup();
		const before = settings.planning.workHours;
		const monday = before[1];
		const [, end] = named(texts, "Monday");
		end.inputEl!.value = "0:00";
		end.fn("0:00" as never);
		expect(settings.planning.workHours[1]).toEqual({ start: "09:00", end: "00:00" });
		expect(settings.planning.workHours).not.toBe(before);
		expect(monday).toEqual({ start: "09:00", end: "17:00" });
		expect(end.inputEl!.classList.contains("is-invalid")).toBe(false);
		expect(save).toHaveBeenCalled();
	});

	it("toggles a day off and back on", () => {
		const { settings } = setup();
		const [toggle] = named(toggles, "Monday");
		toggle.fn(false as never);
		expect(settings.planning.workHours[1]).toBeNull();
		toggle.fn(true as never);
		expect(settings.planning.workHours[1]).toEqual({ start: "09:00", end: "17:00" });
	});

	it("stores an empty default estimate as null and clamps the calibration window", () => {
		const { settings } = setup();
		const [estimate] = named(texts, "settings.features.planning.defaultEstimate");
		estimate.fn("30" as never);
		expect(settings.planning.defaultEstimate).toBe(30);
		estimate.fn("" as never);
		expect(settings.planning.defaultEstimate).toBeNull();
		const [windowDays] = named(texts, "settings.features.planning.calibrationWindow");
		windowDays.fn("3" as never);
		expect(settings.calibration.windowDays).toBe(90);
		windowDays.fn("30" as never);
		expect(settings.calibration.windowDays).toBe(30);
	});
});
