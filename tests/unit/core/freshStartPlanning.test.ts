import {
	planFreshStart,
	planFreshStartUndo,
	previewFreshStart,
} from "../../../src/core/freshStartPlanning";
import { TaskFactory } from "../../helpers/mock-factories";

const isCompleted = (s: string) => s === "done";
const today = "2026-10-15";
const base = { today, clearDue: false, inboxStatus: "inbox", isCompleted };

describe("planFreshStart", () => {
	it("clears past scheduled dates and moves the task to the inbox", () => {
		const t = TaskFactory.createTask({ path: "a.md", scheduled: "2026-10-10", status: "open" });
		expect(planFreshStart([t], base)).toEqual([
			{
				path: "a.md",
				before: { scheduled: "2026-10-10", due: undefined, status: "open" },
				after: { scheduled: undefined, due: undefined, status: "inbox" },
			},
		]);
	});
	it("leaves tasks that are only overdue by due date untouched when clearDue is off", () => {
		const t = TaskFactory.createTask({ path: "a.md", due: "2026-10-10" });
		expect(planFreshStart([t], base)).toEqual([]);
	});
	it("clears past due dates when clearDue is on", () => {
		const t = TaskFactory.createTask({ path: "a.md", due: "2026-10-10" });
		expect(planFreshStart([t], { ...base, clearDue: true })[0].after.due).toBeUndefined();
	});
	it("treats a due date with a time by its date part", () => {
		const t = TaskFactory.createTask({ path: "a.md", due: "2026-10-14T15:00" });
		expect(planFreshStart([t], { ...base, clearDue: true })).toHaveLength(1);
	});
	it("does not touch future or today dates", () => {
		const t = TaskFactory.createTask({ path: "a.md", scheduled: today, due: "2026-10-20" });
		expect(planFreshStart([t], { ...base, clearDue: true })).toEqual([]);
	});
	it("skips recurring, completed and archived tasks", () => {
		const tasks = [
			TaskFactory.createTask({
				path: "r.md",
				scheduled: "2026-10-01",
				recurrence: "FREQ=DAILY",
			}),
			TaskFactory.createTask({ path: "d.md", scheduled: "2026-10-01", status: "done" }),
			TaskFactory.createTask({ path: "x.md", scheduled: "2026-10-01", archived: true }),
		];
		expect(planFreshStart(tasks, base)).toEqual([]);
	});
	it("keeps status when no inbox is configured", () => {
		const t = TaskFactory.createTask({ path: "a.md", scheduled: "2026-10-10", status: "open" });
		expect(planFreshStart([t], { ...base, inboxStatus: "" })[0].after.status).toBe("open");
	});
});

describe("previewFreshStart", () => {
	it("counts scheduled and due overdue tasks separately", () => {
		const tasks = [
			TaskFactory.createTask({ path: "a.md", scheduled: "2026-10-10" }),
			TaskFactory.createTask({ path: "b.md", due: "2026-10-10" }),
			TaskFactory.createTask({ path: "c.md", scheduled: "2026-10-10", due: "2026-10-11" }),
		];
		expect(previewFreshStart(tasks, today, isCompleted)).toEqual({
			scheduledCount: 2,
			dueCount: 2,
			total: 3,
		});
	});
});

describe("planFreshStartUndo", () => {
	const snapshot = {
		runAt: "2026-10-15T09:00:00Z",
		entries: [
			{
				path: "a.md",
				before: { scheduled: "2026-10-10", status: "open" },
				after: { scheduled: undefined, status: "inbox" },
			},
			{
				path: "b.md",
				before: { scheduled: "2026-10-09", status: "open" },
				after: { scheduled: undefined, status: "inbox" },
			},
			{
				path: "gone.md",
				before: { scheduled: "2026-10-09", status: "open" },
				after: { scheduled: undefined, status: "inbox" },
			},
		],
	};
	it("restores unchanged fields, skips edited fields and missing tasks", () => {
		const current = new Map([
			["a.md", TaskFactory.createTask({ path: "a.md", status: "inbox" })],
			[
				"b.md",
				TaskFactory.createTask({ path: "b.md", status: "inbox", scheduled: "2026-10-16" }),
			],
		]);
		const { restores, skipped } = planFreshStartUndo(snapshot, current);
		expect(restores).toEqual([
			{ path: "a.md", updates: { scheduled: "2026-10-10", status: "open" } },
			{ path: "b.md", updates: { status: "open" } },
		]);
		expect(skipped).toBe(1);
	});
	it("counts a task whose changed fields were all edited since as skipped", () => {
		const current = new Map([
			["a.md", TaskFactory.createTask({ path: "a.md", status: "open" })],
			[
				"b.md",
				TaskFactory.createTask({
					path: "b.md",
					status: "waiting",
					scheduled: "2026-10-16",
				}),
			],
		]);
		const { restores, skipped } = planFreshStartUndo(snapshot, current);
		expect(restores).toEqual([{ path: "a.md", updates: { scheduled: "2026-10-10" } }]);
		expect(skipped).toBe(2);
	});
	it("restores a cleared due date", () => {
		const dueSnapshot = {
			runAt: "2026-10-15T09:00:00Z",
			entries: [
				{
					path: "d.md",
					before: { scheduled: "2026-10-10", due: "2026-10-12T15:00", status: "open" },
					after: { scheduled: undefined, due: undefined, status: "open" },
				},
			],
		};
		const current = new Map([
			["d.md", TaskFactory.createTask({ path: "d.md", status: "open" })],
		]);
		expect(planFreshStartUndo(dueSnapshot, current)).toEqual({
			restores: [
				{ path: "d.md", updates: { scheduled: "2026-10-10", due: "2026-10-12T15:00" } },
			],
			skipped: 0,
		});
	});
});
