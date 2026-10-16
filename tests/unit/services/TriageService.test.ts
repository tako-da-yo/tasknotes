import { TriageService, TriageServiceDeps } from "../../../src/services/TriageService";
import { TaskFactory } from "../../helpers/mock-factories";
import type { TaskInfo } from "../../../src/types";

function makeDeps(tasks: TaskInfo[], inboxStatus = "inbox"): TriageServiceDeps & { store: Map<string, TaskInfo>; settings: any } {
	const store = new Map(tasks.map((t) => [t.path, t]));
	const settings: any = { triage: { inboxStatus, somedayStatus: "someday", captureToInbox: true }, triageLastFreshStart: null, defaultTaskStatus: "open" };
	return {
		store,
		settings,
		getTasks: () => [...store.values()],
		updateTask: async (task, updates) => {
			const next = { ...store.get(task.path)!, ...updates };
			store.set(task.path, next);
			return next;
		},
		archiveTask: async (task) => store.set(task.path, { ...store.get(task.path)!, archived: !store.get(task.path)!.archived }),
		isCompleted: (s) => s === "done",
		firstCompletedStatus: () => "done",
		statusExists: (v) => ["inbox", "someday", "open", "done"].includes(v),
		getSettings: () => settings,
		saveSettings: async () => undefined,
		today: () => "2026-10-15",
	};
}

describe("TriageService", () => {
	it("is not ready when the inbox status no longer exists", () => {
		const svc = new TriageService(makeDeps([], "deleted-status"));
		expect(svc.isInboxReady()).toBe(false);
		expect(svc.getInboxTasks()).toEqual([]);
	});

	it("applies and reverts a triage action", async () => {
		const deps = makeDeps([TaskFactory.createTask({ path: "a.md", status: "inbox" })]);
		const svc = new TriageService(deps);
		const prev = await svc.applyAction(deps.store.get("a.md")!, { kind: "today" });
		expect(deps.store.get("a.md")).toMatchObject({ status: "open", scheduled: "2026-10-15" });
		await svc.revertAction(deps.store.get("a.md")!, prev!);
		expect(deps.store.get("a.md")).toMatchObject({ status: "inbox", scheduled: undefined });
	});

	it("drop archives and revert unarchives", async () => {
		const deps = makeDeps([TaskFactory.createTask({ path: "a.md", status: "inbox" })]);
		const svc = new TriageService(deps);
		const prev = await svc.applyAction(deps.store.get("a.md")!, { kind: "drop" });
		expect(deps.store.get("a.md")!.archived).toBe(true);
		await svc.revertAction(deps.store.get("a.md")!, prev!);
		expect(deps.store.get("a.md")!.archived).toBe(false);
	});

	it("fresh start writes, snapshots and undoes", async () => {
		const deps = makeDeps([TaskFactory.createTask({ path: "a.md", status: "open", scheduled: "2026-10-01" })]);
		const svc = new TriageService(deps);
		expect(await svc.runFreshStart(false)).toBe(1);
		expect(deps.store.get("a.md")).toMatchObject({ status: "inbox", scheduled: undefined });
		expect(svc.hasFreshStartSnapshot()).toBe(true);
		expect(await svc.undoFreshStart()).toEqual({ restored: 1, skipped: 0 });
		expect(deps.store.get("a.md")).toMatchObject({ status: "open", scheduled: "2026-10-01" });
		expect(svc.hasFreshStartSnapshot()).toBe(false);
	});
});
