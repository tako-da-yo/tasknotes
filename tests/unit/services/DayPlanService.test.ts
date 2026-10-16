import { DayPlanService, DayPlanSources } from "../../../src/services/DayPlanService";
import { TaskFactory } from "../../helpers/mock-factories";

const sources = (o: Partial<DayPlanSources> = {}): DayPlanSources => ({
	getTasks: () => [TaskFactory.createTask({ path: "a.md", scheduled: "2026-10-15" })],
	getEvents: () => [],
	getTimeblocks: async () => [],
	isCompleted: () => false,
	isRecurringOnDate: () => false,
	externalContextFor: () => undefined,
	resolveAttachment: () => null,
	now: () => Date.parse("2026-10-15T08:00:00Z"),
	...o,
});

describe("DayPlanService", () => {
	it("collects a range keyed by date and caches until invalidated", async () => {
		const getTimeblocks = jest.fn(async () => []);
		const svc = new DayPlanService(sources({ getTimeblocks }));
		const range = await svc.getDayItemsInRange("2026-10-14", "2026-10-16");
		expect([...range.keys()]).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
		expect(range.get("2026-10-15")!.map((i) => i.ref)).toEqual(["a.md"]);
		await svc.getDayItems("2026-10-15");
		expect(getTimeblocks).toHaveBeenCalledTimes(3);
		const listener = jest.fn();
		svc.onChange(listener);
		svc.invalidate();
		await svc.getDayItems("2026-10-15");
		expect(getTimeblocks).toHaveBeenCalledTimes(4);
		expect(listener).toHaveBeenCalled();
	});

	it("reads tasks and events once per range call", async () => {
		const getTasks = jest.fn(() => []);
		const getEvents = jest.fn(() => []);
		const svc = new DayPlanService(sources({ getTasks, getEvents }));
		await svc.getDayItemsInRange("2026-10-01", "2026-10-07");
		expect(getTasks).toHaveBeenCalledTimes(1);
		expect(getEvents).toHaveBeenCalledTimes(1);
	});

	it("crosses month boundaries and returns an empty map for a reversed range", async () => {
		const svc = new DayPlanService(sources());
		const range = await svc.getDayItemsInRange("2026-10-30", "2026-11-02");
		expect([...range.keys()]).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
		expect((await svc.getDayItemsInRange("2026-10-16", "2026-10-15")).size).toBe(0);
	});

	it("shares one computation for concurrent requests and stops notifying after unsubscribe", async () => {
		const getTimeblocks = jest.fn(async () => []);
		const svc = new DayPlanService(sources({ getTimeblocks }));
		await Promise.all([svc.getDayItems("2026-10-15"), svc.getDayItems("2026-10-15")]);
		expect(getTimeblocks).toHaveBeenCalledTimes(1);
		const listener = jest.fn();
		const off = svc.onChange(listener);
		off();
		svc.invalidate();
		await Promise.resolve();
		expect(listener).not.toHaveBeenCalled();
	});

	it("coalesces invalidations in one tick into a single notification", async () => {
		const getTimeblocks = jest.fn(async () => []);
		const svc = new DayPlanService(sources({ getTimeblocks }));
		const listener = jest.fn();
		svc.onChange(listener);
		await svc.getDayItems("2026-10-15");
		svc.invalidate();
		svc.invalidate();
		svc.invalidate();
		expect(listener).not.toHaveBeenCalled();
		// The cache is cleared synchronously even though notification is deferred.
		await svc.getDayItems("2026-10-15");
		expect(getTimeblocks).toHaveBeenCalledTimes(2);
		await Promise.resolve();
		expect(listener).toHaveBeenCalledTimes(1);
		svc.invalidate();
		await Promise.resolve();
		expect(listener).toHaveBeenCalledTimes(2);
	});

	it("does not cache a failed timeblock read", async () => {
		const getTimeblocks = jest
			.fn<Promise<never[]>, [string]>()
			.mockRejectedValueOnce(new Error("boom"))
			.mockResolvedValue([]);
		const svc = new DayPlanService(sources({ getTimeblocks }));
		await expect(svc.getDayItems("2026-10-15")).rejects.toThrow("boom");
		await expect(svc.getDayItems("2026-10-15")).resolves.toHaveLength(1);
	});

	it("does not keep a result computed before an invalidation", async () => {
		let release!: () => void;
		const gate = new Promise<void>((r) => (release = r));
		let tasks = [TaskFactory.createTask({ path: "old.md", scheduled: "2026-10-15" })];
		const svc = new DayPlanService(
			sources({
				getTasks: () => tasks,
				getTimeblocks: async () => {
					await gate;
					return [];
				},
			})
		);
		const pending = svc.getDayItems("2026-10-15");
		tasks = [TaskFactory.createTask({ path: "new.md", scheduled: "2026-10-15" })];
		svc.invalidate();
		release();
		await pending;
		expect((await svc.getDayItems("2026-10-15")).map((i) => i.ref)).toEqual(["new.md"]);
	});
});
