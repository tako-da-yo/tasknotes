import { parse } from "yaml";
import { generateBasesFileTemplate } from "../../../src/templates/defaultBasesFiles";

const fieldMapping = {
	status: "status",
	priority: "priority",
	due: "due",
	scheduled: "scheduled",
	projects: "projects",
	contexts: "contexts",
	recurrence: "recurrence",
	recurrenceParent: "recurrence_parent",
	occurrenceDate: "occurrence_date",
	completeInstances: "complete_instances",
	blockedBy: "blockedBy",
	sortOrder: "tasknotes_manual_order",
	timeEstimate: "timeEstimate",
	timeEntries: "timeEntries",
	pomodoros: "pomodoros",
	archiveTag: "archived",
};

const createMockPlugin = (mapping: Record<string, string> = fieldMapping) => ({
	settings: {
		taskTag: "task",
		taskIdentificationMethod: "tag",
		customPriorities: [{ value: "normal", label: "Normal", weight: 1 }],
		customStatuses: [
			{ value: "inbox", label: "Inbox", isCompleted: false },
			{ value: "open", label: "Open", isCompleted: false },
			{ value: "someday", label: "Someday", isCompleted: false },
			{ value: "done", label: "Done", isCompleted: true },
		],
		defaultVisibleProperties: ["status", "priority", "due"],
		calendarViewSettings: { firstDay: 1 },
		userFields: [],
		fieldMapping: mapping,
		triage: { inboxStatus: "", somedayStatus: "", captureToInbox: true },
	},
	fieldMapper: {
		toUserField: jest.fn((key: string) => mapping[key] ?? key),
		getMapping: jest.fn(() => mapping),
	},
});

describe("default Bases Inbox and Someday views", () => {
	it("includes Inbox and Someday views only when triage is configured", () => {
		const plugin = createMockPlugin();
		expect(generateBasesFileTemplate("open-tasks-view", plugin as any)).not.toContain(
			'name: "Inbox"'
		);
		plugin.settings.triage = { inboxStatus: "inbox", somedayStatus: "someday", captureToInbox: true };
		const yaml = generateBasesFileTemplate("open-tasks-view", plugin as any);
		expect(yaml).toContain('name: "Inbox"');
		expect(yaml).toContain('name: "Someday"');
		expect(yaml).toMatch(/status == "inbox"/);
	});

	it("produces valid YAML with status filters and creation/modified sorts", () => {
		const plugin = createMockPlugin();
		plugin.settings.triage = { inboxStatus: "inbox", somedayStatus: "someday", captureToInbox: true };
		const base = parse(generateBasesFileTemplate("open-tasks-view", plugin as any));
		const inbox = base.views.find((v: any) => v.name === "Inbox");
		const someday = base.views.find((v: any) => v.name === "Someday");
		expect(inbox.filters.and).toEqual(['status == "inbox"', 'file.hasTag("archived") != true']);
		expect(inbox.sort).toEqual([{ column: "file.ctime", direction: "ASC" }]);
		expect(someday.filters.and).toEqual([
			'status == "someday"',
			'file.hasTag("archived") != true',
		]);
		expect(someday.sort).toEqual([{ column: "file.mtime", direction: "ASC" }]);
	});

	it("adds only the Inbox view when no someday status is set", () => {
		const plugin = createMockPlugin();
		plugin.settings.triage = { inboxStatus: "inbox", somedayStatus: "", captureToInbox: true };
		const base = parse(generateBasesFileTemplate("open-tasks-view", plugin as any));
		const names = base.views.map((v: any) => v.name);
		expect(names).toContain("Inbox");
		expect(names).not.toContain("Someday");
	});

	it("round-trips punctuation in the inbox status value", () => {
		const plugin = createMockPlugin();
		plugin.settings.triage = { inboxStatus: 'in "box"', somedayStatus: "", captureToInbox: true };
		const base = parse(generateBasesFileTemplate("open-tasks-view", plugin as any));
		const inbox = base.views.find((v: any) => v.name === "Inbox");
		expect(inbox.filters.and[0]).toBe(`status == ${JSON.stringify('in "box"')}`);
	});

	it("excludes tasks carrying the user's mapped archive tag", () => {
		const plugin = createMockPlugin({ ...fieldMapping, archiveTag: 'old "stuff"' });
		plugin.settings.triage = { inboxStatus: "inbox", somedayStatus: "someday", captureToInbox: true };
		const base = parse(generateBasesFileTemplate("open-tasks-view", plugin as any));
		const expected = `file.hasTag(${JSON.stringify('old "stuff"')}) != true`;
		for (const name of ["Inbox", "Someday"]) {
			expect(base.views.find((v: any) => v.name === name).filters.and).toContain(expected);
		}
	});

	it("tolerates settings without a triage block", () => {
		const plugin = createMockPlugin() as any;
		delete plugin.settings.triage;
		expect(() => generateBasesFileTemplate("open-tasks-view", plugin)).not.toThrow();
	});
});
