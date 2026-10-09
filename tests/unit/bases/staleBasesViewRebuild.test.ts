import { isTaskNotesViewFromOtherPlugin } from "../../../src/bases/registration";
import type TaskNotesPlugin from "../../../src/main";

describe("isTaskNotesViewFromOtherPlugin", () => {
	const plugin = {} as TaskNotesPlugin;
	const oldPlugin = {} as TaskNotesPlugin;
	const leafView = (view: unknown) => ({ controller: { view } });

	it("detects a TaskNotes view still bound to an unloaded plugin instance", () => {
		expect(
			isTaskNotesViewFromOtherPlugin(
				leafView({ type: "tasknotesCalendar", plugin: oldPlugin }),
				plugin
			)
		).toBe(true);
	});

	it("ignores TaskNotes views owned by the current plugin", () => {
		expect(
			isTaskNotesViewFromOtherPlugin(leafView({ type: "tasknotesCalendar", plugin }), plugin)
		).toBe(false);
	});

	it("ignores other Bases views and leaves without a controller", () => {
		expect(isTaskNotesViewFromOtherPlugin(leafView({ type: "table" }), plugin)).toBe(false);
		expect(isTaskNotesViewFromOtherPlugin({}, plugin)).toBe(false);
		expect(isTaskNotesViewFromOtherPlugin(null, plugin)).toBe(false);
	});
});
