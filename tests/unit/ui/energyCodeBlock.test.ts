import { energyBlockDateResolver, parseEnergyBlock } from "../../../src/ui/energyCodeBlock";

describe("parseEnergyBlock", () => {
	it("has no date without a date: line", () => {
		expect(parseEnergyBlock("")).toEqual({ date: null });
	});
	it("reads date:", () => {
		expect(parseEnergyBlock("date: 2026-10-20\n")).toEqual({ date: "2026-10-20" });
	});
	it("rejects invalid dates", () => {
		expect(parseEnergyBlock("date: tomorrow")).toEqual({ error: "tomorrow" });
		expect(parseEnergyBlock("date: 2026-13-40")).toEqual({ error: "2026-13-40" });
	});
});

describe("energyBlockDateResolver", () => {
	it("uses an explicit date", () => {
		expect(energyBlockDateResolver("2026-10-20", () => "2026-10-01", () => "2026-10-15")()).toBe("2026-10-20");
	});
	it("uses the daily note's date", () => {
		expect(energyBlockDateResolver(null, () => "2026-10-01", () => "2026-10-15")()).toBe("2026-10-01");
	});
	it("resolves to today at each call outside a daily note", () => {
		let today = "2026-10-15";
		const resolve = energyBlockDateResolver(null, () => null, () => today);
		expect(resolve()).toBe("2026-10-15");
		today = "2026-10-16";
		expect(resolve()).toBe("2026-10-16");
	});
});
