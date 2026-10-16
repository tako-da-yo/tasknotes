import { ICSSubscriptionService } from "../../../src/services/ICSSubscriptionService";
import type { ICSCache, ICSEvent, ICSSubscription } from "../../../src/types";

jest.mock("obsidian", () => ({
	Notice: jest.fn(),
	requestUrl: jest.fn(),
	TFile: jest.fn(),
}));

const sub = (id: string, enabled = true): ICSSubscription => ({
	id,
	name: id,
	url: `https://example.invalid/${id}`,
	type: "remote",
	color: "#000000",
	enabled,
	refreshInterval: 60,
});

const ev = (id: string, subscriptionId: string): ICSEvent => ({
	id,
	subscriptionId,
	title: id,
	start: "2026-10-15T09:00:00Z",
	allDay: false,
});

const entry = (id: string, expiresIn: number): ICSCache => ({
	subscriptionId: id,
	events: [ev(`${id}-event`, id)],
	lastUpdated: new Date().toISOString(),
	expires: new Date(Date.now() + expiresIn).toISOString(),
});

describe("ICSSubscriptionService.getCachedEvents", () => {
	it("returns cached events usable by getAllEvents without fetching or refreshing", () => {
		const plugin = {
			loadData: jest.fn().mockResolvedValue({ icsSubscriptions: [] }),
			saveData: jest.fn().mockResolvedValue(undefined),
			app: { vault: { on: jest.fn(), offref: jest.fn(), getFiles: jest.fn(() => []) } },
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const service = new ICSSubscriptionService(plugin as any);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const internals = service as any;
		const fetchSpy = jest.spyOn(internals, "fetchSubscription").mockResolvedValue(undefined);

		internals.subscriptions = [
			sub("fresh"),
			sub("stale"),
			sub("expired"),
			sub("uncached"),
			sub("off", false),
		];
		const cache = internals.cache as Map<string, ICSCache>;
		cache.set("fresh", entry("fresh", 60_000));
		cache.set("stale", entry("stale", -1_000)); // expired, still within the grace period
		cache.set("expired", entry("expired", -24 * 3_600_000));
		cache.set("off", entry("off", 60_000));

		expect(service.getCachedEvents().map((e) => e.id)).toEqual([
			"fresh-event",
			"stale-event",
		]);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
