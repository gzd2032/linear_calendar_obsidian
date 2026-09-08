import { Modal, Setting } from "obsidian";
import { sanitizeCalendarName } from "./calendar-paths";
import { PASTEL_COLORS } from "./types";

export interface EventDraft {
	title: string;
	start: string;
	end: string;
	color: string;
	calendar: string;
	description: string;
}

export class EventCreateModal extends Modal {
	private draft: EventDraft;
	private calendars: string[];
	private onSubmit: (draft: EventDraft) => void;
	private heading: string;

	constructor(
		app: ConstructorParameters<typeof Modal>[0],
		draft: EventDraft,
		calendars: string[],
		onSubmit: (draft: EventDraft) => void,
		heading = "New event",
	) {
		super(app);
		this.draft = { ...draft };
		this.calendars = calendars;
		this.onSubmit = onSubmit;
		this.heading = heading;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("byc-modal");
		contentEl.createEl("h2", { text: this.heading });

		new Setting(contentEl).setName("Title").addText((text) => {
			text.setValue(this.draft.title).onChange((value) => {
				this.draft.title = value;
			});
			text.inputEl.focus();
		});

		const dates = new Setting(contentEl).setName("Dates");
		dates.controlEl.addClass("byc-date-row");
		dates.addText((text) => {
			text
				.setPlaceholder("Start YYYY-MM-DD")
				.setValue(this.draft.start)
				.onChange((value) => {
					this.draft.start = value;
				});
			text.inputEl.setAttribute("aria-label", "Start date");
		});
		dates.addText((text) => {
			text
				.setPlaceholder("End YYYY-MM-DD")
				.setValue(this.draft.end)
				.onChange((value) => {
					this.draft.end = value;
				});
			text.inputEl.setAttribute("aria-label", "End date");
		});

		const OTHER = "__other__";
		const calendarNames = [
			...new Set(this.calendars.map((name) => sanitizeCalendarName(name)).filter(Boolean)),
		].sort((a, b) => a.localeCompare(b));
		const currentCalendar = sanitizeCalendarName(this.draft.calendar);
		let usingOther = calendarNames.length === 0 || !calendarNames.includes(currentCalendar);

		const calendarSetting = new Setting(contentEl).setName("Calendar");
		const customSetting = new Setting(contentEl).setName("New calendar name");
		let customInput: HTMLInputElement | null = null;
		customSetting.addText((text) => {
			customInput = text.inputEl;
			text
				.setPlaceholder("Calendar name")
				.setValue(usingOther ? this.draft.calendar : "")
				.onChange((value) => {
					this.draft.calendar = value;
				});
			text.inputEl.setAttribute("aria-label", "New calendar name");
		});
		if (usingOther) customSetting.settingEl.show();
		else customSetting.settingEl.hide();

		calendarSetting.addDropdown((dropdown) => {
			for (const name of calendarNames) {
				dropdown.addOption(name, name);
			}
			dropdown.addOption(OTHER, "Other…");
			dropdown.setValue(usingOther ? OTHER : currentCalendar);
			dropdown.onChange((value) => {
				usingOther = value === OTHER;
				if (usingOther) {
					customSetting.settingEl.show();
					this.draft.calendar = "";
					if (customInput) customInput.value = "";
					customInput?.focus();
				} else {
					customSetting.settingEl.hide();
					this.draft.calendar = value;
				}
			});
		});

		new Setting(contentEl).setName("Description").addTextArea((area) => {
			area.setPlaceholder("Optional notes…").setValue(this.draft.description).onChange((value) => {
				this.draft.description = value;
			});
			area.inputEl.rows = 5;
			area.inputEl.addClass("byc-description-input");
		});

		const colorSetting = new Setting(contentEl).setName("Color");
		const row = colorSetting.controlEl.createDiv({ cls: "byc-color-row" });
		for (const color of PASTEL_COLORS) {
			const dot = row.createDiv({ cls: "byc-color-dot" });
			dot.style.background = color;
			if (color === this.draft.color) dot.addClass("is-active");
			dot.addEventListener("click", () => {
				this.draft.color = color;
				row.querySelectorAll(".byc-color-dot").forEach((node) => node.removeClass("is-active"));
				dot.addClass("is-active");
			});
		}

		new Setting(contentEl).addButton((btn) => {
			btn.setButtonText(this.heading === "Edit event" ? "Save" : "Create")
				.setCta()
				.onClick(() => {
					if (!this.draft.title.trim()) this.draft.title = "Untitled";
					this.draft.calendar = sanitizeCalendarName(
						this.draft.calendar.trim() || calendarNames[0] || "Personal",
					);
					this.onSubmit(this.draft);
					this.close();
				});
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
