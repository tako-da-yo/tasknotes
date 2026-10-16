import { App, Modal, Notice, Setting } from "obsidian";
import { addDays, format } from "date-fns";
import type TaskNotesPlugin from "../main";
import type { TaskInfo } from "../types";
import { TriageSession, TriageAction } from "../core/triageSession";
import type { TriageRevert } from "../services/TriageService";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import { getTodayLocal } from "../utils/dateUtils";
import { DateTimePickerModal } from "./DateTimePickerModal";

const logger = createTaskNotesLogger({ tag: "Modals/InboxTriage" });

export type TriageKey =
	| "today"
	| "schedule"
	| "someday"
	| "done"
	| "drop"
	| "skip"
	| "edit"
	| "undo";

const KEY_MAP: Record<string, TriageKey> = {
	"1": "today",
	"2": "schedule",
	"3": "someday",
	"4": "done",
	"5": "drop",
	e: "edit",
	s: "skip",
	ArrowRight: "skip",
	z: "undo",
};

/** Physical digit keys, used when the layout does not produce a digit (e.g. AZERTY). */
const CODE_MAP: Record<string, TriageKey> = {
	Digit1: "today",
	Digit2: "schedule",
	Digit3: "someday",
	Digit4: "done",
	Digit5: "drop",
	Numpad1: "today",
	Numpad2: "schedule",
	Numpad3: "someday",
	Numpad4: "done",
	Numpad5: "drop",
};

export interface TriageKeyInput {
	key: string;
	code?: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
	shiftKey?: boolean;
}

function lookup(map: Record<string, TriageKey>, value: string | undefined): TriageKey | null {
	return value !== undefined && Object.prototype.hasOwnProperty.call(map, value)
		? map[value]
		: null;
}

/**
 * Maps a key press to a triage action. `key` is matched first; for digits the physical
 * `code` is a fallback so the 1–5 shortcuts also work where digits need Shift (AZERTY).
 * Ctrl, Meta and Alt combinations are left to Obsidian.
 */
export function keyToAction(
	input: TriageKeyInput,
	opts: { hasSomeday: boolean; targetIsInput: boolean }
): TriageKey | null {
	if (opts.targetIsInput) return null;
	if (input.ctrlKey || input.metaKey || input.altKey) return null;
	const normalized = input.key.length === 1 ? input.key.toLowerCase() : input.key;
	const action = lookup(KEY_MAP, normalized) ?? lookup(CODE_MAP, input.code);
	if (action === "someday" && !opts.hasSomeday) return null;
	return action;
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
	["year", 365 * 86_400_000],
	["month", 30 * 86_400_000],
	["week", 7 * 86_400_000],
	["day", 86_400_000],
	["hour", 3_600_000],
	["minute", 60_000],
];

/** Localized "3 days ago"-style age of a capture date; null for invalid dates. */
export function formatCapturedAge(created: Date, now: Date, locale: string): string | null {
	const diff = created.getTime() - now.getTime();
	if (Number.isNaN(diff)) return null;
	let rtf: Intl.RelativeTimeFormat;
	try {
		rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
	} catch {
		rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
	}
	for (const [unit, ms] of RELATIVE_UNITS) {
		if (Math.abs(diff) >= ms) return rtf.format(Math.round(diff / ms), unit);
	}
	return rtf.format(0, "minute");
}

/**
 * Local YYYY-MM-DD dates for the schedule presets. `weekend` is the upcoming Saturday, or
 * today on a Saturday or Sunday; `nextWeek` is the first Monday strictly after today.
 */
export function schedulePresetDates(today: Date): {
	tomorrow: string;
	weekend: string;
	nextWeek: string;
} {
	const day = today.getDay(); // 0 = Sunday, 6 = Saturday
	const offset = (days: number) => format(addDays(today, days), "yyyy-MM-dd");
	const daysUntilWeekend = day === 0 || day === 6 ? 0 : 6 - day;
	const daysUntilMonday = (8 - day) % 7 || 7;
	return {
		tomorrow: offset(1),
		weekend: offset(daysUntilWeekend),
		nextWeek: offset(daysUntilMonday),
	};
}

interface UndoEntry {
	task: TaskInfo;
	revert: TriageRevert | null;
}

export class InboxTriageModal extends Modal {
	private readonly session: TriageSession;
	private readonly undoStack: UndoEntry[] = [];
	/** Latest saved version of queued tasks edited during this session, keyed by the queued object. */
	private readonly edited = new Map<TaskInfo, TaskInfo>();
	private busy = false;
	/** Announces progress and the summary; created once so screen readers keep tracking it. */
	private liveRegion!: HTMLElement;
	/** Re-rendered part of the modal, below the heading and the live region. */
	private bodyEl!: HTMLElement;

	constructor(
		app: App,
		private readonly plugin: TaskNotesPlugin
	) {
		super(app);
		this.session = new TriageSession(plugin.triageService.getInboxTasks());
	}

	onOpen(): void {
		this.modalEl.addClass("tn-triage-modal");
		// null modifiers: also receive Shift+digit (AZERTY); keyToAction rejects Ctrl/Meta/Alt.
		this.scope.register(null, null, (evt) => this.onKey(evt));
		const { contentEl } = this;
		contentEl.empty();
		new Setting(contentEl).setName(this.t("modals.inboxTriage.title")).setHeading();
		this.liveRegion = contentEl.createDiv({ attr: { "aria-live": "polite" } });
		this.bodyEl = contentEl.createDiv();
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private t(key: string, params?: Record<string, string | number>): string {
		return this.plugin.i18n.translate(key, params);
	}

	private hasSomeday(): boolean {
		return this.plugin.triageService.isSomedayReady();
	}

	/** The freshest known version of a queued task. */
	private resolve(task: TaskInfo): TaskInfo {
		return this.edited.get(task) ?? task;
	}

	private onKey(evt: KeyboardEvent): boolean {
		const target = evt.target instanceof HTMLElement ? evt.target : null;
		const targetIsInput = !!target?.closest(
			"input, textarea, select, [contenteditable='true']"
		);
		const action = keyToAction(evt, { hasSomeday: this.hasSomeday(), targetIsInput });
		if (!action) return true;
		evt.preventDefault();
		void this.handle(action);
		return false;
	}

	private async handle(key: TriageKey): Promise<void> {
		if (this.busy) return;
		if (key === "undo") return this.undoLast();
		const task = this.session.current();
		if (!task) return;
		if (key === "edit") return this.editCurrent(task);
		if (key === "schedule") return this.renderSchedulePresets(task);
		if (key === "skip") return this.apply(task, { kind: "skip" });
		if (key === "someday" && !this.hasSomeday()) return;
		return this.apply(task, { kind: key });
	}

	private async apply(task: TaskInfo, action: TriageAction): Promise<void> {
		if (this.busy || this.session.current() !== task) return;
		this.busy = true;
		try {
			const revert = await this.plugin.triageService.applyAction(this.resolve(task), action);
			this.undoStack.push({ task, revert });
			this.session.record(task, action);
		} catch (error) {
			logger.error("Inbox triage action failed", {
				category: "persistence",
				operation: "inbox-triage-apply",
				details: { path: task.path, action: action.kind },
				error,
			});
			new Notice(this.t("modals.inboxTriage.failed"));
		} finally {
			this.busy = false;
			this.render();
		}
	}

	private async undoLast(): Promise<void> {
		if (this.busy) return;
		const entry = this.undoStack[this.undoStack.length - 1];
		if (!entry) return;
		this.busy = true;
		try {
			if (entry.revert) await this.plugin.triageService.revertAction(entry.revert);
			this.undoStack.pop();
			this.session.undo();
		} catch (error) {
			logger.error("Inbox triage undo failed", {
				category: "persistence",
				operation: "inbox-triage-undo",
				details: { path: entry.task.path },
				error,
			});
			new Notice(this.t("modals.inboxTriage.failed"));
		} finally {
			this.busy = false;
			this.render();
		}
	}

	private editCurrent(task: TaskInfo): void {
		// The callback fires after a save. If the saved task left the inbox, count it as
		// sorted (null action; undo only steps back).
		void this.plugin.openTaskEditModal(this.resolve(task), (fresh) => {
			if (this.session.current() !== task) return;
			this.edited.set(task, fresh);
			const leftInbox =
				fresh.archived || fresh.status !== this.plugin.settings.triage.inboxStatus;
			if (leftInbox) {
				this.session.record(task, null);
				this.undoStack.push({ task, revert: null });
			}
			this.render();
		});
	}

	private setLiveText(cls: "tn-triage__progress" | "tn-triage__finished", text: string): void {
		this.liveRegion.className = cls;
		this.liveRegion.setText(text);
	}

	private render(): void {
		const contentEl = this.bodyEl;
		contentEl.empty();

		const queued = this.session.current();
		if (!queued) return this.renderFinished();
		const task = this.resolve(queued);

		const { index, total } = this.session.position();
		this.setLiveText(
			"tn-triage__progress",
			this.t("modals.inboxTriage.progress", { current: index + 1, total })
		);
		const card = contentEl.createDiv({ cls: "tn-triage__card" });
		card.createDiv({ cls: "tn-triage__title", text: task.title });
		if (task.details) {
			card.createDiv({
				cls: "tn-triage__details",
				text: task.details.split("\n").slice(0, 5).join("\n"),
			});
		}
		const meta = [
			...(task.projects ?? []),
			...(task.contexts ?? []).map((c) => `@${c}`),
			...(task.tags ?? []).map((t) => `#${t}`),
		];
		if (meta.length) card.createDiv({ cls: "tn-triage__meta", text: meta.join(" · ") });
		const age = task.dateCreated
			? formatCapturedAge(
					new Date(task.dateCreated),
					new Date(),
					this.plugin.i18n.getCurrentLocale()
				)
			: null;
		if (age) {
			card.createDiv({
				cls: "tn-triage__meta",
				text: this.t("modals.inboxTriage.captured", { age }),
			});
		}

		const actions = contentEl.createDiv({ cls: "tn-triage__actions" });
		const add = (key: TriageKey, label: string, shortcut: string) => {
			const btn = actions.createEl("button", { cls: "tn-triage__action", text: label });
			btn.createSpan({ cls: "tn-triage__kbd", text: shortcut });
			btn.setAttr("aria-label", `${label} (${shortcut})`);
			btn.addEventListener("click", () => void this.handle(key));
		};
		add("today", this.t("modals.inboxTriage.actions.today"), "1");
		add("schedule", this.t("modals.inboxTriage.actions.schedule"), "2");
		if (this.hasSomeday()) add("someday", this.t("modals.inboxTriage.actions.someday"), "3");
		add("done", this.t("modals.inboxTriage.actions.done"), "4");
		add("drop", this.t("modals.inboxTriage.actions.drop"), "5");
		add("edit", this.t("modals.inboxTriage.actions.edit"), "E");
		add("skip", this.t("modals.inboxTriage.actions.skip"), "→");
		if (this.undoStack.length) this.addUndoButton(actions);
		actions.querySelector("button")?.focus();
	}

	private addUndoButton(container: HTMLElement): void {
		const label = this.t("modals.inboxTriage.actions.undo");
		const btn = container.createEl("button", { cls: "tn-triage__action", text: label });
		btn.createSpan({ cls: "tn-triage__kbd", text: "Z" });
		btn.setAttr("aria-label", `${label} (Z)`);
		btn.addEventListener("click", () => void this.handle("undo"));
	}

	private renderSchedulePresets(task: TaskInfo): void {
		const actions = this.bodyEl.querySelector<HTMLElement>(".tn-triage__actions");
		if (!actions) return;
		actions.empty();
		// Local calendar dates (formatDateForStorage would use the UTC calendar day).
		const dates = schedulePresetDates(getTodayLocal());
		const presets: [string, string][] = [
			[this.t("modals.inboxTriage.schedule.tomorrow"), dates.tomorrow],
			[this.t("modals.inboxTriage.schedule.weekend"), dates.weekend],
			[this.t("modals.inboxTriage.schedule.nextWeek"), dates.nextWeek],
		];
		for (const [label, date] of presets) {
			const btn = actions.createEl("button", { cls: "tn-triage__action", text: label });
			btn.addEventListener("click", () => void this.apply(task, { kind: "schedule", date }));
		}
		const pick = actions.createEl("button", {
			cls: "tn-triage__action",
			text: this.t("modals.inboxTriage.schedule.pick"),
		});
		pick.addEventListener("click", () => {
			new DateTimePickerModal(this.app, {
				currentDate: null,
				dateRole: "scheduled",
				showTime: false,
				plugin: this.plugin,
				onSelect: (date) => {
					if (date) void this.apply(task, { kind: "schedule", date });
					else this.render();
				},
			}).open();
		});
		actions.querySelector("button")?.focus();
	}

	private renderFinished(): void {
		const { sorted, skipped } = this.session.summary();
		const total = this.session.position().total;
		this.setLiveText(
			"tn-triage__finished",
			total === 0
				? this.t("modals.inboxTriage.empty")
				: this.t("modals.inboxTriage.finished", { sorted, skipped })
		);
		if (total === 0) {
			const btn = this.bodyEl.createEl("button", {
				cls: "mod-cta",
				text: this.t("modals.inboxTriage.capture"),
			});
			btn.addEventListener("click", () => {
				this.close();
				this.plugin.openTaskCreationModal();
			});
		} else if (this.undoStack.length) {
			this.addUndoButton(this.bodyEl.createDiv({ cls: "tn-triage__actions" }));
		}
	}
}
