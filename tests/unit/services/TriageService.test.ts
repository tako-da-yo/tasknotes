import { TriageService, TriageServiceDeps } from "../../../src/services/TriageService";
import { TaskFactory } from "../../helpers/mock-factories";
import type { TaskInfo } from "../../../src/types";

function makeDeps(
	tasks: TaskInfo[],
	inboxStatus = "inbox",
	archiveFolder?: string
): TriageServiceDeps & { store: Map<string, TaskInfo>; settings: any } {
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
		// Mirrors TaskService.toggleArchive: direction comes from the passed task, file is found by its path.
		archiveTask: async (task) => {
			if (!store.has(task.path)) throw new Error(`Cannot find task file: ${task.path}`);
			const archived = !task.archived;
			const path =
				archiveFolder && archived ? `${archiveFolder}/${task.path}` : archiveFolder && !archived ? task.path.replace(`${archiveFolder}/`, "") : task.path;
			const next = { ...store.get(task.path)!, archived, path };
			store.delete(task.path);
			store.set(path, next);
			return next;
		},
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
		await svc.revertAction(prev!);
		expect(deps.store.get("a.md")).toMatchObject({ status: "inbox", scheduled: undefined });
	});

	it("drop archives and revert unarchives, even when the caller holds the original task object", async () => {
		const original = TaskFactory.createTask({ path: "a.md", status: "inbox", archived: false });
		const deps = makeDeps([original]);
		const svc = new TriageService(deps);
		const prev = await svc.applyAction(original, { kind: "drop" });
		expect(deps.store.get("a.md")!.archived).toBe(true);
		await svc.revertAction(prev!);
		expect(deps.store.get("a.md")!.archived).toBe(false);
	});

	it("revert of drop targets the post-archive path when archiving moves the file", async () => {
		const original = TaskFactory.createTask({ path: "a.md", status: "inbox", archived: false });
		const deps = makeDeps([original], "inbox", "Archive");
		const svc = new TriageService(deps);
		const prev = await svc.applyAction(original, { kind: "drop" });
		expect(deps.store.has("a.md")).toBe(false);
		expect(deps.store.get("Archive/a.md")!.archived).toBe(true);
		await svc.revertAction(prev!);
		expect(deps.store.get("a.md")!.archived).toBe(false);
		expect(deps.store.has("Archive/a.md")).toBe(false);
	});

	it("does not re-archive when the drop revert holds an unarchived task", async () => {
		const deps = makeDeps([TaskFactory.createTask({ path: "a.md", status: "inbox", archived: false })]);
		const svc = new TriageService(deps);
		await svc.revertAction({ kind: "archived", task: deps.store.get("a.md")! });
		expect(deps.store.get("a.md")!.archived).toBe(false);
	});

	it("reverting updates for a task that disappeared is a no-op", async () => {
		const deps = makeDeps([TaskFactory.createTask({ path: "a.md", status: "inbox" })]);
		const svc = new TriageService(deps);
		const prev = await svc.applyAction(deps.store.get("a.md")!, { kind: "someday" });
		deps.store.delete("a.md");
		await expect(svc.revertAction(prev!)).resolves.toBeUndefined();
		expect(deps.store.size).toBe(0);
	});

	it("takes previous values from the current cached task, not a stale object", async () => {
		const stale = TaskFactory.createTask({ path: "a.md", status: "inbox", scheduled: undefined });
		const deps = makeDeps([stale]);
		deps.store.set("a.md", { ...stale, scheduled: "2026-10-20" });
		const svc = new TriageService(deps);
		const prev = await svc.applyAction(stale, { kind: "today" });
		expect(prev).toEqual({ kind: "updates", path: "a.md", previous: { status: "inbox", scheduled: "2026-10-20" } });
		await svc.revertAction(prev!);
		expect(deps.store.get("a.md")).toMatchObject({ status: "inbox", scheduled: "2026-10-20" });
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
	it("runFreshStartFor only touches the given tasks", async () => {
		const deps = makeDeps([
			TaskFactory.createTask({ path: "a.md", scheduled: "2026-10-01" }),
			TaskFactory.createTask({ path: "b.md", scheduled: "2026-10-01" }),
		]);
		const svc = new TriageService(deps);
		expect(await svc.runFreshStartFor([deps.store.get("a.md")!], false)).toBe(1);
		expect(deps.store.get("b.md")!.scheduled).toBe("2026-10-01");
	});
	it("a run that changes nothing returns 0 and leaves the previous snapshot alone", async () => {
		const deps = makeDeps([
			TaskFactory.createTask({ path: "a.md", status: "open", due: "2026-10-01", scheduled: undefined }),
		]);
		const previous = { runAt: "2026-10-01T09:00:00.000Z", entries: [{ path: "old.md", before: {}, after: {} }] };
		deps.settings.triageLastFreshStart = previous;
		const svc = new TriageService(deps);
		expect(await svc.runFreshStartFor([deps.store.get("a.md")!], false)).toBe(0);
		expect(deps.settings.triageLastFreshStart).toBe(previous);
		expect(deps.store.get("a.md")!.due).toBe("2026-10-01");
	});
});
