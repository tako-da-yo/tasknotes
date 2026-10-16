import { collectDayItems, DayPlanInput } from "../../../src/core/dayPlan";
import { TaskFactory } from "../../helpers/mock-factories";
import type { ICSEvent } from "../../../src/types";

const ev = (o: Partial<ICSEvent>): ICSEvent => ({ id: "e", subscriptionId: "ics1", title: "E", start: "2026-10-15T10:00:00Z", allDay: false, ...o });
const input = (o: Partial<DayPlanInput>): DayPlanInput => ({
	date: "2026-10-15", now: Date.parse("2026-10-15T12:00:00Z"), tasks: [], events: [], timeblocks: [],
	isCompleted: (s) => s === "done", isRecurringOnDate: () => false, externalContextFor: () => undefined,
	resolveAttachment: (l) => l.replace(/^\[\[|\]\]$/g, "") + ".md", ...o,
});

describe("collectDayItems: tasks", () => {
	it("includes scheduled (with or without time) and due-without-scheduled", () => {
		const items = collectDayItems(input({ tasks: [
			TaskFactory.createTask({ path: "s.md", scheduled: "2026-10-15T14:00" }),
			TaskFactory.createTask({ path: "d.md", due: "2026-10-15" }),
			TaskFactory.createTask({ path: "both.md", scheduled: "2026-10-16", due: "2026-10-15" }),
			TaskFactory.createTask({ path: "overdue.md", scheduled: "2026-10-01" }),
		] }));
		expect(items.map((i) => i.ref).sort()).toEqual(["d.md", "s.md"]);
	});
	it("includes tasks completed on the date as done, excludes archived", () => {
		const items = collectDayItems(input({ tasks: [
			TaskFactory.createTask({ path: "c.md", status: "done", completedDate: "2026-10-15", scheduled: "2026-10-10" }),
			TaskFactory.createTask({ path: "a.md", scheduled: "2026-10-15", archived: true }),
		] }));
		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({ ref: "c.md", done: true });
	});
	it("handles recurring instances, skipped and completed", () => {
		const r = (path: string, extra: object) => TaskFactory.createTask({ path, recurrence: "FREQ=DAILY", ...extra });
		const items = collectDayItems(input({
			isRecurringOnDate: () => true,
			tasks: [r("open.md", {}), r("skip.md", { skipped_instances: ["2026-10-15"] }), r("done.md", { complete_instances: ["2026-10-15"] })],
		}));
		expect(items.map((i) => [i.ref, i.done])).toEqual([["open.md", false], ["done.md", true]]);
	});
	it("counts only the date's time entries as tracked for a recurring instance", () => {
		const task = TaskFactory.createTask({
			path: "r.md", recurrence: "FREQ=DAILY", totalTrackedTime: 300,
			timeEntries: [
				{ startTime: "2026-10-14T09:00:00Z", endTime: "2026-10-14T14:00:00Z" },
				{ startTime: "2026-10-15T09:00:00Z", endTime: "2026-10-15T09:20:00Z" },
				{ startTime: "2026-10-15T10:00:00Z", duration: 5 },
				{ startTime: "2026-10-15T11:50:00Z" }, // running until now (12:00)
			],
		});
		const [item] = collectDayItems(input({ isRecurringOnDate: () => true, tasks: [task] }));
		expect(item.trackedMinutes).toBe(20 + 5 + 10);
	});
	it("uses totalTrackedTime for a non-recurring task and 0 for other items", () => {
		const items = collectDayItems(input({
			tasks: [TaskFactory.createTask({ path: "n.md", scheduled: "2026-10-15", totalTrackedTime: 42,
				timeEntries: [{ startTime: "2026-10-01T09:00:00Z", endTime: "2026-10-01T09:42:00Z" }] })],
			events: [ev({})],
			timeblocks: [{ id: "tb", title: "B", startTime: "09:00", endTime: "10:00" }],
		}));
		expect(items.map((i) => [i.kind, i.trackedMinutes])).toEqual([["task", 42], ["event", 0], ["timeblock", 0]]);
	});
	it("carries the task, event and timeblock title", () => {
		const items = collectDayItems(input({
			tasks: [TaskFactory.createTask({ path: "n.md", title: "Write report", scheduled: "2026-10-15" })],
			events: [ev({ title: "Standup" })],
			timeblocks: [{ id: "tb", title: "Focus", startTime: "09:00", endTime: "10:00" }],
		}));
		expect(items.map((i) => i.title)).toEqual(["Write report", "Standup", "Focus"]);
	});
});

describe("collectDayItems: events", () => {
	it("clips a cross-midnight event to the day", () => {
		const [item] = collectDayItems(input({ events: [ev({ start: "2026-10-15T22:00:00Z", end: "2026-10-16T02:00:00Z" })] }));
		expect((item.interval!.end - item.interval!.start) / 60000).toBe(120);
	});
	it("treats all-day end as exclusive", () => {
		const e = ev({ allDay: true, start: "2026-10-14", end: "2026-10-15" });
		expect(collectDayItems(input({ events: [e] }))).toHaveLength(0);
		expect(collectDayItems(input({ date: "2026-10-14", events: [e] }))).toHaveLength(1);
	});
	it("keeps an all-day event whose end equals its start on its start day", () => {
		const e = ev({ allDay: true, start: "2026-10-15", end: "2026-10-15" });
		expect(collectDayItems(input({ events: [e] }))).toEqual([expect.objectContaining({ kind: "event", allDay: true })]);
		expect(collectDayItems(input({ date: "2026-10-16", events: [e] }))).toHaveLength(0);
	});
	it("keeps a timed event with no end as zero-length", () => {
		const [item] = collectDayItems(input({ events: [ev({ start: "2026-10-15T10:00:00Z" })] }));
		expect(item.interval).toEqual({ start: Date.parse("2026-10-15T10:00:00Z"), end: Date.parse("2026-10-15T10:00:00Z") });
	});
	it("includes the middle day of a multi-day all-day event", () => {
		const e = ev({ allDay: true, start: "2026-10-14", end: "2026-10-17" });
		expect(collectDayItems(input({ events: [e] }))).toEqual([expect.objectContaining({ kind: "event", allDay: true })]);
	});
	it("marks past events done and carries source and external context", () => {
		const [item] = collectDayItems(input({ events: [ev({ end: "2026-10-15T11:00:00Z" })], externalContextFor: () => "meetings" }));
		expect(item).toMatchObject({ done: true, sourceId: "ics1", contexts: ["meetings"] });
	});
	it("skips declined invitations and keeps the response status of others", () => {
		const items = collectDayItems(input({ events: [
			ev({ id: "no", end: "2026-10-15T11:00:00Z", responseStatus: "declined" }),
			ev({ id: "maybe", end: "2026-10-15T11:00:00Z", responseStatus: "tentative" }),
		] }));
		expect(items.map((i) => [i.ref, i.responseStatus])).toEqual([["maybe", "tentative"]]);
	});
});

describe("collectDayItems: timeblocks", () => {
	it("builds intervals and resolves attachments", () => {
		const [item] = collectDayItems(input({ timeblocks: [{ id: "tb1", title: "Focus", startTime: "13:00", endTime: "15:00", context: "deep", attachments: ["[[Task A]]"] }] }));
		expect(item).toMatchObject({ kind: "timeblock", contexts: ["deep"], attachments: ["Task A.md"], done: false });
		expect((item.interval!.end - item.interval!.start) / 60000).toBe(120);
	});
	it("treats a 00:00 end as midnight at the end of the day", () => {
		const tb = { id: "late", title: "Late", startTime: "22:00", endTime: "00:00" };
		const [item] = collectDayItems(input({ now: Date.parse("2026-10-15T23:00:00Z"), timeblocks: [tb] }));
		expect((item.interval!.end - item.interval!.start) / 60000).toBe(120);
		expect(item.done).toBe(false);
		const [after] = collectDayItems(input({ now: Date.parse("2026-10-16T00:00:00Z"), timeblocks: [tb] }));
		expect(after.done).toBe(true);
	});
});
