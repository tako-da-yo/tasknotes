import type { ContextDefinition } from "../../../src/types/settings";
import { moveById, moveContext } from "../../../src/settings/tabs/taskProperties/contextGroupsCard";

describe("moveById", () => {
	const groups = [{ id: "a" }, { id: "b" }, { id: "c" }];
	const ids = (items: { id: string }[]) => items.map((item) => item.id).join("");

	it("moves an item before or after the target", () => {
		expect(ids(moveById(groups, "c", "a", true))).toBe("cab");
		expect(ids(moveById(groups, "a", "c", false))).toBe("bca");
		expect(ids(moveById(groups, "a", "b", false))).toBe("bac");
		expect(ids(moveById(groups, "c", "b", true))).toBe("acb");
	});

	it("leaves the order unchanged for unknown ids or a drop on itself", () => {
		expect(ids(moveById(groups, "x", "a", true))).toBe("abc");
		expect(ids(moveById(groups, "a", "x", true))).toBe("abc");
		expect(ids(moveById(groups, "b", "b", true))).toBe("abc");
	});
});

describe("moveContext", () => {
	const makeGroups = () => [
		{ id: "work", name: "Work", contexts: [ctx("a"), ctx("b"), ctx("c")] },
		{ id: "self", name: "Self", contexts: [ctx("x")] },
		{ id: "empty", name: "Empty", contexts: [] as ReturnType<typeof ctx>[] },
	];
	const layout = (groups: ReturnType<typeof makeGroups>) =>
		groups.map((group) => group.contexts.map((context) => context.id).join("")).join("|");

	it("reorders within a group", () => {
		const groups = makeGroups();
		moveContext(groups, "c", "work", "a", true);
		expect(layout(groups)).toBe("cab|x|");
		moveContext(groups, "c", "work", "b", false);
		expect(layout(groups)).toBe("abc|x|");
	});

	it("moves between groups, including to the end of an empty group", () => {
		const groups = makeGroups();
		moveContext(groups, "b", "self", "x", true);
		expect(layout(groups)).toBe("ac|bx|");
		moveContext(groups, "a", "empty", null, false);
		expect(layout(groups)).toBe("c|bx|a");
	});

	it("keeps a moved context's energy", () => {
		const groups = makeGroups();
		groups[0].contexts[1] = { ...ctx("b"), energy: "drain" };
		moveContext(groups, "b", "self", "x", false);
		expect(groups[1].contexts.find((context) => context.id === "b")?.energy).toBe("drain");
	});

	it("ignores unknown contexts and drops onto itself", () => {
		const groups = makeGroups();
		moveContext(groups, "nope", "work", null, false);
		moveContext(groups, "a", "work", "a", true);
		expect(layout(groups)).toBe("abc|x|");
	});
});

function ctx(id: string): ContextDefinition {
	return { id, name: id, color: "#000000", enabled: true };
}
