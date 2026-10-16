import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import { EnergyPanel, type EnergyPanelDeps } from "../components/EnergyPanel";

/** Reads an optional `date: YYYY-MM-DD` line; `date: null` when there is none. */
export function parseEnergyBlock(source: string): { date: string | null } | { error: string } {
	const match = /^\s*date\s*:\s*(.+?)\s*$/m.exec(source);
	if (!match) return { date: null };
	const value = match[1];
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!m) return { error: value };
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	if (d.toISOString().slice(0, 10) !== value) return { error: value };
	return { date: value };
}

/**
 * The block's date at each render: its `date:` line, else the daily note's date, else
 * today (looked up each time, so a block in a regular note moves on at midnight).
 */
export function energyBlockDateResolver(
	explicit: string | null,
	dailyNoteDate: () => string | null,
	today: () => string
): () => string {
	return () => explicit ?? dailyNoteDate() ?? today();
}

export interface EnergyCodeBlockEnv {
	/** The date of the note the block is in, if it is a daily note. */
	dailyNoteDate: () => string | null;
	today: () => string;
	deps: EnergyPanelDeps;
	onChange(listener: () => void): () => void;
}

/** Renders a `tasknotes-energy` block; re-renders on energy changes until the block unloads. */
export function renderEnergyCodeBlock(
	source: string,
	el: HTMLElement,
	ctx: MarkdownPostProcessorContext,
	env: EnergyCodeBlockEnv
): void {
	const parsed = parseEnergyBlock(source);
	if ("error" in parsed) {
		el.createDiv({
			cls: "tn-energy-panel__error",
			text: env.deps.t("energy.panel.invalidDate", { value: parsed.error }),
		});
		return;
	}
	const dateOf = energyBlockDateResolver(parsed.date, env.dailyNoteDate, env.today);
	const panel = new EnergyPanel(el.createDiv(), env.deps, {
		date: dateOf(),
		navigable: false,
	});
	void panel.render();
	const child = new MarkdownRenderChild(el);
	// Energy changes include the day changing (midnight, or waking from sleep).
	child.register(env.onChange(() => void panel.setDate(dateOf())));
	ctx.addChild(child);
}
