import { type App, PluginSettingTab, Setting } from "obsidian";
import { normalizeIcsUrl } from "./ics";
import type LinearYearCalendarPlugin from "./main";
import { PASTEL_COLORS, type IcsSource, type PluginSettings, type ViewMode } from "./types";

export const DEFAULT_SETTINGS: PluginSettings = {
	eventsFolder: "Calendar",
	weekStartsOn: 0,
	defaultView: "stacked",
	defaultCalendar: "Personal",
	icsSources: [],
	hiddenCalendars: [],
	importAllDayOnly: true,
	wideLayout: false,
	settingsVersion: 2,
};

function parseViewMode(value: string): ViewMode {
	if (value === "linear" || value === "column" || value === "col-stack") return value;
	return "stacked";
}

export class LinearYearCalendarSettingTab extends PluginSettingTab {
	plugin: LinearYearCalendarPlugin;

	constructor(app: App, plugin: LinearYearCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Linear Year Calendar" });

		new Setting(containerEl)
			.setName("Events folder")
			.setDesc("Markdown notes with start/end dates live here. ICS imports go into subfolders.")
			.addText((text) => {
				text.setValue(this.plugin.settings.eventsFolder).onChange(async (value) => {
					this.plugin.settings.eventsFolder = value.trim() || "Calendar";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default calendar name")
			.setDesc("Used when you click or drag to create an event.")
			.addText((text) => {
				text.setValue(this.plugin.settings.defaultCalendar).onChange(async (value) => {
					this.plugin.settings.defaultCalendar = value.trim() || "Personal";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Week starts on")
			.setDesc("Used by Stacked and Col-Stack so weekends line up.")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("0", "Sunday")
					.addOption("1", "Monday")
					.setValue(String(this.plugin.settings.weekStartsOn))
					.onChange(async (value) => {
						this.plugin.settings.weekStartsOn = Number(value);
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					});
			});

		new Setting(containerEl)
			.setName("Default view")
			.addDropdown((dropdown) => {
				dropdown
					.addOption("stacked", "Stacked")
					.addOption("linear", "Linear")
					.addOption("column", "Column")
					.addOption("col-stack", "Col-Stack")
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (value) => {
						this.plugin.settings.defaultView = parseViewMode(value);
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					});
			});

		containerEl.createEl("h3", { text: "Google Calendar (ICS)" });
		containerEl.createEl("p", {
			text: "In Google Calendar: Settings → the calendar → Integrate calendar → Secret address in iCal format. Paste that URL here, then Refresh from the calendar toolbar.",
		});

		new Setting(containerEl)
			.setName("All-day events only")
			.setDesc("Skip timed meetings. Only Google all-day events (trips, birthdays, multi-day blocks) are imported.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.importAllDayOnly).onChange(async (value) => {
					this.plugin.settings.importAllDayOnly = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName("Add ICS calendar").addButton((btn) => {
			btn.setButtonText("Add").onClick(async () => {
				this.plugin.settings.icsSources.push({
					id: crypto.randomUUID(),
					name: "Google Calendar",
					url: "",
					color: PASTEL_COLORS[this.plugin.settings.icsSources.length % PASTEL_COLORS.length] ?? "#A9C7E8",
					enabled: true,
				});
				await this.plugin.saveSettings();
				this.display();
			});
		});

		this.plugin.settings.icsSources.forEach((source, index) => {
			this.renderSource(containerEl, source, index);
		});
	}

	private renderSource(containerEl: HTMLElement, source: IcsSource, index: number): void {
		containerEl.createEl("h4", { text: source.name || `Calendar ${index + 1}` });

		new Setting(containerEl).setName("Name").addText((text) => {
			text.setValue(source.name).onChange(async (value) => {
				source.name = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl).setName("ICS URL").addText((text) => {
			text.setPlaceholder("https://calendar.google.com/calendar/ical/…").setValue(source.url).onChange(async (value) => {
				const next = normalizeIcsUrl(value);
				source.url = next;
				if (next !== value) text.setValue(next);
				await this.plugin.saveSettings();
			});
			text.inputEl.style.width = "100%";
		});

		new Setting(containerEl).setName("Color").addColorPicker((picker) => {
			picker.setValue(source.color).onChange(async (value) => {
				source.color = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl)
			.setName("Enabled")
			.addToggle((toggle) => {
				toggle.setValue(source.enabled).onChange(async (value) => {
					source.enabled = value;
					await this.plugin.saveSettings();
				});
			})
			.addButton((btn) => {
				btn.setButtonText("Remove").setWarning().onClick(async () => {
					this.plugin.settings.icsSources.splice(index, 1);
					await this.plugin.saveSettings();
					this.display();
				});
			});
	}
}
