import { EnergyView } from "../../../src/views/EnergyView";
import * as dateUtils from "../../../src/utils/dateUtils";

jest.mock("../../../src/bootstrap/energyPanelDeps", () => ({
	createEnergyPanelDeps: () => ({
		getDayEnergy: async (date: string) => ({
			date, projected: 50, now: 50, hours: { spark: 0, steady: 0, drain: 1 }, contributions: [], topDrains: [],
			assumedSizeCount: 0, level: "ok", hasSignal: true,
		}),
		isActive: () => true,
		titleOf: () => "",
		openItem: jest.fn(),
		showDrainTasks: jest.fn(),
		findSpark: jest.fn(),
		openSettings: jest.fn(),
		t: (k: string) => k,
		today: () => dateUtils.getTodayString(),
	}),
}));

describe("EnergyView: following today", () => {
	let today = "2026-10-15";
	beforeEach(() => {
		jest.spyOn(dateUtils, "getTodayString").mockImplementation(() => today);
	});
	afterEach(() => jest.restoreAllMocks());

	const makeView = () => {
		const plugin = {
			i18n: { translate: (k: string) => k },
			energyService: { onChange: () => () => undefined },
			emitter: { on: jest.fn(() => ({})) },
		};
		const view = new EnergyView({} as never, plugin as never);
		// Obsidian's Component would track this; the mock only needs to accept it.
		(view as unknown as { registerEvent: (r: unknown) => void }).registerEvent = () => undefined;
		return view;
	};
	const shownDate = (view: EnergyView) => (view as unknown as { panel: { getDate(): string } }).panel.getDate();

	it("moves a view on today to the new today", async () => {
		today = "2026-10-15";
		const view = makeView();
		await view.onOpen();
		today = "2026-10-16";
		await view.refresh();
		expect(shownDate(view)).toBe("2026-10-16");
	});
	it("keeps a view on another day where it is", async () => {
		today = "2026-10-15";
		const view = makeView();
		await view.setDate("2026-10-20");
		await view.onOpen();
		today = "2026-10-16";
		await view.refresh();
		expect(shownDate(view)).toBe("2026-10-20");
	});
});
