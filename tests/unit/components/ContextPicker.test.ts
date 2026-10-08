import { ContextPicker } from "../../../src/components/ContextPicker";
import type { ContextGroup } from "../../../src/types/settings";

const groups: ContextGroup[] = [
	{
		id: "work",
		name: "Work",
		contexts: [{ id: "vip", name: "VIP", color: "#cc0000", enabled: true, emoji: "🚨" }],
	},
];

function createPicker(value?: string) {
	const container = document.createElement("div");
	const onChange = jest.fn();
	const picker = new ContextPicker(container, { groups, value, noneLabel: "No context", onChange });
	const label = () => container.querySelector(".tn-context-picker__label") as HTMLElement;
	return { picker, label };
}

describe("ContextPicker", () => {
	it("shows a configured context with its emoji in its color", () => {
		const { label } = createPicker("vip");
		expect(label().textContent).toBe("🚨 VIP");
		expect(label().style.color).toBe("rgb(204, 0, 0)");
	});

	it("shows the none label when empty and keeps unconfigured contexts visible", () => {
		const { picker, label } = createPicker();
		expect(label().textContent).toBe("No context");
		expect(picker.value).toBe("");

		picker.value = "errands, home";
		expect(picker.value).toBe("errands");
		expect(label().textContent).toBe("errands");
	});
});
