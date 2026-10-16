import { format } from "date-fns";
import type { DayEnergy } from "../core/energyModel";
import type { EnergyService } from "../services/EnergyService";

type TFn = (k: string, p?: Record<string, string | number>) => string;

/** A FullCalendar range with an exclusive end, as an inclusive local "yyyy-MM-dd" range. */
export function toLocalDateRange(rangeStart: Date, rangeEnd: Date): { start: string; end: string } {
	const lastDay = new Date(rangeEnd);
	lastDay.setDate(lastDay.getDate() - 1);
	return { start: format(rangeStart, "yyyy-MM-dd"), end: format(lastDay, "yyyy-MM-dd") };
}

function setLevel(el: HTMLElement, level: number): void {
	const props = { "--tn-energy-level": `${Math.max(0, Math.min(100, level))}%` };
	if (typeof el.setCssProps === "function") el.setCssProps(props);
	else el.style.setProperty("--tn-energy-level", props["--tn-energy-level"]);
}

export function renderEnergyGlyph(host: HTMLElement, energy: DayEnergy | undefined, t: TFn, onClick?: (date: string) => void): void {
	host.querySelector(":scope > .tn-energy-glyph")?.remove();
	if (!energy?.hasSignal) return;
	const glyph = host.createDiv({
		cls: `tn-energy-glyph is-${energy.level}`,
		attr: {
			role: onClick ? "button" : "img",
			tabindex: onClick ? "0" : "-1",
			"aria-label": t("energy.glyph.aria", { level: energy.projected, drain: energy.hours.drain, spark: energy.hours.spark, steady: energy.hours.steady }),
		},
	});
	glyph.setAttr("title", glyph.getAttr("aria-label") ?? "");
	glyph.createDiv({ cls: "tn-energy-glyph__fill" });
	setLevel(glyph, energy.projected);
	if (onClick) {
		const open = (e: Event) => { e.preventDefault(); e.stopPropagation(); onClick(energy.date); };
		glyph.addEventListener("click", open);
		glyph.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") open(e); });
		// FullCalendar starts a date selection on mousedown/touchstart inside a day cell,
		// which would open the create menu on top of the panel. Keep those to the glyph.
		// Only mousedown's default is prevented: on touch it would suppress the click.
		glyph.addEventListener("pointerdown", (e) => e.stopPropagation());
		glyph.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
		glyph.addEventListener("touchstart", (e) => e.stopPropagation(), { passive: true });
	}
}

export class CalendarEnergyIndicators {
	// A date can be on screen more than once (e.g. a day header and a cell), so keep
	// every host per date; registering never displaces another host.
	private hosts = new Map<string, Set<HTMLElement>>();

	constructor(private readonly deps: { energy: EnergyService; t: TFn; onClick: (date: string) => void }) {}

	register(date: string, host: HTMLElement): void {
		const hosts = this.hosts.get(date);
		if (hosts) hosts.add(host);
		else this.hosts.set(date, new Set([host]));
	}

	async refresh(start: string, end: string): Promise<void> {
		// Nothing on screen to draw into (e.g. a hidden or detached calendar).
		if (this.hosts.size === 0) return;
		if (!this.deps.energy.isActive()) {
			for (const hosts of this.hosts.values()) {
				for (const host of hosts) renderEnergyGlyph(host, undefined, this.deps.t);
			}
			return;
		}
		const range = await this.deps.energy.getEnergyInRange(start, end);
		for (const [date, hosts] of this.hosts) {
			if (date < start || date > end) continue;
			for (const host of hosts) renderEnergyGlyph(host, range.get(date), this.deps.t, this.deps.onClick);
		}
	}

	/**
	 * Drop hosts that left the DOM. FullCalendar reuses cells across navigation without
	 * re-firing didMount, and fires `datesSet` after new cells register, so neither
	 * clearing nor pruning by date is safe there.
	 */
	prune(): void {
		for (const [date, hosts] of this.hosts) {
			for (const host of hosts) if (!host.isConnected) hosts.delete(host);
			if (hosts.size === 0) this.hosts.delete(date);
		}
	}

	clear(): void {
		this.hosts.clear();
	}
}
