import { applyCalendarContextEmojiBadge } from "../../../src/bases/calendarEventMount";

function createEventElement(): HTMLElement {
	const element = document.createElement("a");
	const providerIcon = document.createElement("span");
	providerIcon.className = "fc-event-provider-icon";
	element.appendChild(providerIcon);
	return element;
}

describe("applyCalendarContextEmojiBadge", () => {
	it("replaces the provider icon with the context emoji", () => {
		const element = createEventElement();
		applyCalendarContextEmojiBadge(element, "🚨", "timeGridWeek");

		const icons = element.querySelectorAll(".fc-event-provider-icon");
		expect(icons).toHaveLength(1);
		expect(icons[0].classList.contains("fc-event-context-emoji")).toBe(true);
		expect(icons[0].textContent).toBe("🚨");
	});

	it("leaves list view cards unchanged", () => {
		const element = createEventElement();
		applyCalendarContextEmojiBadge(element, "🚨", "listWeek");
		expect(element.querySelector(".fc-event-context-emoji")).toBeNull();
	});
});
