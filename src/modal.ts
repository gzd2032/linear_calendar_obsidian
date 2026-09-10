import { Modal, Setting, type ButtonComponent } from "obsidian";
import { sanitizeCalendarName } from "./calendar-paths";
import { endOnOrAfterStart, parseISODate } from "./dates";
import { eventDayCount } from "./format";
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
	private onSubmit: (draft: EventDraft) => void | Promise<void>;
	private heading: string;
	private busy = false;

	constructor(
		app: ConstructorParameters<typeof Modal>[0],
		draft: EventDraft,
		calendars: string[],
		onSubmit: (draft: EventDraft) => void | Promise<void>,
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
		const formError = contentEl.createDiv({ cls: "byc-modal-error" });
		formError.hidden = true;

		const setFormError = (message: string | null): void => {
			formError.hidden = !message;
			formError.setText(message ?? "");
		};
		const setFieldError = (setting: Setting, message: string | null): void => {
			setting.setDesc(message ?? "");
			setting.settingEl.classList.toggle("is-invalid", Boolean(message));
		};

		const titleSetting = new Setting(contentEl).setName("Title").addText((text) => {
			text.setValue(this.draft.title).onChange((value) => {
				this.draft.title = value;
				if (value.trim()) setFieldError(titleSetting, null);
			});
			text.inputEl.setAttribute("aria-label", "Title");
			text.inputEl.focus();
		});

		let endInput: HTMLInputElement | null = null;
		const syncEndMin = (): void => {
			if (!endInput) return;
			endInput.min = this.draft.start;
		};
		const startSetting = new Setting(contentEl).setName("Start");
		const endSetting = new Setting(contentEl).setName("End");
		const refreshDuration = (): void => {
			if (endSetting.settingEl.classList.contains("is-invalid")) return;
			if (!parseISODate(this.draft.start) || !parseISODate(this.draft.end)) {
				endSetting.setDesc("");
				return;
			}
			const days = eventDayCount(this.draft.start, this.draft.end);
			endSetting.setDesc(days === 1 ? "1 day" : `${days} days`);
		};
		startSetting.addText((text) => {
			text.inputEl.type = "date";
			text.setValue(this.draft.start).onChange((value) => {
				this.draft.start = value;
				this.draft.end = endOnOrAfterStart(this.draft.start, this.draft.end);
				if (endInput) endInput.value = this.draft.end;
				syncEndMin();
				setFieldError(startSetting, null);
				setFieldError(endSetting, null);
				refreshDuration();
			});
			text.inputEl.setAttribute("aria-label", "Start date");
		});
		endSetting.addText((text) => {
			endInput = text.inputEl;
			text.inputEl.type = "date";
			text.setValue(this.draft.end).onChange((value) => {
				this.draft.end = endOnOrAfterStart(this.draft.start, value);
				if (endInput) endInput.value = this.draft.end;
				setFieldError(endSetting, null);
				refreshDuration();
			});
			text.inputEl.setAttribute("aria-label", "End date");
		});
		syncEndMin();
		refreshDuration();

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
		const row = colorSetting.controlEl.createDiv({
			cls: "byc-color-row",
			attr: { role: "group", "aria-label": "Event color" },
		});
		const dots: HTMLButtonElement[] = [];
		const selectColor = (index: number, focus = true): void => {
			const color = PASTEL_COLORS[index];
			if (!color) return;
			this.draft.color = color;
			for (const [i, node] of dots.entries()) {
				const active = i === index;
				node.classList.toggle("is-active", active);
				node.setAttribute("aria-pressed", active ? "true" : "false");
				node.tabIndex = active ? 0 : -1;
			}
			if (focus) dots[index]?.focus();
		};
		for (const [index, color] of PASTEL_COLORS.entries()) {
			const active = color === this.draft.color;
			const dot = row.createEl("button", {
				cls: "byc-color-dot",
				attr: {
					type: "button",
					"aria-label": `Color ${index + 1}`,
					"aria-pressed": active ? "true" : "false",
				},
			});
			dot.style.background = color;
			dot.tabIndex = active ? 0 : -1;
			if (active) dot.addClass("is-active");
			dot.addEventListener("click", () => selectColor(index));
			dot.addEventListener("keydown", (event: KeyboardEvent) => {
				const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
				if (!keys.includes(event.key)) return;
				event.preventDefault();
				const last = PASTEL_COLORS.length - 1;
				let next = index;
				if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
				else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
				else if (event.key === "Home") next = 0;
				else if (event.key === "End") next = last;
				selectColor(next);
			});
			dots.push(dot);
		}
		if (!dots.some((dot) => dot.classList.contains("is-active"))) {
			selectColor(0, false);
		}

		const isEdit = this.heading === "Edit event";
		const submitLabel = isEdit ? "Save" : "Create";
		const busyLabel = isEdit ? "Saving…" : "Creating…";
		let cancelBtn: ButtonComponent | null = null;
		let submitBtn: ButtonComponent | null = null;

		const setBusy = (busy: boolean): void => {
			this.busy = busy;
			contentEl.classList.toggle("is-busy", busy);
			contentEl.setAttribute("aria-busy", busy ? "true" : "false");
			cancelBtn?.setDisabled(busy);
			submitBtn?.setDisabled(busy);
			submitBtn?.setButtonText(busy ? busyLabel : submitLabel);
		};

		new Setting(contentEl)
			.setClass("byc-modal-actions")
			.addButton((btn) => {
				cancelBtn = btn;
				btn.setButtonText("Cancel").onClick(() => {
					if (this.busy) return;
					this.close();
				});
			})
			.addButton((btn) => {
				submitBtn = btn;
				btn.setButtonText(submitLabel)
					.setCta()
					.onClick(() => {
						void this.submit({
							titleSetting,
							startSetting,
							endSetting,
							calendarNames,
							setFieldError,
							setFormError,
							refreshDuration,
							setBusy,
						});
					});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(ctx: {
		titleSetting: Setting;
		startSetting: Setting;
		endSetting: Setting;
		calendarNames: string[];
		setFieldError: (setting: Setting, message: string | null) => void;
		setFormError: (message: string | null) => void;
		refreshDuration: () => void;
		setBusy: (busy: boolean) => void;
	}): Promise<void> {
		if (this.busy) return;
		ctx.setFormError(null);
		ctx.setFieldError(ctx.titleSetting, null);
		ctx.setFieldError(ctx.startSetting, null);
		ctx.setFieldError(ctx.endSetting, null);

		let invalid = false;
		if (!this.draft.title.trim()) {
			ctx.setFieldError(ctx.titleSetting, "Enter a title.");
			invalid = true;
		}
		if (!parseISODate(this.draft.start)) {
			ctx.setFieldError(ctx.startSetting, "Enter a valid start date.");
			invalid = true;
		}
		if (!parseISODate(this.draft.end)) {
			ctx.setFieldError(ctx.endSetting, "Enter a valid end date.");
			invalid = true;
		}
		if (invalid) {
			ctx.refreshDuration();
			return;
		}

		this.draft.end = endOnOrAfterStart(this.draft.start, this.draft.end);
		this.draft.calendar = sanitizeCalendarName(
			this.draft.calendar.trim() || ctx.calendarNames[0] || "Personal",
		);
		ctx.refreshDuration();

		ctx.setBusy(true);
		try {
			await this.onSubmit(this.draft);
			this.close();
		} catch (error) {
			console.error(error);
			ctx.setFormError(error instanceof Error && error.message ? error.message : "Could not save event.");
			ctx.setBusy(false);
		}
	}
}
