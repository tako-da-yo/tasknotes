import { MarkdownRenderChild, type MarkdownPostProcessorContext } from "obsidian";
import { EnergyPanel, type EnergyPanelDeps } from "../components/EnergyPanel";

/** Reads an optional `date: YYYY-MM-DD` line; no line means the fallback date. */
export function parseEnergyBlock(
	source: string,
	fallbackDate: string
): { date: string } | { error: string } {
	const match = /^\s*date\s*:\s*(.+?)\s*$/m.exec(source);
	if (!match) return { date: fallbackDate };
	const value = match[1];
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!m) return { error: value };
	const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
	if (d.toISOString().slice(0, 10) !== value) return { error: value };
	return { date: value };
}

export interface EnergyCodeBlockEnv {
	/** Date used when the block has no `date:` line (the daily note's date, or today). */
	fallbackDate: string;
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
	const parsed = parseEnergyBlock(source, env.fallbackDate);
	if ("error" in parsed) {
		el.createDiv({
			cls: "tn-energy-panel__error",
			text: env.deps.t("energy.panel.invalidDate", { value: parsed.error }),
		});
		return;
	}
	const panel = new EnergyPanel(el.createDiv(), env.deps, {
		date: parsed.date,
		navigable: false,
	});
	void panel.render();
	const child = new MarkdownRenderChild(el);
	child.register(env.onChange(() => void panel.render()));
	ctx.addChild(child);
}
