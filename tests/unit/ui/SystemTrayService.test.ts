import { Platform } from "obsidian";
import { SystemTrayService } from "../../../src/ui/SystemTrayService";
import { EVENT_POMODORO_TICK, PomodoroState } from "../../../src/types";

const trays: FakeTray[] = [];
class FakeTray {
	title = "";
	toolTip = "";
	menu: unknown = null;
	destroyed = false;
	titles: string[] = [];
	menus = 0;
	constructor() {
		trays.push(this);
	}
	setImage() {}
	setTitle(title: string) {
		this.title = title;
		this.titles.push(title);
	}
	setToolTip(toolTip: string) {
		this.toolTip = toolTip;
	}
	setContextMenu(menu: unknown) {
		this.menu = menu;
		this.menus++;
	}
	destroy() {
		this.destroyed = true;
	}
	isDestroyed() {
		return this.destroyed;
	}
}

jest.mock(
	"@electron/remote",
	() => ({
		Tray: function (this: unknown) {
			return new FakeTray();
		},
		Menu: { buildFromTemplate: (items: { label?: string }[]) => items.map((i) => i.label ?? "-") },
		nativeImage: { createEmpty: () => ({ addRepresentation() {}, setTemplateImage() {} }) },
		getCurrentWindow: () => ({ show() {}, focus() {} }),
	}),
	{ virtual: true }
);

function createPlugin(state: PomodoroState) {
	const listeners = new Map<string, () => void>();
	return {
		listeners,
		state,
		settings: { showInSystemTray: true, calendarViewSettings: { timeFormat: "24" } },
		i18n: { translate: (k: string, p?: Record<string, unknown>) => `${k}${p ? JSON.stringify(p) : ""}` },
		emitter: {
			on: jest.fn((name: string, cb: () => void) => {
				listeners.set(name, cb);
				return { name };
			}),
			offref: jest.fn(),
		},
		dayPlanService: { getDayItems: jest.fn(async () => []) },
		energyService: {
			isActive: () => true,
			getDayEnergy: jest.fn(async () => ({ projected: 41, now: 62, level: "ok", hasSignal: true })),
			onChange: jest.fn(() => () => undefined),
		},
		pomodoroService: { getState: () => state },
	};
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("SystemTrayService", () => {
	beforeEach(() => {
		trays.length = 0;
		Object.assign(Platform, { isDesktopApp: true, isMacOS: true });
	});

	it("shows today's battery and a running timer in the menu bar title", async () => {
		const state: PomodoroState = {
			isRunning: true,
			timeRemaining: 300,
			currentSession: { id: "s", type: "work", completed: false, plannedDuration: 25, startTime: "", activePeriods: [] },
		};
		const plugin = createPlugin(state);
		const service = new SystemTrayService(plugin as never);
		service.updateVisibility();
		await flush();
		expect(trays).toHaveLength(1);
		expect(trays[0].title).toBe(" 🔋41% · 🍅 5m");
		expect(trays[0].menu).toEqual(
			expect.arrayContaining(["tray.actions.pause", "tray.actions.stop", "tray.actions.open"])
		);
		service.destroy();
	});

	it("only touches the item when its text changes", async () => {
		const state: PomodoroState = {
			isRunning: true,
			timeRemaining: 300,
			currentSession: { id: "s", type: "work", completed: false, plannedDuration: 25, startTime: "", activePeriods: [] },
		};
		const plugin = createPlugin(state);
		const service = new SystemTrayService(plugin as never);
		service.updateVisibility();
		await flush();
		const tray = trays[0];
		const before = { titles: tray.titles.length, menus: tray.menus };
		state.timeRemaining = 290; // still 5 minutes, rounded up
		plugin.listeners.get(EVENT_POMODORO_TICK)?.();
		expect(tray.titles.length).toBe(before.titles);
		expect(tray.menus).toBe(before.menus);
		state.timeRemaining = 239;
		plugin.listeners.get(EVENT_POMODORO_TICK)?.();
		expect(tray.title).toBe(" 🔋41% · 🍅 4m");
		service.destroy();
	});

	it("removes the item when turned off and creates none off the desktop app", async () => {
		const plugin = createPlugin({ isRunning: false, timeRemaining: 1500 });
		const service = new SystemTrayService(plugin as never);
		service.updateVisibility();
		await flush();
		plugin.settings.showInSystemTray = false;
		service.updateVisibility();
		expect(trays[0].destroyed).toBe(true);
		expect(plugin.emitter.offref).toHaveBeenCalled();

		Object.assign(Platform, { isDesktopApp: false });
		plugin.settings.showInSystemTray = true;
		service.updateVisibility();
		expect(trays).toHaveLength(1);
	});
});
