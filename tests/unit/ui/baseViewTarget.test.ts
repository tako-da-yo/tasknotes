import { baseViewNames, baseViewSubpath } from "../../../src/ui/baseViewTarget";

describe("baseViewNames", () => {
	it("lists view names from a parsed base", () => {
		expect(
			baseViewNames({ views: [{ type: "table", name: "Tasks" }, { type: "list", name: "Today" }] })
		).toEqual(["Tasks", "Today"]);
	});
	it("skips views without a string name", () => {
		expect(baseViewNames({ views: [{ type: "table" }, { name: 3 }, null, { name: "Today" }] })).toEqual([
			"Today",
		]);
	});
	it("returns nothing for malformed input", () => {
		expect(baseViewNames(null)).toEqual([]);
		expect(baseViewNames("views")).toEqual([]);
		expect(baseViewNames({ views: "Today" })).toEqual([]);
	});
});

describe("baseViewSubpath", () => {
	it("targets the view when the base has it", () => {
		expect(baseViewSubpath(["Tasks", "Today"], "Today")).toBe("#Today");
	});
	it("falls back to the default view when it was renamed or removed", () => {
		expect(baseViewSubpath(["Tasks", "My day"], "Today")).toBeUndefined();
	});
});
