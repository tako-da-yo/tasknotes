import { ensureInboxStatuses, triageStatusOptions } from "../../../src/core/inboxStatuses";
import { DEFAULT_STATUSES } from "../../../src/settings/defaults";

describe("ensureInboxStatuses", () => {
	it("adds inbox before open and someday after it, both excluded from cycle", () => {
		const { statuses, inboxValue, somedayValue } = ensureInboxStatuses(DEFAULT_STATUSES, {
			inbox: "Inbox",
			someday: "Someday",
		});
		expect(inboxValue).toBe("inbox");
		expect(somedayValue).toBe("someday");
		const inbox = statuses.find((s) => s.value === "inbox")!;
		const open = statuses.find((s) => s.value === "open")!;
		expect(inbox.order).toBeLessThan(open.order);
		expect(inbox).toMatchObject({ isCompleted: false, excludeFromCycle: true, label: "Inbox" });
		expect(statuses.find((s) => s.value === "someday")).toMatchObject({
			isCompleted: false,
			excludeFromCycle: true,
			label: "Someday",
		});
	});

	it("reuses existing statuses with those values and does not duplicate", () => {
		const labels = { inbox: "Inbox", someday: "Someday" };
		const once = ensureInboxStatuses(DEFAULT_STATUSES, labels).statuses;
		const twice = ensureInboxStatuses(once, labels).statuses;
		expect(twice).toHaveLength(once.length);
	});

	it("keeps orders unique and sequential", () => {
		const { statuses } = ensureInboxStatuses(DEFAULT_STATUSES, {
			inbox: "Inbox",
			someday: "Someday",
		});
		expect(statuses.map((s) => s.order)).toEqual(statuses.map((_, i) => i));
	});

	it("does not mutate the input statuses", () => {
		const input = DEFAULT_STATUSES.map((s) => ({ ...s }));
		const snapshot = JSON.parse(JSON.stringify(input));
		ensureInboxStatuses(input, { inbox: "Inbox", someday: "Someday" });
		expect(input).toEqual(snapshot);
	});
});

describe("triageStatusOptions", () => {
	const labels = { none: "None", missing: (value: string) => `${value} (missing)` };

	it("lists None and the open statuses", () => {
		const options = triageStatusOptions(DEFAULT_STATUSES, "", labels);
		expect(options[0]).toEqual({ value: "", label: "None" });
		expect(options.map((o) => o.value)).toContain("open");
		expect(options.map((o) => o.value)).not.toContain("done");
	});

	it("shows a configured status that no longer exists as missing instead of None", () => {
		const options = triageStatusOptions(DEFAULT_STATUSES, "inbox", labels);
		expect(options).toContainEqual({ value: "inbox", label: "inbox (missing)" });
	});

	it("does not mark an existing configured status as missing", () => {
		const options = triageStatusOptions(DEFAULT_STATUSES, "open", labels);
		expect(options.filter((o) => o.value === "open")).toHaveLength(1);
		expect(options.some((o) => o.label.includes("missing"))).toBe(false);
	});
});
