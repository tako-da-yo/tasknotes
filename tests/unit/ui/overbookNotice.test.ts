import { OverbookNotifier, datesTouched } from "../../../src/ui/overbookNotice";

const cap = (over: number, hasWorkHours = true) => ({
	date: "2026-10-16",
	availableMinutes: 60,
	plannedMinutes: 60 + over,
	overByMinutes: over,
	unestimatedCount: 0,
	tasks: [],
	hasWorkHours,
});

describe("OverbookNotifier", () => {
	let now = 0;
	const notify = jest.fn();
	const make = (over: number, enabled = true) =>
		new OverbookNotifier({
			getCapacity: async () => cap(over),
			enabled: () => enabled,
			notify,
			now: () => now,
			formatDay: () => "Friday",
			t: (_k, p) => `${p!.day} ${p!.over}`,
			fmt: (m) => `${m}m`,
			today: () => "2026-10-15",
		});
	beforeEach(() => {
		notify.mockClear();
		now = 0;
	});

	it("notifies when over and rate-limits per date", async () => {
		const n = make(30);
		await n.check(["2026-10-16"]);
		await n.check(["2026-10-16"]);
		expect(notify).toHaveBeenCalledTimes(1);
		expect(notify).toHaveBeenCalledWith("Friday 30m");
		now = 5 * 60_000 + 1;
		await n.check(["2026-10-16"]);
		expect(notify).toHaveBeenCalledTimes(2);
	});
	it("stays quiet when not over or disabled", async () => {
		await make(0).check(["2026-10-16"]);
		await make(30, false).check(["2026-10-16"]);
		expect(notify).not.toHaveBeenCalled();
	});
	it("stays quiet on days without work hours", async () => {
		const n = new OverbookNotifier({
			getCapacity: async () => cap(30, false),
			enabled: () => true,
			notify,
			now: () => now,
			formatDay: () => "Friday",
			t: (_k, p) => `${p!.day} ${p!.over}`,
			fmt: (m) => `${m}m`,
			today: () => "2026-10-15",
		});
		await n.check(["2026-10-16"]);
		expect(notify).not.toHaveBeenCalled();
	});
	it("skips past days without computing their capacity", async () => {
		const getCapacity = jest.fn(async () => cap(30));
		const n = new OverbookNotifier({
			getCapacity,
			enabled: () => true,
			notify,
			now: () => now,
			formatDay: () => "Friday",
			t: (_k, p) => `${p!.day} ${p!.over}`,
			fmt: (m) => `${m}m`,
			today: () => "2026-10-15",
		});
		await n.check(["2026-10-14"]);
		expect(getCapacity).not.toHaveBeenCalled();
		expect(notify).not.toHaveBeenCalled();
		await n.check(["2026-10-15"]);
		expect(notify).toHaveBeenCalledTimes(1);
	});
	it("shows one notice when two checks for the same date overlap", async () => {
		const n = make(30);
		await Promise.all([n.check(["2026-10-16"]), n.check(["2026-10-16"])]);
		expect(notify).toHaveBeenCalledTimes(1);
	});
	it("does not rate-limit a date that turned out not to be over", async () => {
		let over = 0;
		const n = new OverbookNotifier({
			getCapacity: async () => cap(over),
			enabled: () => true,
			notify,
			now: () => now,
			formatDay: () => "Friday",
			t: (_k, p) => `${p!.day} ${p!.over}`,
			fmt: (m) => `${m}m`,
			today: () => "2026-10-15",
		});
		await n.check(["2026-10-16"]);
		over = 30;
		await n.check(["2026-10-16"]);
		expect(notify).toHaveBeenCalledTimes(1);
	});
	it("does not reject when capacity cannot be computed", async () => {
		const n = new OverbookNotifier({
			getCapacity: async () => {
				throw new Error("boom");
			},
			enabled: () => true,
			notify,
			now: () => now,
			formatDay: () => "Friday",
			t: (_k, p) => `${p!.day} ${p!.over}`,
			fmt: (m) => `${m}m`,
			today: () => "2026-10-15",
		});
		await expect(n.check(["2026-10-16"])).resolves.toBeUndefined();
		expect(notify).not.toHaveBeenCalled();
	});
});

describe("datesTouched", () => {
	it("returns changed scheduled dates, or due dates when unscheduled", () => {
		expect(
			datesTouched({ scheduled: "2026-10-15" }, { scheduled: "2026-10-16T10:00" })
		).toEqual(["2026-10-16"]);
		expect(datesTouched({}, { due: "2026-10-17" })).toEqual(["2026-10-17"]);
		expect(datesTouched({ scheduled: "2026-10-15" }, { scheduled: "2026-10-15" })).toEqual([]);
	});
});
