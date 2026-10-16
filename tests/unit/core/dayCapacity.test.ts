import { computeDayCapacity, CapacityOptions, inboxMoveBlock } from "../../../src/core/dayCapacity";
import type { DayItem } from "../../../src/core/dayPlan";
import { TaskFactory } from "../../helpers/mock-factories";

const nineToFive = { start: "09:00", end: "17:00" };
const planning = { workHours: [null, nineToFive, nineToFive, nineToFive, nineToFive, nineToFive, null],
	nonBusyCalendars: [] as string[], allDayEventsBusy: false, defaultEstimate: null, showInStatusBar: true, warnOnOverbook: true };
const t = (iso: string) => Date.parse(iso);
const opts = (o: Partial<CapacityOptions> = {}): CapacityOptions => ({
	date: "2026-10-15", // Thursday
	now: t("2026-10-14T12:00:00Z"), // yesterday, so the full window counts
	planning,
	sizeTask: (task) => (task.timeEstimate ? { minutes: task.timeEstimate, calibrated: false } : null),
	...o,
});
const taskItem = (est: number | undefined, tracked = 0, done = false): DayItem => ({
	kind: "task", ref: `t${est}-${tracked}`, date: "2026-10-15", allDay: true, contexts: [], done, trackedMinutes: tracked, trackedOnDateMinutes: 0,
	task: TaskFactory.createTask({ path: `t${est}-${tracked}`, timeEstimate: est, totalTrackedTime: tracked }),
});
const event = (start: string, end: string, extra: Partial<DayItem> = {}): DayItem => ({
	kind: "event", ref: start, date: "2026-10-15", allDay: false, contexts: [], done: false, trackedMinutes: 0, trackedOnDateMinutes: 0, sourceId: "ics1",
	interval: { start: t(start), end: t(end) }, ...extra,
});

describe("computeDayCapacity", () => {
	it("subtracts merged busy events from the work window", () => {
		const c = computeDayCapacity([
			event("2026-10-15T10:00:00Z", "2026-10-15T11:00:00Z"),
			event("2026-10-15T10:30:00Z", "2026-10-15T12:00:00Z"),
			event("2026-10-15T18:00:00Z", "2026-10-15T19:00:00Z"), // outside window
		], opts());
		expect(c.availableMinutes).toBe(480 - 120);
	});
	it("ignores all-day events unless allDayEventsBusy", () => {
		const allDay: DayItem = { ...event("2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z"), allDay: true, interval: undefined };
		expect(computeDayCapacity([allDay], opts()).availableMinutes).toBe(480);
		expect(computeDayCapacity([allDay], opts({ planning: { ...planning, allDayEventsBusy: true } })).availableMinutes).toBe(0);
	});
	it("counts unanswered and tentative invitations as busy", () => {
		const c = computeDayCapacity([
			event("2026-10-15T10:00:00Z", "2026-10-15T11:00:00Z", { responseStatus: "needsAction" }),
			event("2026-10-15T13:00:00Z", "2026-10-15T14:00:00Z", { responseStatus: "tentative" }),
		], opts());
		expect(c.availableMinutes).toBe(480 - 120);
	});
	it("skips events from excluded calendars and counts all others, including new ones", () => {
		const excluded = opts({ planning: { ...planning, nonBusyCalendars: ["ics1"] } });
		expect(computeDayCapacity([event("2026-10-15T10:00:00Z", "2026-10-15T11:00:00Z")], excluded).availableMinutes).toBe(480);
		const other = opts({ planning: { ...planning, nonBusyCalendars: ["other"] } });
		expect(computeDayCapacity([event("2026-10-15T10:00:00Z", "2026-10-15T11:00:00Z")], other).availableMinutes).toBe(420);
	});
	it("ignores timeblocks for availability", () => {
		const tb = { ...event("2026-10-15T10:00:00Z", "2026-10-15T11:00:00Z"), kind: "timeblock" as const };
		expect(computeDayCapacity([tb], opts()).availableMinutes).toBe(480);
	});
	it("starts today's window at now and floors at zero after work", () => {
		expect(computeDayCapacity([], opts({ now: t("2026-10-15T15:00:00Z") })).availableMinutes).toBe(120);
		const late = computeDayCapacity([taskItem(60)], opts({ now: t("2026-10-15T20:00:00Z") }));
		expect(late.availableMinutes).toBe(0);
		expect(late.plannedMinutes).toBe(60);
		expect(late.overByMinutes).toBe(60);
	});
	it("returns zero available on a day off", () => {
		const c = computeDayCapacity([], opts({ date: "2026-10-17" }));
		expect(c).toMatchObject({ availableMinutes: 0, hasWorkHours: false });
	});
	it("plans remaining estimate, never negative, skips done tasks, counts unestimated", () => {
		const c = computeDayCapacity([taskItem(60, 20), taskItem(30, 90), taskItem(45, 0, true), taskItem(undefined)], opts());
		expect(c.plannedMinutes).toBe(40);
		expect(c.unestimatedCount).toBe(1);
	});
	it("subtracts only the instance's tracked time for a recurring task", () => {
		const recurring: DayItem = {
			...taskItem(30),
			task: TaskFactory.createTask({ path: "r", recurrence: "FREQ=DAILY", timeEstimate: 30, totalTrackedTime: 300 }),
			trackedMinutes: 0, trackedOnDateMinutes: 0,
		};
		expect(computeDayCapacity([recurring], opts()).plannedMinutes).toBe(30);
	});
	it("uses defaultEstimate for unestimated tasks", () => {
		const c = computeDayCapacity([taskItem(undefined)], opts({ planning: { ...planning, defaultEstimate: 25 } }));
		expect(c).toMatchObject({ plannedMinutes: 25, unestimatedCount: 0 });
	});
	it("treats a work end of 00:00 as the end of the day", () => {
		const evening = (start: string) => ({ ...planning, workHours: planning.workHours.map((h, i) => (i === 4 ? { start, end: "00:00" } : h)) });
		expect(computeDayCapacity([], opts({ planning: evening("18:00") })).availableMinutes).toBe(360);
		expect(computeDayCapacity([], opts({ planning: evening("00:00") })).availableMinutes).toBe(0);
	});
});

describe("inboxMoveBlock", () => {
	const day = "2026-10-15";
	it("allows a task scheduled on the day", () => {
		expect(inboxMoveBlock(TaskFactory.createTask({ scheduled: day, due: undefined }), day)).toBeNull();
		expect(inboxMoveBlock(TaskFactory.createTask({ scheduled: `${day}T09:00`, due: "2026-10-20" }), day)).toBeNull();
	});
	it("blocks a task whose due date keeps it on the day", () => {
		expect(inboxMoveBlock(TaskFactory.createTask({ scheduled: undefined, due: day }), day)).toBe("due");
		expect(inboxMoveBlock(TaskFactory.createTask({ scheduled: day, due: `${day}T17:00` }), day)).toBe("due");
	});
	it("blocks recurring tasks", () => {
		expect(inboxMoveBlock(TaskFactory.createTask({ scheduled: day, recurrence: "RRULE:FREQ=DAILY" }), day)).toBe("recurring");
	});
});
