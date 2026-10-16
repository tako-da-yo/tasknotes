import { PomodoroService } from "../../../src/services/PomodoroService";
import { EVENT_POMODORO_COMPLETE } from "../../../src/types";

type PomodoroPlugin = ConstructorParameters<typeof PomodoroService>[0];

function createMockPlugin() {
	let data: Record<string, unknown> = {};
	const task = { path: "Tasks/report.md", title: "Report", status: "open" };
	return {
		task,
		settings: {
			pomodoroWorkDuration: 25,
			pomodoroShortBreakDuration: 5,
			pomodoroLongBreakDuration: 15,
			pomodoroLongBreakInterval: 4,
			pomodoroAutoStartBreaks: false,
			pomodoroAutoStartWork: false,
			pomodoroNotifications: false,
			pomodoroSoundEnabled: false,
			pomodoroStorageLocation: "plugin",
			focusSplitThreshold: 30,
			focusDrainChunkMinutes: 20,
			focusSparkChunkMinutes: 45,
		},
		i18n: { translate: jest.fn((key: string) => key) },
		loadData: jest.fn(async () => data),
		loadPluginDataForSafeWrite: jest.fn(async () => data),
		saveData: jest.fn(async (next: Record<string, unknown>) => {
			data = { ...next };
		}),
		emitter: { trigger: jest.fn() },
		taskService: { startTimeTracking: jest.fn(async () => task), stopTimeTracking: jest.fn(async () => task) },
		cacheManager: { getTaskInfo: jest.fn(async () => task) },
		statusManager: { isCompletedStatus: () => false },
	};
}

const complete = (service: PomodoroService) =>
	(service as unknown as { completePomodoro(): Promise<void> }).completePomodoro();

describe("PomodoroService focus sessions", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	async function startReport(plannedMinutes: number | null) {
		const plugin = createMockPlugin();
		const service = new PomodoroService(plugin as unknown as PomodoroPlugin);
		await service.startFocus({
			source: { kind: "task", path: plugin.task.path },
			title: "Report",
			energyKind: "steady",
			plannedMinutes,
		});
		return { plugin, service };
	}

	it("splits the planned time and starts the first work chunk on the task", async () => {
		const { plugin, service } = await startReport(60);
		const plan = service.getFocusPlan()!;
		expect(plan.chunks.map((c) => `${c.type}:${c.minutes}`)).toEqual(["work:28", "short-break:5", "work:27"]);
		expect(plan.chunks[0].status).toBe("active");
		const state = service.getState();
		expect(state.isRunning).toBe(true);
		expect(state.currentSession?.type).toBe("work");
		expect(state.currentSession?.plannedDuration).toBe(28);
		expect(state.currentSession?.taskPath).toBe(plugin.task.path);
		service.cleanup();
	});

	it("runs the next chunk after one ends, whatever the auto-start settings", async () => {
		const { plugin, service } = await startReport(60);
		await complete(service);
		expect(plugin.emitter.trigger).toHaveBeenCalledWith(
			EVENT_POMODORO_COMPLETE,
			expect.objectContaining({ nextType: "short-break" })
		);
		expect(service.getFocusPlan()!.current).toBe(1);
		expect(service.getState().nextSessionType).toBe("short-break");
		await jest.advanceTimersByTimeAsync(1000);
		expect(service.getState().currentSession?.type).toBe("short-break");
		expect(service.getState().currentSession?.plannedDuration).toBe(5);
		service.cleanup();
	});

	it("ends the focus session after the last chunk", async () => {
		const { service } = await startReport(20);
		expect(service.getFocusPlan()!.chunks).toHaveLength(1);
		await complete(service);
		expect(service.getFocusPlan()).toBeUndefined();
		expect(service.getState().timeRemaining).toBe(25 * 60);
		expect(service.getState().nextSessionType).toBeUndefined();
		service.cleanup();
	});

	it("skips the current chunk and starts the next", async () => {
		const { service } = await startReport(60);
		await service.skipFocusChunk();
		const plan = service.getFocusPlan()!;
		expect(plan.chunks[0].status).toBe("skipped");
		expect(plan.current).toBe(1);
		expect(service.getState().currentSession?.type).toBe("short-break");
		service.cleanup();
	});

	it("stopping ends the whole focus session", async () => {
		const { service } = await startReport(60);
		await service.stopPomodoro();
		expect(service.getFocusPlan()).toBeUndefined();
		expect(service.getState().currentSession).toBeUndefined();
		service.cleanup();
	});

	it("uses one work-duration chunk without planned time", async () => {
		const { service } = await startReport(null);
		expect(service.getFocusPlan()!.chunks.map((c) => c.minutes)).toEqual([25]);
		service.cleanup();
	});

	it("keeps a prepared chunk across a reload on the same day", async () => {
		const { plugin, service } = await startReport(60);
		await complete(service);
		service.cleanup();
		const reloaded = new PomodoroService(plugin as unknown as PomodoroPlugin);
		await reloaded.loadState();
		expect(reloaded.getFocusPlan()?.current).toBe(1);
		expect(reloaded.getState().nextSessionType).toBe("short-break");
		expect(reloaded.getState().timeRemaining).toBe(5 * 60);
		await reloaded.startNext();
		expect(reloaded.getState().currentSession?.type).toBe("short-break");
		reloaded.cleanup();
	});
});
