import { Notice, Plugin } from "obsidian";
import { GOOGLE_HOLIDAYS_NAME, GOOGLE_US_HOLIDAYS_ICS_URL, icsUrlIssue } from "./ics";
import { runIcsImport, showIcsImportNotice, testIcsFeed } from "./ics-import";
import { asIcsSources, DEFAULT_SETTINGS, LinearYearCalendarSettingTab } from "./settings";
import type { IcsSource, PluginSettings } from "./types";
import { VIEW_TYPE, YearCalendarView } from "./view";

export default class LinearYearCalendarPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	/** True while any ICS test/import is running. */
	icsBusy = false;

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
				const busy = Boolean(view?.importing) || this.icsBusy;
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

	calendarView(): YearCalendarView | null {
		const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		return leaf?.view instanceof YearCalendarView ? leaf.view : null;
	}

	calendarYear(): number {
		return this.calendarView()?.year ?? new Date().getFullYear();
	}

	async testIcsSource(source: IcsSource): Promise<void> {
		if (this.icsBusy) return;
		if (!source.url.trim()) {
			new Notice("Paste an ICS URL first.");
			return;
		}
		const issue = icsUrlIssue(source.url);
		if (issue) {
			new Notice(issue);
			return;
		}
		this.icsBusy = true;
		try {
			const result = await testIcsFeed(source.url, this.calendarYear());
			new Notice(`${source.name}: ${result.detail}`);
		} catch (error) {
			console.error(error);
			const detail =
				error instanceof Error && error.message ? error.message : "Could not fetch ICS.";
			new Notice(`${source.name}: ${detail}`);
		} finally {
			this.icsBusy = false;
		}
	}

	async refreshIcs(sourceId?: string): Promise<void> {
		if (this.icsBusy) return;
		const view = this.calendarView();
		if (view?.importing) return;
		const sources = this.sourcesForRefresh(sourceId);
		if (sources.length === 0) {
			new Notice(
				sourceId ? "Paste an ICS URL first." : "Add an ICS URL in Linear Year Calendar settings.",
			);
			return;
		}
		if (sourceId) {
			const issue = icsUrlIssue(sources[0]?.url ?? "");
			if (issue) {
				new Notice(issue);
				return;
			}
		}

		const year = this.calendarYear();
		this.icsBusy = true;
		if (view) {
			view.importing = true;
			view.render();
		}

		try {
			const { total, trashed, results } = await runIcsImport({
				app: this.app,
				eventsFolder: this.settings.eventsFolder,
				allDayOnly: this.settings.importAllDayOnly,
				year,
				sources,
			});
			showIcsImportNotice(year, total, trashed, results);
			this.settings.lastIcsRefreshAt = new Date().toISOString();
			if (sourceId) {
				const names = new Set(results.map((row) => row.name));
				this.settings.icsRefreshResults = [
					...(this.settings.icsRefreshResults ?? []).filter((row) => !names.has(row.name)),
					...results,
				];
			} else {
				this.settings.icsRefreshResults = results;
			}
			await this.saveSettings();
		} finally {
			this.icsBusy = false;
			if (view) {
				view.importing = false;
				view.render();
			} else {
				this.refreshViews();
			}
		}
	}

	private sourcesForRefresh(sourceId?: string): IcsSource[] {
		if (sourceId) {
			const source = this.settings.icsSources.find((row) => row.id === sourceId);
			if (!source?.url.trim()) return [];
			return [source];
		}
		return [
			...this.settings.icsSources.filter((source) => source.enabled && source.url),
			...(this.settings.googleHolidaysEnabled
				? [
						{
							id: "google-us-holidays",
							name: GOOGLE_HOLIDAYS_NAME,
							url: GOOGLE_US_HOLIDAYS_ICS_URL,
							color: this.settings.googleHolidaysColor,
							enabled: true,
						},
					]
				: []),
		];
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
