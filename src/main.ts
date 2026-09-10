import { Notice, Plugin } from "obsidian";
import { asIcsSources, DEFAULT_SETTINGS, LinearYearCalendarSettingTab } from "./settings";
import type { PluginSettings } from "./types";
import { VIEW_TYPE, YearCalendarView } from "./view";

export default class LinearYearCalendarPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE, (leaf) => new YearCalendarView(leaf, this));

		this.addRibbonIcon("calendar-days", "Open Linear Year Calendar", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-year-calendar",
			name: "Open year calendar",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "refresh-ics",
			name: "Refresh ICS calendars",
			checkCallback: (checking) => {
				const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
				const view = leaf?.view instanceof YearCalendarView ? leaf.view : null;
				const busy = Boolean(view?.importing);
				if (checking) return Boolean(view) && !busy;
				if (!view) {
					new Notice("Open Linear Year Calendar first, then refresh.");
					return false;
				}
				if (busy) return false;
				void view.refreshIcs();
				return true;
			},
		});

		this.addSettingTab(new LinearYearCalendarSettingTab(this.app, this));
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (existing) {
			void workspace.revealLeaf(existing);
			return;
		}
		const leaf = workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		void workspace.revealLeaf(leaf);
	}

	refreshViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			const view = leaf.view;
			if (view instanceof YearCalendarView) {
				view.mode = this.settings.defaultView;
				view.render();
			}
		}
	}

	async refreshIcs(): Promise<void> {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (leaf?.view instanceof YearCalendarView) {
			if (leaf.view.importing) return;
			await leaf.view.refreshIcs();
			return;
		}
		new Notice("Open Linear Year Calendar first, then refresh.");
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Partial<PluginSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		this.settings.icsSources = asIcsSources(data.icsSources);
		// v2: product default is Stacked (older installs may have saved Linear)
		if ((data.settingsVersion ?? 0) < 2) {
			this.settings.defaultView = "stacked";
			this.settings.settingsVersion = 2;
			await this.saveSettings();
		}
		// v3: Google ICS under Calendar/google/; local calendars under Calendar/<Name>/
		if ((data.settingsVersion ?? 0) < 3) {
			this.settings.settingsVersion = 3;
			await this.saveSettings();
		}
		// v4: import timed Google events (they render as one-day bars)
		if ((data.settingsVersion ?? 0) < 4) {
			this.settings.importAllDayOnly = false;
			this.settings.settingsVersion = 4;
			await this.saveSettings();
		}
		// v5: optional built-in Google US holiday calendar
		if ((data.settingsVersion ?? 0) < 5) {
			this.settings.settingsVersion = 5;
			await this.saveSettings();
		}
		// v6: ICS refresh status fields
		if ((data.settingsVersion ?? 0) < 6) {
			this.settings.lastIcsRefreshAt = this.settings.lastIcsRefreshAt ?? "";
			this.settings.icsRefreshResults = Array.isArray(this.settings.icsRefreshResults)
				? this.settings.icsRefreshResults
				: [];
			this.settings.settingsVersion = 6;
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
