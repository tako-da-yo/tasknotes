import { StatusManager } from "../../../src/services/StatusManager";
import type { StatusConfig } from "../../../src/types";

function status(value: string, order: number, isCompleted: boolean): StatusConfig {
	return {
		id: value,
		value,
		label: value,
		color: "#888888",
		isCompleted,
		order,
		autoArchive: false,
		autoArchiveDelay: 5,
	};
}

describe("StatusManager.getFirstCompletedStatus", () => {
	it("returns the completed status with the lowest order, not the first in the array", () => {
		const manager = new StatusManager([
			status("open", 0, false),
			status("cancelled", 3, true),
			status("done", 2, true),
		]);
		expect(manager.getFirstCompletedStatus()).toBe("done");
	});

	it("returns undefined when no status is completed", () => {
		expect(new StatusManager([status("open", 0, false)]).getFirstCompletedStatus()).toBeUndefined();
	});
});
