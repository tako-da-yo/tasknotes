import { setIcon, setTooltip } from "obsidian";
import type { EnergyKind } from "../types/settings";

const ORDER: EnergyKind[] = ["spark", "steady", "drain"];
const ICONS: Record<EnergyKind, string> = {
	spark: "zap",
	steady: "circle",
	drain: "battery-low",
};

export interface EnergyKindControlOptions {
	value: EnergyKind | undefined;
	labels: Record<EnergyKind, string>;
	groupLabel: string;
	onChange(v: EnergyKind): void;
}

/**
 * Compact icon-only radio group for picking a context's energy kind.
 * Labels live in aria-label and tooltips, so the control fits a single settings row.
 */
export class EnergyKindControl {
	private value: EnergyKind;
	private buttons = new Map<EnergyKind, HTMLElement>();

	constructor(
		container: HTMLElement,
		private readonly opts: EnergyKindControlOptions
	) {
		this.value = opts.value ?? "steady";
		const group = container.createDiv({
			cls: "tn-energy-kind",
			attr: { role: "radiogroup", "aria-label": opts.groupLabel },
		});
		for (const kind of ORDER) {
			const btn = group.createEl("button", {
				cls: `tn-energy-kind__option tn-energy-kind__option--${kind}`,
				attr: { role: "radio", type: "button", "aria-label": opts.labels[kind] },
			});
			setIcon(btn.createSpan({ cls: "tn-energy-kind__icon" }), ICONS[kind]);
			setTooltip(btn, opts.labels[kind]);
			btn.addEventListener("click", () => this.select(kind));
			btn.addEventListener("keydown", (e) => {
				const i = ORDER.indexOf(this.value);
				if (e.key === "ArrowRight" || e.key === "ArrowDown") {
					e.preventDefault();
					this.select(ORDER[(i + 1) % ORDER.length], true);
				} else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
					e.preventDefault();
					this.select(ORDER[(i + ORDER.length - 1) % ORDER.length], true);
				}
			});
			this.buttons.set(kind, btn);
		}
		this.sync();
	}

	private select(kind: EnergyKind, focus = false): void {
		this.value = kind;
		this.sync();
		if (focus) this.buttons.get(kind)?.focus();
		this.opts.onChange(kind);
	}

	private sync(): void {
		for (const [kind, btn] of this.buttons) {
			const checked = kind === this.value;
			btn.setAttr("aria-checked", String(checked));
			btn.setAttr("tabindex", checked ? "0" : "-1");
			btn.toggleClass("is-active", checked);
		}
	}
}
