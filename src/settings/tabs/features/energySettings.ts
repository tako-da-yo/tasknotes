import type TaskNotesPlugin from "../../../main";
import type { EnergySettings } from "../../../types/settings";
import { createSettingGroup } from "../../components/settingHelpers";
import type { TranslateFn } from "../taskProperties/helpers";

const INVALID_CLASS = "is-invalid";

type NumericEnergyKey = Exclude<keyof EnergySettings, "enabled">;

/** Allowed range for each numeric energy setting. */
export const ENERGY_RANGES: Record<NumericEnergyKey, { min: number; max: number }> = {
	baseline: { min: 0, max: 100 },
	sparkPerHour: { min: 0, max: 50 },
	drainPerHour: { min: 0, max: 50 },
	steadyPerHour: { min: 0, max: 50 },
	lowThreshold: { min: 0, max: 100 },
	allDayMinutes: { min: 0, max: 1440 },
};

/** Parses a numeric setting, or returns null when it is empty, not a number or out of range. */
export function parseEnergyNumber(value: string, key: NumericEnergyKey): number | null {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const n = Number(trimmed);
	const { min, max } = ENERGY_RANGES[key];
	if (!Number.isFinite(n) || n < min || n > max) return null;
	return n;
}

const NUMERIC_KEYS: NumericEnergyKey[] = [
	"baseline",
	"sparkPerHour",
	"drainPerHour",
	"steadyPerHour",
	"lowThreshold",
	"allDayMinutes",
];

export function renderEnergySettings(
	container: HTMLElement,
	plugin: TaskNotesPlugin,
	save: () => void,
	translate: TranslateFn
): void {
	const updateEnergy = (patch: Partial<EnergySettings>) => {
		plugin.settings.energy = { ...plugin.settings.energy, ...patch };
		save();
		plugin.dayPlanService.invalidate();
	};

	createSettingGroup(
		container,
		{ heading: translate("settings.features.energy.heading") },
		(group) => {
			group.addSetting((setting) => {
				setting
					.setName(translate("settings.features.energy.enabled"))
					.setDesc(translate("settings.features.energy.enabledDesc"))
					.addToggle((toggle) =>
						toggle
							.setValue(plugin.settings.energy.enabled)
							.onChange((value) => updateEnergy({ enabled: value }))
					);
			});

			for (const key of NUMERIC_KEYS) {
				group.addSetting((setting) => {
					setting.setName(translate(`settings.features.energy.${key}`)).addText((text) => {
						const { min, max } = ENERGY_RANGES[key];
						text.setValue(String(plugin.settings.energy[key]));
						text.inputEl.type = "number";
						text.inputEl.min = String(min);
						text.inputEl.max = String(max);
						text.inputEl.classList.add("settings-view__input");
						text.onChange((value) => {
							const parsed = parseEnergyNumber(value, key);
							text.inputEl.classList.toggle(INVALID_CLASS, parsed === null);
							if (parsed !== null) updateEnergy({ [key]: parsed });
						});
					});
				});
			}
		}
	);
}
