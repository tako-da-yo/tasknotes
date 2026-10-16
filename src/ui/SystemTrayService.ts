import { EventRef, Platform } from "obsidian";
import type TaskNotesPlugin from "../main";
import {
	EVENT_POMODORO_COMPLETE,
	EVENT_POMODORO_INTERRUPT,
	EVENT_POMODORO_START,
	EVENT_POMODORO_TICK,
} from "../types";
import type { DayEnergy } from "../core/energyModel";
import type { DayItem } from "../core/dayPlan";
import { currentAndNext, trayStatus, TrayStatus } from "../core/trayStatus";
import { formatTime, getTodayString } from "../utils/dateUtils";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";

const tasknotesLogger = createTaskNotesLogger({ tag: "UI/SystemTrayService" });

// The parts of Electron's main-process API used here, reached through @electron/remote.
interface NativeImageLike {
	addRepresentation(options: { scaleFactor: number; dataURL: string }): void;
	setTemplateImage(option: boolean): void;
}
interface TrayLike {
	setImage(image: NativeImageLike): void;
	setTitle(title: string): void;
	setToolTip(toolTip: string): void;
	setContextMenu(menu: unknown): void;
	destroy(): void;
	isDestroyed(): boolean;
}
interface MenuItemTemplate {
	label?: string;
	type?: "separator";
	enabled?: boolean;
	click?: () => void;
}
interface RemoteLike {
	Tray: new (image: NativeImageLike) => TrayLike;
	Menu: { buildFromTemplate(template: MenuItemTemplate[]): unknown };
	nativeImage: { createEmpty(): NativeImageLike };
	getCurrentWindow(): { show(): void; focus(): void };
}

function loadRemote(): RemoteLike | null {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports -- The menu bar item needs Electron's main-process Tray, which Obsidian exposes through @electron/remote.
		return require("@electron/remote") as RemoteLike;
	} catch {
		return null;
	}
}

const REFRESH_MS = 30_000;
const ICON_POINTS = 16;

/**
 * Today's battery, the Pomodoro or focus session, and the task or event on now and next
 * in the system menu bar (macOS) or notification area (Windows, Linux). Desktop only.
 */
export class SystemTrayService {
	private remote: RemoteLike | null = null;
	private tray: TrayLike | null = null;
	private energy: DayEnergy | null = null;
	private items: DayItem[] = [];
	private shown: { title: string; menuKey: string; iconKey: string } | null = null;
	private eventRefs: EventRef[] = [];
	private unsubscribeEnergy: (() => void) | null = null;
	private timer: number | null = null;
	private loadGeneration = 0;

	constructor(private readonly plugin: TaskNotesPlugin) {}

	/** Show or hide the menu bar item to match the setting. */
	updateVisibility(): void {
		if (this.plugin.settings.showInSystemTray && Platform.isDesktopApp) this.start();
		else this.stop();
	}

	destroy(): void {
		this.stop();
	}

	private start(): void {
		if (this.tray) return;
		this.remote ??= loadRemote();
		if (!this.remote) {
			tasknotesLogger.warn("System menu bar item unavailable: no access to Electron", {
				category: "internal",
				operation: "system-tray-start",
			});
			return;
		}
		try {
			this.tray = new this.remote.Tray(this.drawIcon(null));
		} catch (error) {
			tasknotesLogger.warn("Failed to create the system menu bar item", {
				category: "internal",
				operation: "system-tray-create",
				error,
			});
			return;
		}
		const render = () => this.render();
		this.eventRefs = [
			this.plugin.emitter.on(EVENT_POMODORO_START, render),
			this.plugin.emitter.on(EVENT_POMODORO_TICK, render),
			this.plugin.emitter.on(EVENT_POMODORO_COMPLETE, render),
			this.plugin.emitter.on(EVENT_POMODORO_INTERRUPT, render),
		];
		this.unsubscribeEnergy = this.plugin.energyService?.onChange(() => void this.reload()) ?? null;
		// Events start and end and the battery's "now" level moves with the clock.
		this.timer = window.setInterval(() => void this.reload(), REFRESH_MS);
		void this.reload();
	}

	private stop(): void {
		this.loadGeneration++;
		this.eventRefs.forEach((ref) => this.plugin.emitter.offref(ref));
		this.eventRefs = [];
		this.unsubscribeEnergy?.();
		this.unsubscribeEnergy = null;
		if (this.timer !== null) window.clearInterval(this.timer);
		this.timer = null;
		if (this.tray && !this.tray.isDestroyed()) this.tray.destroy();
		this.tray = null;
		this.shown = null;
		this.items = [];
	}

	/** Re-read today's battery and events, then redraw. */
	private async reload(): Promise<void> {
		const generation = ++this.loadGeneration;
		const today = getTodayString();
		try {
			const [items, energy] = await Promise.all([
				this.plugin.dayPlanService.getDayItems(today),
				this.plugin.energyService?.isActive() ? this.plugin.energyService.getDayEnergy(today) : null,
			]);
			if (generation !== this.loadGeneration || !this.tray) return;
			this.items = items;
			this.energy = energy;
		} catch (error) {
			tasknotesLogger.warn("Failed to load the system menu bar status", {
				category: "internal",
				operation: "system-tray-reload",
				error,
			});
		}
		this.render();
	}

	private status(): TrayStatus {
		const timeFormat = this.plugin.settings.calendarViewSettings.timeFormat;
		const now = Date.now();
		return trayStatus({
			energy: this.energy,
			pomodoro: this.plugin.pomodoroService.getState(),
			schedule: currentAndNext(this.items, now),
			now,
			formatClock: (ms) => formatTime(new Date(ms), timeFormat),
			t: (key, params) => this.plugin.i18n.translate(key, params),
		});
	}

	/** Update the title, tooltip, menu and icon, touching only what changed. */
	private render(): void {
		const tray = this.tray;
		if (!tray || tray.isDestroyed()) return;
		const status = this.status();
		const state = this.plugin.pomodoroService.getState();
		const menuKey = JSON.stringify([status.lines, state.isRunning, !!state.currentSession, !!state.plan]);
		const iconKey = this.energy?.hasSignal ? `${this.energy.level}:${this.energy.projected}` : "none";
		const shown = this.shown;
		try {
			// Windows shows no text beside the icon, so everything is in the tooltip and menu.
			if (status.title !== shown?.title) tray.setTitle(status.title ? ` ${status.title}` : "");
			if (menuKey !== shown?.menuKey) {
				tray.setToolTip(status.lines.join("\n") || this.plugin.i18n.translate("tray.name"));
				tray.setContextMenu(this.buildMenu(status));
			}
			if (iconKey !== shown?.iconKey) tray.setImage(this.drawIcon(this.energy));
			this.shown = { title: status.title, menuKey, iconKey };
		} catch (error) {
			tasknotesLogger.warn("Failed to update the system menu bar item", {
				category: "internal",
				operation: "system-tray-render",
				error,
			});
		}
	}

	private buildMenu(status: TrayStatus): unknown {
		const remote = this.remote;
		if (!remote) return null;
		const t = (key: string) => this.plugin.i18n.translate(key);
		const pomodoro = this.plugin.pomodoroService;
		const state = pomodoro.getState();
		const run = (action: () => Promise<unknown>) => () => {
			action().catch((error) =>
				tasknotesLogger.warn("System menu bar action failed", {
					category: "internal",
					operation: "system-tray-action",
					error,
				})
			);
		};
		const items: MenuItemTemplate[] = status.lines.map((label) => ({ label, enabled: false }));
		if (items.length) items.push({ type: "separator" });
		if (state.isRunning) {
			items.push({ label: t("tray.actions.pause"), click: run(() => pomodoro.pausePomodoro()) });
		} else if (state.currentSession || state.plan) {
			items.push({ label: t("tray.actions.resume"), click: run(() => pomodoro.startNext()) });
		} else {
			items.push({ label: t("tray.actions.start"), click: run(() => pomodoro.startNext()) });
		}
		if (state.plan) items.push({ label: t("tray.actions.skip"), click: run(() => pomodoro.skipFocusChunk()) });
		if (state.currentSession || state.plan) {
			items.push({ label: t("tray.actions.stop"), click: run(() => pomodoro.stopPomodoro()) });
		}
		items.push({ type: "separator" });
		items.push({
			label: t("tray.actions.open"),
			click: run(async () => {
				const win = remote.getCurrentWindow();
				win.show();
				win.focus();
				await this.plugin.activatePomodoroView();
			}),
		});
		return remote.Menu.buildFromTemplate(items);
	}

	/**
	 * A small sideways battery filled to the projected level, or an empty outline without
	 * energy. On macOS it is a template image so the menu bar can tint it.
	 */
	private drawIcon(energy: DayEnergy | null): NativeImageLike {
		const remote = this.remote;
		if (!remote) throw new Error("Electron unavailable");
		const image = remote.nativeImage.createEmpty();
		const level = energy?.hasSignal ? Math.max(0, Math.min(100, energy.projected)) / 100 : null;
		for (const scale of [1, 2]) {
			const url = this.drawBattery(ICON_POINTS * scale, scale, level, energy?.level);
			if (url) image.addRepresentation({ scaleFactor: scale, dataURL: url });
		}
		if (Platform.isMacOS) image.setTemplateImage(true);
		return image;
	}

	private drawBattery(size: number, scale: number, level: number | null, kind?: DayEnergy["level"]): string | null {
		const canvas = activeWindow.createEl("canvas");
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		const template = Platform.isMacOS;
		const ink = template ? "#000" : "#9a9a9a";
		const u = scale;
		// Body 13x8 points, centred, with the cap on the left (as in the calendar).
		const x = 2.5 * u;
		const y = 4.5 * u;
		const w = 12 * u;
		const h = 7 * u;
		ctx.lineWidth = u;
		ctx.strokeStyle = ink;
		ctx.strokeRect(x, y, w, h);
		ctx.fillStyle = ink;
		ctx.fillRect(x - 2 * u, y + 2 * u, 1.5 * u, 3 * u);
		if (level !== null && level > 0) {
			const inner = w - 2 * u;
			const fill = Math.max(u, inner * level);
			ctx.fillStyle = template ? "#000" : kind === "low" ? "#e5534b" : kind === "high" ? "#57ab5a" : "#c69026";
			// Charges from the right edge towards the cap.
			ctx.fillRect(x + u + (inner - fill), y + u, fill, h - 2 * u);
		}
		return canvas.toDataURL("image/png");
	}
}
