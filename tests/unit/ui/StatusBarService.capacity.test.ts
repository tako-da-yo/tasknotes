import { Platform } from "obsidian";
import { StatusBarService } from "../../../src/ui/StatusBarService";

function createPlugin() {
	let onChange: (() => void) | null = null;
	const getDayCapacity = jest.fn(async (date: string) => ({
		date,
		availableMinutes: 120,
		plannedMinutes: 60,
		overByMinutes: 0,
		unestimatedCount: 0,
		tasks: [],
		hasWorkHours: true,
	}));
	const plugin = {
		settings: {
			showTrackedTasksInStatusBar: false,
			showPomodoroInStatusBar: false,
			planning: { showInStatusBar: true },
		},
		i18n: { translate: (key: string) => key },
		addStatusBarItem: jest.fn(() => document.createElement("div")),
		registerInterval: jest.fn((id: number) => id),
		capacityService: { getDayCapacity },
		dayPlanService: {
			onChange: jest.fn((fn: () => void) => {
				onChange = fn;
				return () => {
					onChange = null;
				};
			}),
		},
	};
	return { plugin, getDayCapacity, fireChange: () => onChange?.() };
}

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
		const { plugin, getDayCapacity } = createPlugin();
		const service = new StatusBarService(plugin as never);
		service.initialize();
		service.updateVisibility();
		await Promise.resolve();
		expect(plugin.addStatusBarItem).not.toHaveBeenCalled();
		expect(plugin.dayPlanService.onChange).not.toHaveBeenCalled();
		expect(plugin.registerInterval).not.toHaveBeenCalled();
		expect(getDayCapacity).not.toHaveBeenCalled();
		service.destroy();
	});
});
