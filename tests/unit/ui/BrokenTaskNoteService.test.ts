import { TFile } from "obsidian";
import { BrokenTaskNoteService } from "../../../src/ui/BrokenTaskNoteService";
import * as notifications from "../../../src/ui/notifications";

const broken = `---
status: open
tags:
  - task
timeEntries:
  - startTime: 2026-10-16T10:34:46.802Z
    endTime: 2026-10-16T13:09:46.772+02:00
    endTime: 2026-10-16T13:09:46.772+02:00
---
`;

function setup(content: string, path = "TaskNotes/Tasks/Metrics Deck.md") {
	const file = Object.assign(new TFile(), { path, basename: path.split("/").pop()!.replace(/\.md$/, "") });
	let text = content;
	const plugin = {
		settings: { taskIdentificationMethod: "tag", taskTag: "task", taskPropertyName: "", taskPropertyValue: "", tasksFolder: "TaskNotes/Tasks" },
		i18n: { translate: (k: string) => k },
		app: {
			vault: {
				process: jest.fn(async (_f: TFile, fn: (s: string) => string) => {
					text = fn(text);
					return text;
				}),
			},
			workspace: { getLeaf: () => ({ openFile: jest.fn() }) },
		},
	};
	const service = new BrokenTaskNoteService(plugin as never);
	const internals = service as unknown as {
		check(file: TFile, content: string): void;
		repair(file: TFile): Promise<void>;
	};
	return { file, plugin, internals, text: () => text };
}

describe("BrokenTaskNoteService", () => {
	let notices: (string | DocumentFragment)[];
	beforeEach(() => {
		notices = [];
		jest.spyOn(notifications, "showNotice").mockImplementation((message) => {
			notices.push(message);
			return { hide: jest.fn() } as never;
		});
	});
	afterEach(() => jest.restoreAllMocks());

	it("reports a broken task note once per broken version", () => {
		const { file, internals } = setup(broken);
		internals.check(file, broken);
		internals.check(file, broken);
		expect(notices).toHaveLength(1);
		const text = (notices[0] as DocumentFragment).textContent;
		expect(text).toContain("notices.brokenTaskNote.message");
		expect(text).toContain("notices.brokenTaskNote.repair");
	});

	it("repairs the repeated key line in the note as it is now", async () => {
		const { file, internals, text } = setup(broken);
		await internals.repair(file);
		expect(text().match(/endTime/g)).toHaveLength(1);
		expect(notices).toEqual(["notices.brokenTaskNote.repaired"]);
	});

	it("says so when there is nothing it can safely repair", async () => {
		const unfixable = "---\nstatus: [open\ntags: [task]\n---\n";
		const { file, internals, text } = setup(unfixable);
		internals.check(file, unfixable);
		expect((notices[0] as DocumentFragment).textContent).not.toContain("notices.brokenTaskNote.repair");
		await internals.repair(file);
		expect(text()).toBe(unfixable);
		expect(notices[1]).toBe("notices.brokenTaskNote.repairFailed");
	});

	it("ignores broken notes that are not tasks", () => {
		const note = "---\ntitle: a\ntitle: a\n---\n";
		const { file, internals } = setup(note, "Notes/Plain.md");
		internals.check(file, note);
		expect(notices).toHaveLength(0);
	});
});
