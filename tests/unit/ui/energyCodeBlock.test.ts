import { parseEnergyBlock } from "../../../src/ui/energyCodeBlock";

describe("parseEnergyBlock", () => {
	it("defaults to the fallback date", () => {
		expect(parseEnergyBlock("", "2026-10-15")).toEqual({ date: "2026-10-15" });
	});
	it("reads date:", () => {
		expect(parseEnergyBlock("date: 2026-10-20\n", "2026-10-15")).toEqual({ date: "2026-10-20" });
	});
	it("rejects invalid dates", () => {
		expect(parseEnergyBlock("date: tomorrow", "2026-10-15")).toEqual({ error: "tomorrow" });
		expect(parseEnergyBlock("date: 2026-13-40", "2026-10-15")).toEqual({ error: "2026-13-40" });
	});
});
