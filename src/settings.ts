import { type App, PluginSettingTab, Setting, type SettingDefinitionItem } from "obsidian";
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
	settingsVersion: 3,
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

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				name: "Events folder",
				desc: "Root for notes. Local calendars use Calendar/<Name>/. Google ICS imports go under Calendar/google/<Name>/.",
				control: { type: "text", key: "eventsFolder" },
			},
			{
				name: "Default calendar name",
				desc: "Local planning calendar used when you click or drag to create an event. Google calendars are read-only.",
				control: { type: "text", key: "defaultCalendar" },
			},
			{
				name: "Week starts on",
				desc: "Used by Stacked and Col-Stack so weekends line up.",
				control: {
					type: "dropdown",
					key: "weekStartsOn",
					options: { "0": "Sunday", "1": "Monday" },
				},
			},
			{
				name: "Default view",
				control: {
					type: "dropdown",
					key: "defaultView",
					options: {
						stacked: "Stacked",
						linear: "Linear",
						column: "Column",
						"col-stack": "Col-Stack",
					},
				},
			},
			{
				type: "group",
				heading: "Google Calendar (ICS)",
				items: [
					{
						name: "All-day events only",
						desc: "Skip timed meetings. Only Google all-day events (trips, birthdays, multi-day blocks) are imported.",
						control: { type: "toggle", key: "importAllDayOnly" },
					},
					{
						name: "ICS calendars",
						desc: "In Google Calendar: Settings → the calendar → Integrate calendar → Secret address in iCal format.",
						render: (setting) => {
							const host = setting.settingEl.parentElement ?? setting.settingEl;
							setting.addButton((btn) => {
								btn.setButtonText("Add").onClick(() => {
									void (async () => {
										this.plugin.settings.icsSources.push({
											id: crypto.randomUUID(),
											name: "Google Calendar",
											url: "",
											color:
												PASTEL_COLORS[
													this.plugin.settings.icsSources.length % PASTEL_COLORS.length
												] ?? "#A9C7E8",
											enabled: true,
										});
										await this.plugin.saveSettings();
										this.update();
									})();
								});
							});
							this.plugin.settings.icsSources.forEach((source, index) => {
								this.renderSource(host, source, index);
							});
						},
					},
				],
			},
		];
	}

	getControlValue(key: string): unknown {
		if (key === "weekStartsOn") {
			return String(this.plugin.settings.weekStartsOn);
		}
		return super.getControlValue(key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === "weekStartsOn") {
			this.plugin.settings.weekStartsOn = Number(value) === 1 ? 1 : 0;
			await this.plugin.saveSettings();
			this.plugin.refreshViews();
			return;
		}
		if (key === "eventsFolder" && typeof value === "string") {
			this.plugin.settings.eventsFolder = value.trim() || "Calendar";
			await this.plugin.saveSettings();
			return;
		}
		if (key === "defaultCalendar" && typeof value === "string") {
			this.plugin.settings.defaultCalendar = value.trim() || "Personal";
			await this.plugin.saveSettings();
			return;
		}
		if (key === "defaultView" && typeof value === "string") {
			this.plugin.settings.defaultView = parseViewMode(value);
			await this.plugin.saveSettings();
			this.plugin.refreshViews();
			return;
		}
		await super.setControlValue(key, value);
	}

	private renderSource(containerEl: HTMLElement, source: IcsSource, index: number): void {
		new Setting(containerEl).setName(source.name || `Calendar ${index + 1}`).setHeading();

		new Setting(containerEl).setName("Name").addText((text) => {
			text.setValue(source.name).onChange(async (value) => {
				source.name = value;
				await this.plugin.saveSettings();
			});
		});

		new Setting(containerEl).setName("ICS URL").addText((text) => {
			text
				.setPlaceholder("https://calendar.google.com/calendar/ical/…")
				.setValue(source.url)
				.onChange(async (value) => {
					const next = normalizeIcsUrl(value);
					source.url = next;
					if (next !== value) text.setValue(next);
					await this.plugin.saveSettings();
				});
			text.inputEl.addClass("byc-ics-url-input");
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
				btn.setButtonText("Remove").setDestructive().onClick(async () => {
					this.plugin.settings.icsSources.splice(index, 1);
					await this.plugin.saveSettings();
					this.update();
				});
			});
	}
}
