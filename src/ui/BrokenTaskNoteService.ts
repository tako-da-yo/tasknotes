import { CachedMetadata, Notice, parseYaml, TFile } from "obsidian";
import type TaskNotesPlugin from "../main";
import { diagnoseTaskNote, TaskIdentification, TaskNoteDiagnosis } from "../core/brokenFrontmatter";
import { showNotice } from "./notifications";
import { processVaultFile } from "../services/VaultMutationService";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "UI/BrokenTaskNoteService" });

/** Obsidian keeps the leading yaml section but no frontmatter when the YAML does not parse. */
function hasUnreadableFrontmatter(cache: CachedMetadata | null): boolean {
	return !!cache && !cache.frontmatter && cache.sections?.[0]?.type === "yaml";
}

/**
 * Warns when a task note's frontmatter can't be parsed, which makes the task silently
 * disappear, and offers a repair when a safe one exists (a repeated key line, as left by
 * a sync merge). Each broken version of a note is reported once.
 */
export class BrokenTaskNoteService {
	// Path -> the content last reported, so the same broken text is not reported twice.
	private reported = new Map<string, string>();

	constructor(private readonly plugin: TaskNotesPlugin) {}

	initialize(): void {
		const { app } = this.plugin;
		this.plugin.registerEvent(
			app.metadataCache.on("changed", (file, data, cache) => {
				if (hasUnreadableFrontmatter(cache)) this.check(file, data);
				else this.reported.delete(file.path);
			})
		);
		app.workspace.onLayoutReady(() => void this.scan());
	}

	private identification(): TaskIdentification {
		const s = this.plugin.settings;
		return {
			method: s.taskIdentificationMethod,
			tag: s.taskTag,
			propertyName: s.taskPropertyName,
			propertyValue: s.taskPropertyValue,
			folder: s.tasksFolder,
		};
	}

	private diagnose(file: TFile, content: string): TaskNoteDiagnosis | null {
		return diagnoseTaskNote(file.path, content, this.identification(), (text) => parseYaml(text));
	}

	/** Check every note Obsidian could not read the frontmatter of. */
	private async scan(): Promise<void> {
		const { app } = this.plugin;
		for (const file of app.vault.getMarkdownFiles()) {
			if (!hasUnreadableFrontmatter(app.metadataCache.getFileCache(file))) continue;
			try {
				this.check(file, await app.vault.cachedRead(file));
			} catch (error) {
				tasknotesLogger.warn("Failed to read a note to check its frontmatter", {
					category: "persistence",
					operation: "broken-task-note-scan",
					details: { path: file.path },
					error,
				});
			}
		}
	}

	private check(file: TFile, content: string): void {
		if (this.reported.get(file.path) === content) return;
		const diagnosis = this.diagnose(file, content);
		if (!diagnosis) return;
		this.reported.set(file.path, content);
		this.notify(file, diagnosis);
	}

	private notify(file: TFile, diagnosis: TaskNoteDiagnosis): void {
		const t = (key: string, params?: Record<string, string | number>) => this.plugin.i18n.translate(key, params);
		const fragment = activeWindow.createFragment();
		fragment.appendText(t("notices.brokenTaskNote.message", { name: file.basename }));
		const actions = fragment.createDiv({ cls: "tn-broken-task-note__actions" });
		let notice: Notice | null = null;
		if (diagnosis.repaired !== null) {
			actions.createEl("button", { cls: "mod-cta", text: t("notices.brokenTaskNote.repair") }).addEventListener(
				"click",
				(event) => {
					event.stopPropagation();
					notice?.hide();
					void this.repair(file);
				}
			);
		}
		actions.createEl("button", { text: t("notices.brokenTaskNote.open") }).addEventListener("click", (event) => {
			event.stopPropagation();
			notice?.hide();
			void this.plugin.app.workspace.getLeaf(false).openFile(file);
		});
		// Stays until dismissed: a task has gone missing and the user should see why.
		notice = showNotice(fragment, 0);
	}

	/** Apply the repair to the note as it is now, if it still needs the same repair. */
	private async repair(file: TFile): Promise<void> {
		const t = (key: string, params?: Record<string, string | number>) => this.plugin.i18n.translate(key, params);
		let repaired = false;
		try {
			await processVaultFile(this.plugin.app, file, (content) => {
				const next = this.diagnose(file, content)?.repaired;
				repaired = typeof next === "string";
				return next ?? content;
			});
		} catch (error) {
			tasknotesLogger.error("Failed to repair a task note's frontmatter", {
				category: "persistence",
				operation: "broken-task-note-repair",
				details: { path: file.path },
				error,
			});
		}
		showNotice(t(repaired ? "notices.brokenTaskNote.repaired" : "notices.brokenTaskNote.repairFailed", { name: file.basename }));
	}
}
