import { Platform } from "obsidian";
import { StatusBarService } from "../../../src/ui/StatusBarService";

type TestEnergy = { projected: number; level: string; hasSignal: boolean };

function createPlugin(
	opts: { showInStatusBar?: boolean; energy?: TestEnergy | null; plannedMinutes?: number } = {}
) {
	let onChange: (() => void) | null = null;
	const getDayCapacity = jest.fn(async (date: string) => ({
		date,
		availableMinutes: 120,
		plannedMinutes: opts.plannedMinutes ?? 60,
		overByMinutes: 0,
		unestimatedCount: 0,
		tasks: [],
		hasWorkHours: true,
	}));
	const plugin = {
		settings: {
			showTrackedTasksInStatusBar: false,
			showPomodoroInStatusBar: false,
			planning: { showInStatusBar: opts.showInStatusBar ?? true },
		},
		i18n: { translate: (key: string) => key },
		addStatusBarItem: jest.fn(() => document.createElement("div")),
		registerInterval: jest.fn((id: number) => id),
		capacityService: { getDayCapacity },
		energyService: {
			isActive: jest.fn(() => !!opts.energy),
			getDayEnergy: jest.fn(async (): Promise<TestEnergy | null | undefined> => opts.energy),
		},
		dayPlanService: {
			onChange: jest.fn((fn: () => void) => {
				onChange = fn;
				return () => {
					onChange = null;
				};
			}),
		},
	};
	const statusEl = () => plugin.addStatusBarItem.mock.results[0]?.value as HTMLElement | undefined;
	return { plugin, getDayCapacity, statusEl, fireChange: () => onChange?.() };
}

const flush = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve();
};
const isHidden = (el: HTMLElement) => el.classList.contains("tn-static-display-none-6b99de8b");

describe("StatusBarService capacity item", () => {
	const originalMobile = Platform.isMobile;

	afterEach(() => {
		(Platform as { isMobile: boolean }).isMobile = originalMobile;
		jest.useRealTimers();
	});

	it("collapses a burst of day-plan changes into one recompute", async () => {
		jest.useFakeTimers();
		const { plugin, getDayCapacity, fireChange } = createPlugin();
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await Promise.resolve();
		expect(getDayCapacity).toHaveBeenCalledTimes(1);

		fireChange();
		fireChange();
		fireChange();
		jest.advanceTimersByTime(500);
		expect(getDayCapacity).toHaveBeenCalledTimes(1);

		jest.advanceTimersByTime(300);
		expect(getDayCapacity).toHaveBeenCalledTimes(2);
		service.destroy();
	});

	it("does no capacity work on mobile", async () => {
		(Platform as { isMobile: boolean }).isMobile = true;
		const { plugin, getDayCapacity } = createPlugin({
			energy: { projected: 40, level: "ok", hasSignal: true },
		});
		const service = new StatusBarService(plugin as never);
		service.initialize();
		service.updateVisibility();
		await Promise.resolve();
		expect(plugin.addStatusBarItem).not.toHaveBeenCalled();
		expect(plugin.dayPlanService.onChange).not.toHaveBeenCalled();
		expect(plugin.registerInterval).not.toHaveBeenCalled();
		expect(getDayCapacity).not.toHaveBeenCalled();
		expect(plugin.energyService.getDayEnergy).not.toHaveBeenCalled();
		service.destroy();
	});

	it("prefixes the capacity text with the battery level", async () => {
		const { plugin, statusEl } = createPlugin({
			energy: { projected: 40, level: "ok", hasSignal: true },
		});
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await flush();
		expect(statusEl()?.textContent).toBe("🔋40% · capacity.status");
		expect(isHidden(statusEl()!)).toBe(false);
		expect(statusEl()?.classList.contains("is-low-energy")).toBe(false);
		service.destroy();
	});

	it("shows only the battery when the capacity item is off but energy is active", async () => {
		const { plugin, getDayCapacity, statusEl } = createPlugin({
			showInStatusBar: false,
			energy: { projected: 10, level: "low", hasSignal: true },
		});
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await flush();
		expect(getDayCapacity).not.toHaveBeenCalled();
		expect(statusEl()?.textContent).toBe("🪫10%");
		expect(statusEl()?.classList.contains("is-low-energy")).toBe(true);
		expect(isHidden(statusEl()!)).toBe(false);
		service.destroy();
	});

	it("creates nothing when the capacity item is off and energy is inactive", async () => {
		const { plugin } = createPlugin({ showInStatusBar: false, energy: null });
		const service = new StatusBarService(plugin as never);
		service.initialize();
		service.updateVisibility();
		await flush();
		expect(plugin.addStatusBarItem).not.toHaveBeenCalled();
		expect(plugin.dayPlanService.onChange).not.toHaveBeenCalled();
		expect(plugin.registerInterval).not.toHaveBeenCalled();
		service.destroy();
	});

	it("hides the item when both texts are empty", async () => {
		const { plugin, statusEl } = createPlugin({
			plannedMinutes: 0,
			energy: { projected: 70, level: "high", hasSignal: false },
		});
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await flush();
		expect(isHidden(statusEl()!)).toBe(true);
		service.destroy();
	});

	it("re-evaluates the gating when energy is turned on later", async () => {
		const { plugin, statusEl } = createPlugin({ showInStatusBar: false, energy: null });
		const service = new StatusBarService(plugin as never);
		service.initialize();
		await flush();
		expect(plugin.addStatusBarItem).not.toHaveBeenCalled();

		plugin.energyService.isActive.mockReturnValue(true);
		plugin.energyService.getDayEnergy.mockResolvedValue({
			projected: 55,
			level: "ok",
			hasSignal: true,
		});
		service.updateVisibility();
		await flush();
		expect(statusEl()?.textContent).toBe("🔋55%");
		expect(isHidden(statusEl()!)).toBe(false);

		plugin.energyService.isActive.mockReturnValue(false);
		service.updateVisibility();
		await flush();
		expect(isHidden(statusEl()!)).toBe(true);
		service.destroy();
	});
});
