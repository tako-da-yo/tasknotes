import { getAllDailyNotes, getDailyNote } from "obsidian-daily-notes-interface";
import { moment as obsidianMoment, TFile } from "obsidian";
import type TaskNotesPlugin from "../main";
import type { DayPlanSources } from "../services/DayPlanService";
import type { ICSEvent, TimeBlock } from "../types";
import { isDueByRRule, validateTimeBlock } from "../utils/helpers";
import { getExternalEventContext } from "../utils/contextColors";
import { parseDateToUTC } from "../utils/dateUtils";
import { parseLinkToPath } from "../utils/linkUtils";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "Bootstrap/DayPlanSources" });

type DailyNoteMoment = Parameters<typeof getDailyNote>[0];

// Same short TTL as calendar-core's generateTimeblockEvents: getAllDailyNotes()
// scans the daily-notes folder, so avoid repeating it for every day of a range.
const DAILY_NOTES_CACHE_TTL = 5000;

export interface DayPlanSourceBundle {
	sources: DayPlanSources;
	/** True if a change to the file at this path can change the timeblocks returned. */
	affectsTimeblocks: (path: string, frontmatter?: Record<string, unknown>) => boolean;
}

function dailyNoteMoment(date: string): DailyNoteMoment {
	return (obsidianMoment as unknown as (input: string, format: string) => DailyNoteMoment)(
		date,
		"YYYY-MM-DD"
	);
}

export function createDayPlanSources(plugin: TaskNotesPlugin): DayPlanSourceBundle {
	let dailyNotes: Record<string, TFile> | null = null;
	let dailyNotesTime = 0;
	// Daily notes we have looked up; editing one may add or remove its timeblocks.
	const dailyNotePaths = new Set<string>();

	const getDailyNotes = (): Record<string, TFile> => {
		const now = Date.now();
		if (!dailyNotes || now - dailyNotesTime > DAILY_NOTES_CACHE_TTL) {
			dailyNotes = getAllDailyNotes();
			dailyNotesTime = now;
		}
		return dailyNotes;
	};

	const getTimeblocks = (date: string): Promise<TimeBlock[]> => {
		try {
			const note = getDailyNote(dailyNoteMoment(date), getDailyNotes());
			if (!(note instanceof TFile)) return Promise.resolve([]);
			dailyNotePaths.add(note.path);
			// Read from the metadata cache like the calendar does; no file read.
			const raw: unknown = plugin.app.metadataCache.getFileCache(note)?.frontmatter
				?.timeblocks;
			return Promise.resolve(Array.isArray(raw) ? raw.filter(validateTimeBlock) : []);
		} catch (error) {
			tasknotesLogger.warn("Failed to read timeblocks for day plan", {
				category: "internal",
				operation: "day-plan-read-timeblocks",
				details: { date },
				error,
			});
			return Promise.resolve([]);
		}
	};

	const sources: DayPlanSources = {
		getTasks: () => plugin.cacheManager.getAllCachedTasks(),
		getEvents: (): ICSEvent[] => [
			...(plugin.icsSubscriptionService?.getAllEvents() ?? []),
			...(plugin.googleCalendarService?.getAllEvents() ?? []),
			...(plugin.microsoftCalendarService?.getAllEvents() ?? []),
		],
		getTimeblocks,
		isCompleted: (s) => plugin.statusManager.isCompletedStatus(s),
		// rrule matching uses the UTC calendar date, as in agendaTaskSelection.
		isRecurringOnDate: (task, date) => isDueByRRule(task, parseDateToUTC(date)),
		externalContextFor: (e) => getExternalEventContext(plugin.settings, e),
		resolveAttachment: (link) => {
			const target = parseLinkToPath(link);
			if (!target) return null;
			return plugin.app.metadataCache.getFirstLinkpathDest(target, "")?.path ?? null;
		},
		now: () => Date.now(),
	};

	return {
		sources,
		affectsTimeblocks: (path, frontmatter) => {
			if (!dailyNotePaths.has(path) && frontmatter?.timeblocks === undefined) return false;
			// The daily-note set may have changed (created, renamed, deleted); rescan next time.
			dailyNotes = null;
			return true;
		},
	};
}
