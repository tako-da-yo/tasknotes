import { moment, Setting, TextComponent, ToggleComponent } from "obsidian";
import type TaskNotesPlugin from "../../../main";
import type { CalibrationSettings, PlanningSettings, WorkDayHours } from "../../../types/settings";
import { createSettingGroup } from "../../components/settingHelpers";
import type { TranslateFn } from "../taskProperties/helpers";

const DEFAULT_WORK_DAY: WorkDayHours = { start: "09:00", end: "17:00" };
const CALIBRATION_WINDOW_MIN = 7;
const CALIBRATION_WINDOW_MAX = 365;
const INVALID_CLASS = "is-invalid";

/** Parses "H:MM" or "HH:MM" into a normalised "HH:MM", or null when invalid. */
export function parseHHMM(value: string): string | null {
	const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
	if (!m) return null;
	const h = Number(m[1]);
	const min = Number(m[2]);
	if (h > 23 || min > 59) return null;
	return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * The end must be after the start. An end of "00:00" means midnight at the end
 * of the day (as for timeblocks), unless the start is also "00:00".
 */
export function isValidWorkRange(start: string, end: string): boolean {
	if (end === "00:00") return start !== "00:00";
	return end > start;
}

/**
 * Returns the excluded-calendar list after ticking (busy) or unticking (not busy) one
 * calendar. Only exclusions are stored, so calendars connected later count as busy.
 */
export function setCalendarBusy(excluded: string[], id: string, busy: boolean): string[] {
	const rest = excluded.filter((existing) => existing !== id);
	return busy ? rest : [...rest, id];
}

interface CalendarOption {
	id: string;
	name: string;
}

function collectCalendars(plugin: TaskNotesPlugin): CalendarOption[] {
	const options: CalendarOption[] = [];
	for (const sub of plugin.icsSubscriptionService?.getSubscriptions() ?? []) {
		options.push({ id: sub.id, name: sub.name || sub.id });
	}
	const providers = [
		{
			prefix: "google",
			enabled: plugin.settings.enabledGoogleCalendars,
			available: plugin.googleCalendarService?.getAvailableCalendars() ?? [],
		},
		{
			prefix: "microsoft",
			enabled: plugin.settings.enabledMicrosoftCalendars,
			available: plugin.microsoftCalendarService?.getAvailableCalendars() ?? [],
		},
	];
	for (const provider of providers) {
		for (const calendarId of provider.enabled ?? []) {
			const id = `${provider.prefix}-${calendarId}`;
			const name = provider.available.find((c) => c.id === calendarId)?.summary;
			options.push({ id, name: name || id });
		}
	}
	return options;
}

function setInvalid(input: HTMLInputElement, invalid: boolean): void {
	input.classList.toggle(INVALID_CLASS, invalid);
}

export function renderPlanningSettings(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	translate: TranslateFn
): void {
	const commit = () => {
		save();
		plugin.dayPlanService.invalidate();
		plugin.estimateCalibrationService.invalidate();
	};
	const updatePlanning = (patch: Partial<PlanningSettings>) => {
		plugin.settings.planning = { ...plugin.settings.planning, ...patch };
		commit();
	};
	const updateCalibration = (patch: Partial<CalibrationSettings>) => {
		plugin.settings.calibration = { ...plugin.settings.calibration, ...patch };
		commit();
	};
	const setWorkDay = (day: number, hours: WorkDayHours | null) => {
		updatePlanning({
			workHours: plugin.settings.planning.workHours.map((existing, i) =>
				i === day ? (hours ? { ...hours } : null) : existing ? { ...existing } : null
			),
		});
	};

	createSettingGroup(container, { heading: translate("settings.features.planning.heading") }, (group) => {
		group.addSetting((setting) => {
			setting
				.setName(translate("settings.features.planning.workHours"))
				.setDesc(translate("settings.features.planning.workHoursDesc"));
		});

		const weekdays = moment.weekdays();
		const firstDay = moment.localeData().firstDayOfWeek();
		for (let offset = 0; offset < 7; offset++) {
			const day = (firstDay + offset) % 7;
			group.addSetting((setting) => renderWorkDay(setting, day, weekdays[day]));
		}

		const calendars = collectCalendars(plugin);
		if (calendars.length > 0) {
			group.addSetting((setting) => {
				setting
					.setName(translate("settings.features.planning.busyCalendars"))
					.setDesc(translate("settings.features.planning.busyCalendarsDesc"));
			});
			for (const calendar of calendars) {
				group.addSetting((setting) => {
					setting.setName(calendar.name).addToggle((toggle) => {
						toggle.setValue(
							!plugin.settings.planning.nonBusyCalendars.includes(calendar.id)
						);
						toggle.onChange((checked) => {
							updatePlanning({
								nonBusyCalendars: setCalendarBusy(
									plugin.settings.planning.nonBusyCalendars,
									calendar.id,
									checked
								),
							});
						});
					});
				});
			}
		}

		group.addSetting((setting) => {
			setting.setName(translate("settings.features.planning.allDayBusy")).addToggle((toggle) =>
				toggle
					.setValue(plugin.settings.planning.allDayEventsBusy)
					.onChange((value) => updatePlanning({ allDayEventsBusy: value }))
			);
		});

		group.addSetting((setting) => {
			setting
				.setName(translate("settings.features.planning.defaultEstimate"))
				.setDesc(translate("settings.features.planning.defaultEstimateDesc"))
				.addText((text) => {
					const current = plugin.settings.planning.defaultEstimate;
					text.setValue(current === null ? "" : String(current));
					text.inputEl.type = "number";
					text.inputEl.min = "1";
					text.inputEl.classList.add("settings-view__input");
					text.onChange((value) => {
						const trimmed = value.trim();
						if (trimmed === "") {
							setInvalid(text.inputEl, false);
							updatePlanning({ defaultEstimate: null });
							return;
						}
						const minutes = Number(trimmed);
						const valid = Number.isInteger(minutes) && minutes > 0;
						setInvalid(text.inputEl, !valid);
						if (valid) updatePlanning({ defaultEstimate: minutes });
					});
				});
		});

		group.addSetting((setting) => {
			setting.setName(translate("settings.features.planning.showInStatusBar")).addToggle((toggle) =>
				toggle
					.setValue(plugin.settings.planning.showInStatusBar)
					.onChange((value) => updatePlanning({ showInStatusBar: value }))
			);
		});

		group.addSetting((setting) => {
			setting.setName(translate("settings.features.planning.warnOnOverbook")).addToggle((toggle) =>
				toggle
					.setValue(plugin.settings.planning.warnOnOverbook)
					.onChange((value) => updatePlanning({ warnOnOverbook: value }))
			);
		});

		group.addSetting((setting) => {
			setting.setName(translate("settings.features.planning.calibrationWindow")).addText((text) => {
				text.setValue(String(plugin.settings.calibration.windowDays));
				text.inputEl.type = "number";
				text.inputEl.min = String(CALIBRATION_WINDOW_MIN);
				text.inputEl.max = String(CALIBRATION_WINDOW_MAX);
				text.inputEl.classList.add("settings-view__input");
				text.onChange((value) => {
					const days = Number(value.trim());
					const valid =
						value.trim() !== "" &&
						Number.isInteger(days) &&
						days >= CALIBRATION_WINDOW_MIN &&
						days <= CALIBRATION_WINDOW_MAX;
					setInvalid(text.inputEl, !valid);
					if (valid) updateCalibration({ windowDays: days });
				});
			});
		});

		group.addSetting((setting) => {
			setting.setName(translate("settings.features.planning.applyCalibration")).addToggle((toggle) =>
				toggle
					.setValue(plugin.settings.calibration.applyToPlanning)
					.onChange((value) => updateCalibration({ applyToPlanning: value }))
			);
		});
	});

	function renderWorkDay(setting: Setting, day: number, name: string): void {
		const initial = plugin.settings.planning.workHours[day] ?? null;
		// Remembered so that switching a day back on restores its last hours.
		let lastHours: WorkDayHours = initial ? { ...initial } : { ...DEFAULT_WORK_DAY };
		// [start, end] inputs, filled in as the row is built.
		const times: TextComponent[] = [];

		const showDayOff = (off: boolean) => {
			setting.setDesc(off ? translate("settings.features.planning.dayOff") : "");
			for (const text of times) text.setDisabled(off);
		};

		const onTimeChange = () => {
			const [startText, endText] = times;
			const start = parseHHMM(startText.inputEl.value);
			const end = parseHHMM(endText.inputEl.value);
			const rangeValid = !!start && !!end && isValidWorkRange(start, end);
			setInvalid(startText.inputEl, !start);
			setInvalid(endText.inputEl, !end || (!!start && !rangeValid));
			if (!start || !end || !rangeValid) return;
			lastHours = { start, end };
			setWorkDay(day, lastHours);
		};

		const addTime = (text: TextComponent, value: string, placeholder: string) => {
			times.push(text);
			text.setValue(value).setPlaceholder(placeholder);
			text.inputEl.classList.add("settings-view__input", "tn-planning-time");
			text.onChange(onTimeChange);
		};

		setting
			.setName(name)
			.addToggle((toggle: ToggleComponent) => {
				toggle.setValue(initial !== null);
				toggle.toggleEl.setAttribute("aria-label", name);
				toggle.onChange((working) => {
					if (working) {
						const [startText, endText] = times;
						startText.setValue(lastHours.start);
						endText.setValue(lastHours.end);
						for (const text of times) setInvalid(text.inputEl, false);
					}
					showDayOff(!working);
					setWorkDay(day, working ? lastHours : null);
				});
			})
			.addText((text) => addTime(text, lastHours.start, DEFAULT_WORK_DAY.start))
			.addText((text) => addTime(text, lastHours.end, DEFAULT_WORK_DAY.end));
		showDayOff(initial === null);
	}
}
