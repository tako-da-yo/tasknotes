import { parse } from "yaml";
import {
	diagnoseTaskNote,
	looksLikeTaskFrontmatter,
	rawFrontmatter,
	removeRepeatedKeyLines,
	TaskIdentification,
} from "../../../src/core/brokenFrontmatter";

const byTag: TaskIdentification = { method: "tag", tag: "task", propertyName: "", propertyValue: "", folder: "TaskNotes/Tasks" };
const yamlParse = (text: string) => parse(text) as unknown;

const broken = `---
status: open
tags:
  - task
timeEntries:
  - startTime: 2026-10-16T10:34:46.802Z
    description: Work session
    endTime: 2026-10-16T13:09:46.772+02:00
    endTime: 2026-10-16T13:09:46.772+02:00
---

Body
`;

describe("rawFrontmatter", () => {
	it("finds the frontmatter text and where it sits", () => {
		const fm = rawFrontmatter(broken);
		expect(fm?.text.startsWith("status: open")).toBe(true);
		expect(broken.slice(fm!.start, fm!.end)).toBe(fm!.text);
		expect(rawFrontmatter("No frontmatter")).toBeNull();
	});
});

describe("looksLikeTaskFrontmatter", () => {
	it("recognises the task tag in list, inline and hashed forms", () => {
		expect(looksLikeTaskFrontmatter("tags:\n  - task", byTag)).toBe(true);
		expect(looksLikeTaskFrontmatter("tags: [work, task]", byTag)).toBe(true);
		expect(looksLikeTaskFrontmatter('tags: "#task"', byTag)).toBe(true);
		expect(looksLikeTaskFrontmatter("tags:\n  - taskforce", byTag)).toBe(false);
	});

	it("recognises the identifying property", () => {
		const byProperty = { ...byTag, method: "property" as const, propertyName: "type", propertyValue: "task" };
		expect(looksLikeTaskFrontmatter("type: task", byProperty)).toBe(true);
		expect(looksLikeTaskFrontmatter('type: "task"', byProperty)).toBe(true);
		expect(looksLikeTaskFrontmatter("type: note", byProperty)).toBe(false);
	});
});

describe("removeRepeatedKeyLines", () => {
	it("drops a key line that repeats the line above it", () => {
		const { text, removed } = removeRepeatedKeyLines("a: 1\nb: 2\nb: 2\nc: 3");
		expect(text).toBe("a: 1\nb: 2\nc: 3");
		expect(removed).toBe(1);
	});

	it("keeps repeated list items and different values", () => {
		expect(removeRepeatedKeyLines("tags:\n  - a\n  - a").removed).toBe(0);
		expect(removeRepeatedKeyLines("a: 1\na: 2").removed).toBe(0);
	});
});

describe("diagnoseTaskNote", () => {
	it("finds a task note whose properties can't be read and offers a repair that parses", () => {
		const result = diagnoseTaskNote("Notes/x.md", broken, byTag, yamlParse);
		expect(result?.repaired).not.toBeNull();
		expect(result!.repaired).toContain("Body");
		expect(result!.repaired!.match(/endTime/g)).toHaveLength(1);
		expect(() => yamlParse(rawFrontmatter(result!.repaired!)!.text)).not.toThrow();
	});

	it("flags broken notes in the tasks folder even without a readable tag, with no repair when none works", () => {
		const content = "---\nstatus: [open\n---\n";
		expect(diagnoseTaskNote("TaskNotes/Tasks/y.md", content, byTag, yamlParse)).toEqual({ repaired: null });
		expect(diagnoseTaskNote("Notes/y.md", content, byTag, yamlParse)).toBeNull();
	});

	it("ignores notes that parse", () => {
		expect(diagnoseTaskNote("TaskNotes/Tasks/z.md", "---\nstatus: open\ntags: [task]\n---\n", byTag, yamlParse)).toBeNull();
	});
});
