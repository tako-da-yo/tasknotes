import { Notice } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { TaskInfo } from "../types";
import { FreshStartModal } from "../modals/FreshStartModal";
import { previewFreshStart } from "../core/freshStartPlanning";
import { getTodayString } from "../utils/dateUtils";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const logger = createTaskNotesLogger({ tag: "Commands/FreshStartFlow" });

const PROGRESS_THRESHOLD = 20;
const DONE_NOTICE_MS = 10000;

/** Guards against a second fresh start (or undo) starting while one is running. */
let inFlight = false;

/**
 * Previews, confirms and runs a fresh start. Without `tasks`, every cached task is in scope;
 * with `tasks` (the batch menu), only those are touched.
 */
export async function runFreshStartFlow(
	plugin: TaskNotesPlugin,
	tasks?: TaskInfo[]
): Promise<void> {
	if (inFlight) return;
	inFlight = true;
	try {
		await freshStart(plugin, tasks);
	} finally {
		inFlight = false;
	}
}

export async function runUndoFreshStart(plugin: TaskNotesPlugin): Promise<void> {
	if (inFlight) return;
	inFlight = true;
	try {
		const { restored, skipped } = await plugin.triageService.undoFreshStart();
		new Notice(plugin.i18n.translate("notices.freshStart.undone", { restored, skipped }));
	} catch (error) {
		logger.error("Undo fresh start failed", {
			category: "persistence",
			operation: "undo-fresh-start",
			error,
		});
		new Notice(plugin.i18n.translate("notices.freshStart.undoFailed"));
	} finally {
		inFlight = false;
	}
}

async function freshStart(plugin: TaskNotesPlugin, tasks?: TaskInfo[]): Promise<void> {
	const t = (key: string, params?: Record<string, string | number>) =>
		plugin.i18n.translate(key, params);
	const scope = tasks ?? plugin.cacheManager.getAllCachedTasks();
	const preview = previewFreshStart(scope, getTodayString(), (s) =>
		plugin.statusManager.isCompletedStatus(s)
	);
	if (preview.total === 0) {
		new Notice(t("modals.freshStart.nothing"));
		return;
	}

	const { confirmed, clearDue } = await new FreshStartModal(
		plugin.app,
		preview,
		plugin.triageService.isInboxReady(),
		t
	).show();
	if (!confirmed) return;

	const progress =
		preview.total > PROGRESS_THRESHOLD
			? new Notice(t("notices.freshStart.progress", { done: 0, total: preview.total }), 0)
			: null;
	let count: number;
	try {
		count = await plugin.triageService.runFreshStartFor(scope, clearDue, (done, total) =>
			progress?.setMessage(t("notices.freshStart.progress", { done, total }))
		);
	} catch (error) {
		logger.error("Fresh start failed", {
			category: "persistence",
			operation: "fresh-start",
			details: { total: preview.total, clearDue },
			error,
		});
		new Notice(t("notices.freshStart.failed"));
		return;
	} finally {
		progress?.hide();
	}

	// Nothing changed and no snapshot was written: an Undo link here would revert an older run.
	if (count === 0) {
		new Notice(t("notices.freshStart.nothingChanged"));
		return;
	}

	const notice = new Notice("", DONE_NOTICE_MS);
	notice.messageEl.empty();
	notice.messageEl.createSpan({ text: `${t("notices.freshStart.done", { count })} ` });
	const undo = notice.messageEl.createEl("a", { text: t("notices.freshStart.undo"), href: "#" });
	undo.addEventListener("click", (event) => {
		event.preventDefault();
		notice.hide();
		void runUndoFreshStart(plugin);
	});
}
