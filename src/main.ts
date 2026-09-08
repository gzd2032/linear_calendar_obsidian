import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LinearYearCalendarSettingTab } from "./settings";
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
			callback: () => {
				void this.refreshIcs();
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
			await leaf.view.refreshIcs();
			return;
		}
		new Notice("Open Linear Year Calendar first, then refresh.");
	}

	async loadSettings(): Promise<void> {
		const data = ((await this.loadData()) ?? {}) as Partial<PluginSettings>;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
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
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
