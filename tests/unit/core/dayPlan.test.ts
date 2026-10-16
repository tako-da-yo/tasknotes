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
});
