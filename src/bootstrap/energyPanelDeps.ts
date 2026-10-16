import { getDateFromFile } from "obsidian-daily-notes-interface";
import { TFile } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { EnergyPanelDeps } from "../components/EnergyPanel";
import type { DayItem } from "../core/dayPlan";
import type { TaskInfo } from "../types";
import { EnergyTaskSuggestModal } from "../modals/EnergyTaskSuggestModal";
import { capacityStatusText } from "../ui/capacityText";
import { showNotice } from "../ui/notifications";
import { resolveContext } from "../utils/contextColors";
import { getTodayString } from "../utils/dateUtils";
import { formatTime } from "../utils/helpers";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "Bootstrap/EnergyPanelDeps" });

/** The YYYY-MM-DD date of the daily note at `path`, or null if it is not a daily note. */
export function dailyNoteDateFor(plugin: TaskNotesPlugin, path: string): string | null {
	const file = plugin.app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return null;
	try {
		return getDateFromFile(file, "day")?.format("YYYY-MM-DD") ?? null;
	} catch {
		// Daily notes interface unavailable; treat the note as a regular note.
		return null;
	}
}

function isOpen(plugin: TaskNotesPlugin, task: TaskInfo): boolean {
	return !task.archived && !plugin.statusManager.isCompletedStatus(task.status);
}

function logActionError(op: string, error: unknown): void {
	tasknotesLogger.error("Energy panel action failed", { category: "internal", operation: op, error });
}

export function createEnergyPanelDeps(plugin: TaskNotesPlugin): EnergyPanelDeps {
	const t = (key: string, params?: Record<string, string | number>) =>
		plugin.i18n.translate(key, params);

	const deps: EnergyPanelDeps = {
		getDayEnergy: (date) => plugin.energyService.getDayEnergy(date),
		isActive: () => plugin.energyService.isActive(),
		titleOf: (item: DayItem) => item.title || item.task?.title || item.ref,
		openItem: (item) => {
			const open =
				item.kind === "task"
					? plugin.app.workspace.openLinkText(item.ref, "")
					: plugin.openBasesFileForCommand("open-advanced-calendar-view");
			open.catch((error) => logActionError("energy-panel-open-item", error));
		},
		showDrainTasks: (_date, contributions) => {
			const seen = new Set<string>();
			const tasks: TaskInfo[] = [];
			for (const c of contributions) {
				const task = c.item.task;
				if (c.points >= 0 || c.item.kind !== "task" || c.item.done || !task) continue;
				if (seen.has(task.path) || !isOpen(plugin, task)) continue;
				seen.add(task.path);
				tasks.push(task);
			}
			if (tasks.length === 0) {
				showNotice(t("energy.panel.noDrains"));
				return;
			}
			new EnergyTaskSuggestModal(plugin.app, tasks, t("energy.panel.drainsPlaceholder"), (task) => {
				plugin.openTaskEditModal(task).catch((error) =>
					logActionError("energy-panel-open-drain", error)
				);
			}).open();
		},
		findSpark: (date) => {
			const tasks = plugin.cacheManager
				.getAllCachedTasks()
				.filter(
					(task) =>
						isOpen(plugin, task) &&
						!task.recurrence &&
						!task.scheduled &&
						!task.due &&
						resolveContext(plugin.settings, task.contexts ?? [])?.energy === "spark"
				);
			if (tasks.length === 0) {
				showNotice(t("energy.panel.noSparks"));
				return;
			}
			new EnergyTaskSuggestModal(
				plugin.app,
				tasks,
				t("energy.panel.sparkPlaceholder", { date }),
				(task) => {
					plugin
						.updateTaskProperty(task, "scheduled", date)
						.catch((error) => logActionError("energy-panel-schedule-spark", error));
				}
			).open();
		},
		openSettings: () => {
			plugin.app.setting.open();
			plugin.app.setting.openTabById(plugin.manifest.id);
		},
		t,
		today: () => getTodayString(),
	};

	if (plugin.capacityService) {
		deps.getCapacityLine = async (date) =>
			capacityStatusText(await plugin.capacityService.getDayCapacity(date), t, formatTime);
	}
	return deps;
}
