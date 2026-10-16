import { setIcon } from "obsidian";
import type { DayEnergy, EnergyContribution } from "../core/energyModel";
import type { DayItem } from "../core/dayPlan";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "Components/EnergyPanel" });

export interface EnergyPanelDeps {
	getDayEnergy(date: string): Promise<DayEnergy>;
	isActive(): boolean;
	getCapacityLine?(date: string): Promise<string | null>;
	/** Task title, event title or timeblock title. */
	titleOf(item: DayItem): string;
	openItem(item: DayItem): void;
	showDrainTasks(date: string, contributions: EnergyContribution[]): void;
	/** Offer undated spark tasks to schedule on `date` (the panel's date). */
	findSpark(date: string): void;
	openSettings(): void;
	t: (k: string, p?: Record<string, string | number>) => string;
	today(): string;
}

const MAX_EFFECTS = 6;

function setVar(el: HTMLElement, name: string, value: string): void {
	if (typeof el.setCssProps === "function") el.setCssProps({ [name]: value });
	else el.style.setProperty(name, value);
}

function shiftDate(date: string, days: number): string {
	const d = new Date(`${date}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function formatPoints(points: number): string {
	return points > 0 ? `+${points}` : `−${Math.abs(points)}`;
}

/** Shared renderer for the energy sidebar view and the `tasknotes-energy` code block. */
export class EnergyPanel {
	private date: string;
	// Bumped on every render; a render whose data arrives after a newer render started is dropped.
	private generation = 0;

	constructor(
		private readonly container: HTMLElement,
		private readonly deps: EnergyPanelDeps,
		private readonly opts: { date: string; navigable: boolean }
	) {
		this.date = opts.date;
		container.addClass("tn-energy-panel");
	}

	getDate(): string {
		return this.date;
	}

	async setDate(date: string): Promise<void> {
		this.date = date;
		await this.render();
	}

	async render(): Promise<void> {
		const generation = ++this.generation;
		const date = this.date;

		if (!this.deps.isActive()) {
			this.reset();
			this.renderEmpty(this.container);
			return;
		}

		let energy: DayEnergy;
		let capacity: string | null;
		try {
			[energy, capacity] = await Promise.all([
				this.deps.getDayEnergy(date),
				this.deps.getCapacityLine ? this.deps.getCapacityLine(date) : Promise.resolve(null),
			]);
		} catch (error) {
			tasknotesLogger.warn("Failed to load energy for panel", {
				category: "internal",
				operation: "energy-panel-render",
				details: { date },
				error,
			});
			return;
		}
		if (generation !== this.generation) return;

		this.reset();
		this.renderDay(this.container, date, energy, capacity);
	}

	private reset(): void {
		this.container.empty();
		if (this.opts.navigable) this.renderNav(this.container);
	}

	private renderDay(el: HTMLElement, date: string, e: DayEnergy, capacity: string | null): void {
		const { t } = this.deps;
		const isToday = date === this.deps.today();

		// 1. Gauge
		const gauge = el.createDiv({
			cls: `tn-energy-gauge is-${e.level}`,
			attr: {
				role: "img",
				"aria-label": t("energy.panel.gaugeAria", { now: e.now, projected: e.projected }),
			},
		});
		const bar = gauge.createDiv({ cls: "tn-energy-gauge__bar" });
		const fill = bar.createDiv({ cls: "tn-energy-gauge__fill" });
		setVar(fill, "--tn-energy-level", `${isToday ? e.now : e.projected}%`);
		const marker = bar.createDiv({ cls: "tn-energy-gauge__marker" });
		setVar(marker, "--tn-energy-level", `${e.projected}%`);
		const labels = gauge.createDiv({ cls: "tn-energy-gauge__labels" });
		if (isToday) {
			labels.createSpan({ text: t("energy.panel.now", { level: e.now }) });
			labels.createSpan({ text: "→" });
			labels.createSpan({ text: t("energy.panel.tonight", { level: e.projected }) });
		} else {
			labels.createSpan({ text: t("energy.panel.projected", { level: e.projected }) });
		}

		// 2. Mix
		const mix = el.createDiv({ cls: "tn-energy-panel__mix" });
		for (const kind of ["spark", "steady", "drain"] as const) {
			const doneHours = e.contributions
				.filter((c) => c.kind === kind && c.item.done)
				.reduce((s, c) => s + c.minutes / 60, 0);
			mix.createDiv({
				cls: `tn-energy-panel__mix-row tn-energy-panel__mix-row--${kind}`,
				text: t("energy.panel.mix", {
					kind: t(`energy.kinds.${kind}`),
					hours: e.hours[kind],
					done: Math.round(doneHours * 10) / 10,
				}),
			});
		}

		// 3. Biggest effects. `!== 0` also drops -0, so no "−0" is shown.
		const effects = e.contributions.filter((c) => c.points !== 0).slice(0, MAX_EFFECTS);
		if (effects.length) {
			el.createDiv({ cls: "tn-energy-panel__heading", text: t("energy.panel.biggest") });
			const list = el.createEl("ul", { cls: "tn-energy-panel__effects" });
			for (const c of effects) {
				const li = list.createEl("li", {
					cls: `tn-energy-panel__effect tn-energy-panel__effect--${c.kind}`,
				});
				const btn = li.createEl("button", {
					cls: "tn-energy-panel__effect-title",
					text: this.deps.titleOf(c.item),
				});
				btn.addEventListener("click", () => this.deps.openItem(c.item));
				li.createSpan({ cls: "tn-energy-panel__points", text: formatPoints(c.points) });
			}
		}
		if (e.assumedSizeCount > 0) {
			el.createDiv({
				cls: "tn-energy-panel__note",
				text: t("energy.panel.assumed", { count: e.assumedSizeCount }),
			});
		}

		// 4. Capacity line
		if (capacity) el.createDiv({ cls: "tn-energy-panel__capacity", text: capacity });

		// 5. Low-battery suggestion
		if (e.level === "low") {
			const low = el.createDiv({ cls: "tn-energy-panel__low" });
			low.createDiv({ cls: "tn-energy-panel__low-title", text: t("energy.panel.lowTitle") });
			low.createDiv({ text: t("energy.panel.lowBody") });
			const actions = low.createDiv({ cls: "tn-energy-panel__actions" });
			actions
				.createEl("button", { text: t("energy.panel.showDrains") })
				.addEventListener("click", () =>
					this.deps.showDrainTasks(
						date,
						e.contributions.filter((c) => c.points < 0)
					)
				);
			actions
				.createEl("button", { text: t("energy.panel.findSpark") })
				.addEventListener("click", () => this.deps.findSpark(date));
		}
	}

	private renderNav(el: HTMLElement): void {
		const { t } = this.deps;
		const nav = el.createDiv({ cls: "tn-energy-panel__nav" });
		const prev = nav.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": t("energy.panel.previousDay") },
		});
		setIcon(prev, "chevron-left");
		prev.addEventListener("click", () => void this.setDate(shiftDate(this.date, -1)));
		const label = nav.createEl("button", {
			cls: "tn-energy-panel__date",
			text: this.date === this.deps.today() ? t("energy.panel.today") : this.date,
		});
		label.addEventListener("click", () => void this.setDate(this.deps.today()));
		const next = nav.createEl("button", {
			cls: "clickable-icon",
			attr: { "aria-label": t("energy.panel.nextDay") },
		});
		setIcon(next, "chevron-right");
		next.addEventListener("click", () => void this.setDate(shiftDate(this.date, 1)));
	}

	private renderEmpty(el: HTMLElement): void {
		const { t } = this.deps;
		const empty = el.createDiv({ cls: "tn-energy-panel__empty" });
		empty.createDiv({ cls: "tn-energy-panel__heading", text: t("energy.panel.emptyTitle") });
		empty.createDiv({ text: t("energy.panel.emptyBody") });
		empty
			.createEl("button", { text: t("energy.panel.openSettings") })
			.addEventListener("click", () => this.deps.openSettings());
	}
}
