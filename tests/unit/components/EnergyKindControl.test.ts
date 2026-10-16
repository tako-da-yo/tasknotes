import { EnergyKindControl } from "../../../src/components/EnergyKindControl";

describe("EnergyKindControl", () => {
	const labels = { spark: "Spark", steady: "Steady", drain: "Drain" };
	it("defaults to steady and reports changes", () => {
		const el = document.createElement("div");
		const onChange = jest.fn();
		new EnergyKindControl(el, { value: undefined, labels, groupLabel: "Energy", onChange });
		const radios = el.querySelectorAll('[role="radio"]');
		expect(radios).toHaveLength(3);
		expect(el.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe("Energy");
		expect(el.querySelector('[aria-checked="true"]')?.getAttribute("aria-label")).toBe("Steady");
		expect(el.querySelector("[draggable]")).toBeNull();
		(radios[2] as HTMLElement).click();
		expect(onChange).toHaveBeenCalledWith("drain");
		expect(radios[2].getAttribute("aria-checked")).toBe("true");
	});
	it("moves with arrow keys", () => {
		const el = document.createElement("div");
		const onChange = jest.fn();
		new EnergyKindControl(el, { value: "spark", labels, groupLabel: "Energy", onChange });
		el.querySelector('[aria-checked="true"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		expect(onChange).toHaveBeenCalledWith("steady");
	});
});
