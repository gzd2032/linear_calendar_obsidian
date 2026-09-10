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
	importAllDayOnly: false,
	googleHolidaysEnabled: false,
	googleHolidaysColor: "#F0C987",
	wideLayout: false,
	lastIcsRefreshAt: "",
	icsRefreshResults: [],
	settingsVersion: 6,
};

function parseViewMode(value: string): ViewMode {
	if (value === "linear" || value === "column" || value === "col-stack") return value;
	return "stacked";
}

export function asIcsSources(value: unknown): IcsSource[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
		.map((item, index) => ({
			id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
			name: typeof item.name === "string" ? item.name : `Calendar ${index + 1}`,
			url: typeof item.url === "string" ? normalizeIcsUrl(item.url) : "",
			color: typeof item.color === "string" && item.color ? item.color : PASTEL_COLORS[index % PASTEL_COLORS.length] ?? "#A9C7E8",
			enabled: item.enabled !== false,
		}));
}

/**
 * Imperative settings tab. Declarative ICS `render` appended sibling rows that
 * Obsidian 1.13 discards, so stored calendars vanished and Add appeared dead.
 */
export class LinearYearCalendarSettingTab extends PluginSettingTab {
	plugin: LinearYearCalendarPlugin;

	constructor(app: App, plugin: LinearYearCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Events folder")
			.setDesc("Root for notes. Local calendars use Calendar/<Name>/. Google ICS imports go under Calendar/google/<Name>/.")
			.addText((text) => {
				text.setValue(this.plugin.settings.eventsFolder).onChange(async (value) => {
					this.plugin.settings.eventsFolder = value.trim() || "Calendar";
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Default calendar name")
			.setDesc("Local planning calendar used when you click or drag to create an event. Google calendars are read-only.")
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
						this.plugin.settings.weekStartsOn = Number(value) === 1 ? 1 : 0;
						await this.plugin.saveSettings();
						this.plugin.refreshViews();
					});
			});

		new Setting(containerEl).setName("Default view").addDropdown((dropdown) => {
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

		new Setting(containerEl).setName("Google Calendar (ICS)").setHeading();

		const lastAt = this.plugin.settings.lastIcsRefreshAt;
		const results = this.plugin.settings.icsRefreshResults ?? [];
		if (lastAt || results.length > 0) {
			const when = lastAt ? formatRefreshTime(lastAt) : "Never";
			const lines =
				results.length > 0
					? results.map((r) => `${r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`).join("\n")
					: "No calendar results yet.";
			new Setting(containerEl)
				.setName(`Last ICS refresh · ${when}`)
				.setDesc(lines);
		}

		new Setting(containerEl)
			.setName("All-day events only")
			.setDesc("When on, skip timed meetings. Timed Google events still import as one-day bars when this is off.")
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.importAllDayOnly).onChange(async (value) => {
					this.plugin.settings.importAllDayOnly = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Google US holidays")
			.setDesc(
				"Show Google’s US holiday feed as Google Holidays. Refresh ICS to write notes under the Google Holidays folder.",
			)
			.addColorPicker((picker) => {
				picker.setValue(this.plugin.settings.googleHolidaysColor).onChange(async (value) => {
					this.plugin.settings.googleHolidaysColor = value;
					await this.plugin.saveSettings();
				});
			})
			.addToggle((toggle) => {
				toggle.setValue(this.plugin.settings.googleHolidaysEnabled).onChange(async (value) => {
					this.plugin.settings.googleHolidaysEnabled = value;
					await this.plugin.saveSettings();
					this.plugin.refreshViews();
				});
			});

		new Setting(containerEl)
			.setName("Google calendars")
			.setDesc(
				"Name → folder Calendar/google/<Name>/. URL is the Google secret iCal address. Color tints imported events.",
			)
			.addButton((btn) => {
				btn.setButtonText("Add").setCta().onClick(() => {
					void this.addIcsSource();
				});
			});

		const list = containerEl.createDiv({ cls: "byc-ics-list" });
		const sources = this.plugin.settings.icsSources;
		if (sources.length === 0) {
			list.createDiv({
				cls: "byc-ics-empty",
				text: "No Google calendars in data.json yet. Click Add, then paste an iCal URL.",
			});
			return;
		}
		sources.forEach((source, index) => {
			this.renderCompactSource(list, source, index);
		});
	}

	private renderCompactSource(containerEl: HTMLElement, source: IcsSource, index: number): void {
		const row = new Setting(containerEl);
		row.settingEl.addClass("byc-ics-compact");

		row.addColorPicker((picker) => {
			picker.setValue(source.color).onChange(async (value) => {
				source.color = value;
				await this.plugin.saveSettings();
			});
		});

		row.addText((text) => {
			text.setPlaceholder("Name").setValue(source.name).onChange(async (value) => {
				source.name = value;
				await this.plugin.saveSettings();
			});
			text.inputEl.addClass("byc-ics-name");
			text.inputEl.setAttribute("aria-label", "Calendar name");
		});

		row.addText((text) => {
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
			text.inputEl.setAttribute("aria-label", "ICS URL");
		});

		row.addToggle((toggle) => {
			toggle.setValue(source.enabled).onChange(async (value) => {
				source.enabled = value;
				await this.plugin.saveSettings();
			});
		});

		row.addExtraButton((btn) => {
			btn.setIcon("trash-2").setTooltip("Remove").onClick(() => {
				void this.removeIcsSource(index);
			});
		});
	}

	private async addIcsSource(): Promise<void> {
		const sources = this.plugin.settings.icsSources;
		sources.push({
			id: crypto.randomUUID(),
			name: "Google Calendar",
			url: "",
			color: PASTEL_COLORS[sources.length % PASTEL_COLORS.length] ?? "#A9C7E8",
			enabled: true,
		});
		await this.plugin.saveSettings();
		this.display();
	}

	private async removeIcsSource(index: number): Promise<void> {
		this.plugin.settings.icsSources.splice(index, 1);
		await this.plugin.saveSettings();
		this.display();
	}
}

function formatRefreshTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
}
