import { selectInboxTasks, updatesForAction, TriageSession } from "../../../src/core/triageSession";
import { TaskFactory } from "../../helpers/mock-factories";

const cfg = { today: "2026-10-15", defaultStatus: "open", somedayStatus: "someday", completedStatus: "done" };

describe("selectInboxTasks", () => {
	it("returns non-archived inbox tasks oldest first, including ones with dates", () => {
		const tasks = [
			TaskFactory.createTask({ path: "new.md", status: "inbox", dateCreated: "2026-10-14T00:00:00Z" }),
			TaskFactory.createTask({ path: "old.md", status: "inbox", dateCreated: "2026-10-01T00:00:00Z", scheduled: "2026-10-20" }),
			TaskFactory.createTask({ path: "arch.md", status: "inbox", archived: true }),
			TaskFactory.createTask({ path: "open.md", status: "open" }),
		];
		expect(selectInboxTasks(tasks, "inbox").map((t) => t.path)).toEqual(["old.md", "new.md"]);
	});
	it("returns nothing when the inbox status is empty", () => {
		expect(selectInboxTasks([TaskFactory.createTask({ status: "" })], "")).toEqual([]);
	});
});

describe("updatesForAction", () => {
	const task = TaskFactory.createTask({ status: "inbox", scheduled: "2026-10-01" });
	it("today overwrites scheduled and sets default status", () => {
		expect(updatesForAction(task, { kind: "today" }, cfg)).toEqual({ kind: "update", updates: { status: "open", scheduled: "2026-10-15" } });
	});
	it("schedule sets the chosen date", () => {
		expect(updatesForAction(task, { kind: "schedule", date: "2026-10-18" }, cfg)).toEqual({ kind: "update", updates: { status: "open", scheduled: "2026-10-18" } });
	});
	it("someday, done, drop and skip", () => {
		expect(updatesForAction(task, { kind: "someday" }, cfg)).toEqual({ kind: "update", updates: { status: "someday" } });
		expect(updatesForAction(task, { kind: "done" }, cfg)).toEqual({ kind: "update", updates: { status: "done" } });
		expect(updatesForAction(task, { kind: "drop" }, cfg)).toEqual({ kind: "archive" });
		expect(updatesForAction(task, { kind: "skip" }, cfg)).toEqual({ kind: "none" });
	});
});

describe("TriageSession", () => {
	it("advances, undoes and summarises", () => {
		const a = TaskFactory.createTask({ path: "a.md" });
		const b = TaskFactory.createTask({ path: "b.md" });
		const s = new TriageSession([a, b]);
		expect(s.position()).toEqual({ index: 0, total: 2 });
		s.record(a, { kind: "today" });
		expect(s.current()?.path).toBe("b.md");
		expect(s.undo()).toEqual({ task: a, action: { kind: "today" } });
		expect(s.current()?.path).toBe("a.md");
		s.record(a, { kind: "skip" });
		s.record(b, { kind: "drop" });
		expect(s.current()).toBeNull();
		expect(s.summary()).toEqual({ sorted: 1, skipped: 1 });
	});
	it("counts tasks sorted via Edit (null action) as sorted", () => {
		const a = TaskFactory.createTask({ path: "a.md" });
		const s = new TriageSession([a]);
		s.record(a, null);
		expect(s.summary()).toEqual({ sorted: 1, skipped: 0 });
		expect(s.undo()).toEqual({ task: a, action: null });
	});
	it("undo on an empty stack returns null", () => {
		expect(new TriageSession([]).undo()).toBeNull();
	});
});
