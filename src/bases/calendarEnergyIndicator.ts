import { format } from "date-fns";
import type { DayEnergy } from "../core/energyModel";
import type { EnergyService } from "../services/EnergyService";

type TFn = (k: string, p?: Record<string, string | number>) => string;

/** FullCalendar's exclusive [currentStart, currentEnd) as an inclusive local "yyyy-MM-dd" range. */
export function toLocalDateRange(currentStart: Date, currentEnd: Date): { start: string; end: string } {
	const lastDay = new Date(currentEnd);
	lastDay.setDate(lastDay.getDate() - 1);
	return { start: format(currentStart, "yyyy-MM-dd"), end: format(lastDay, "yyyy-MM-dd") };
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
	}
}

export class CalendarEnergyIndicators {
	private hosts = new Map<string, HTMLElement>();

	constructor(private readonly deps: { energy: EnergyService; t: TFn; onClick: (date: string) => void }) {}

	register(date: string, host: HTMLElement): void {
		this.hosts.set(date, host);
	}

	async refresh(start: string, end: string): Promise<void> {
		if (!this.deps.energy.isActive()) {
			for (const host of this.hosts.values()) renderEnergyGlyph(host, undefined, this.deps.t);
			return;
		}
		const range = await this.deps.energy.getEnergyInRange(start, end);
		for (const [date, host] of this.hosts) {
			if (date < start || date > end) continue;
			renderEnergyGlyph(host, range.get(date), this.deps.t, this.deps.onClick);
		}
	}

	/**
	 * Drop hosts outside the visible range. FullCalendar fires `datesSet` after the
	 * new cells' didMount hooks, so clearing there would drop the fresh hosts.
	 */
	prune(start: string, end: string): void {
		for (const date of [...this.hosts.keys()]) {
			if (date < start || date > end) this.hosts.delete(date);
		}
	}

	clear(): void {
		this.hosts.clear();
	}
}
