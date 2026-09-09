import { ItemView, Notice, requestUrl, type WorkspaceLeaf } from "obsidian";
import { colorForName, endOnOrAfterStart, parseISODate } from "./grid";
import {
	countVevents,
	GOOGLE_HOLIDAYS_NAME,
	GOOGLE_US_HOLIDAYS_ICS_URL,
	icsTextFromResponse,
	isIcsCalendar,
	normalizeIcsUrl,
	parseIcs,
} from "./ics";
import type LinearYearCalendarPlugin from "./main";
import { EventCreateModal } from "./modal";
import {
	createEventNote,
	listEventNotes,
	localCalendarsForPicker,
	sanitizeCalendarName,
	upsertIcsNotes,
} from "./notes";
import { EventDetailPopover } from "./popover";
import type { CalendarEvent, ViewMode } from "./types";
import { defaultTodayIso, renderCalendar, teardownCalendarUi } from "./ui";

export const VIEW_TYPE = "linear-year-calendar";

export class YearCalendarView extends ItemView {
	plugin: LinearYearCalendarPlugin;
	year = new Date().getFullYear();
	mode: ViewMode;
	search = "";
	private todayIso = defaultTodayIso();
	private popover: EventDetailPopover | null = null;
	private scrollToToday = true;
	private closed = false;

	constructor(leaf: WorkspaceLeaf, plugin: LinearYearCalendarPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.mode = plugin.settings.defaultView;
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Year Calendar";
	}

	getIcon(): string {
		return "calendar-days";
	}

	async onOpen(): Promise<void> {
		this.closed = false;
		this.popover = new EventDetailPopover(
			this.app,
			() => this.render(),
			() =>
				localCalendarsForPicker(
					this.app,
					listEventNotes(this.app, this.plugin.settings.eventsFolder),
					this.plugin.settings.eventsFolder,
					this.plugin.settings.defaultCalendar,
				),
			() => this.plugin.settings.eventsFolder,
		);
		this.registerEvent(this.app.vault.on("create", () => this.scheduleRender()));
		this.registerEvent(this.app.vault.on("modify", () => this.scheduleRender()));
		this.registerEvent(this.app.vault.on("delete", () => this.scheduleRender()));
		this.registerEvent(this.app.vault.on("rename", () => this.scheduleRender()));
		this.registerEvent(this.app.metadataCache.on("resolved", () => this.scheduleRender()));
		this.render();
	}

	private renderTimer = 0;

	private scheduleRender(): void {
		window.clearTimeout(this.renderTimer);
		this.renderTimer = window.setTimeout(() => {
			if (this.closed) return;
			this.render();
		}, 80);
	}

	async onClose(): Promise<void> {
		this.closed = true;
		window.clearTimeout(this.renderTimer);
		teardownCalendarUi(this.contentEl);
		this.popover?.close();
		this.contentEl.empty();
	}

	render(): void {
		const openEventId = this.popover?.getOpenEventId() ?? null;
		const events = listEventNotes(this.app, this.plugin.settings.eventsFolder).filter(
			(event) =>
				this.plugin.settings.googleHolidaysEnabled || event.calendar !== GOOGLE_HOLIDAYS_NAME,
		);
		const scrollToToday = this.scrollToToday;
		this.scrollToToday = false;
		renderCalendar(
			this.contentEl,
			{
				year: this.year,
				mode: this.mode,
				weekStartsOn: this.plugin.settings.weekStartsOn,
				events,
				eventsFolder: this.plugin.settings.eventsFolder,
				icsCalendarNames: [
					...this.plugin.settings.icsSources.map((source) => source.name).filter(Boolean),
					...(this.plugin.settings.googleHolidaysEnabled ? [GOOGLE_HOLIDAYS_NAME] : []),
				],
				hiddenCalendars: new Set(this.plugin.settings.hiddenCalendars),
				search: this.search,
				todayIso: this.todayIso,
				wideLayout: this.plugin.settings.wideLayout,
				scrollToToday,
			},
			{
				onYearChange: (year) => {
					this.year = year;
					if (year === Number(this.todayIso.slice(0, 4))) {
						this.scrollToToday = true;
					}
					this.render();
				},
				onFocusToday: () => {
					const todayYear = Number(this.todayIso.slice(0, 4));
					if (this.year !== todayYear) {
						this.year = todayYear;
						this.scrollToToday = true;
						this.render();
						return;
					}
					const cell = this.contentEl.querySelector<HTMLElement>(".byc-cell.is-today");
					cell?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
				},
				onModeChange: (mode) => {
					this.mode = mode;
					this.plugin.settings.defaultView = mode;
					void this.plugin.saveSettings().then(() => this.render());
				},
				onSearchChange: (query) => {
					this.search = query;
					this.render();
				},
				onToggleWideLayout: () => {
					this.plugin.settings.wideLayout = !this.plugin.settings.wideLayout;
					void this.plugin.saveSettings().then(() => this.render());
				},
				onToggleCalendar: (name) => {
					const hidden = new Set(this.plugin.settings.hiddenCalendars);
					if (hidden.has(name)) hidden.delete(name);
					else hidden.add(name);
					this.plugin.settings.hiddenCalendars = [...hidden];
					void this.plugin.saveSettings().then(() => this.render());
				},
				onShowAllCalendars: () => {
					this.plugin.settings.hiddenCalendars = [];
					void this.plugin.saveSettings().then(() => this.render());
				},
				onEventClick: (event, anchor) => {
					this.popover?.open(event, anchor);
				},
				onRangeSelect: (start, end) => {
					this.openCreateModal(start, end, events);
				},
				onRefresh: () => {
					void this.refreshIcs();
				},
			},
		);
		this.syncOpenPopover(openEventId, events);
	}

	/** Keep popover open across re-renders; close if the event bar is gone. */
	private syncOpenPopover(openEventId: string | null, events: CalendarEvent[]): void {
		if (!openEventId || !this.popover) return;
		const event = events.find((item) => item.id === openEventId);
		const bar = this.contentEl.querySelector<HTMLElement>(
			`.byc-event[data-event-id="${CSS.escape(openEventId)}"]`,
		);
		if (!event || !bar) {
			this.popover.close();
			return;
		}
		this.popover.reanchor(event, bar);
	}

	private openCreateModal(start: string, end: string, events: CalendarEvent[]): void {
		const calendars = localCalendarsForPicker(
			this.app,
			events,
			this.plugin.settings.eventsFolder,
			this.plugin.settings.defaultCalendar,
		);
		new EventCreateModal(
			this.app,
			{
				title: "",
				start,
				end,
				color: colorForName(this.plugin.settings.defaultCalendar),
				calendar: this.plugin.settings.defaultCalendar,
				description: "",
			},
			calendars,
			(draft) => {
				void (async () => {
					if (!parseISODate(draft.start) || !parseISODate(draft.end)) {
						new Notice("Use YYYY-MM-DD dates.");
						return;
					}
					const calendar = sanitizeCalendarName(
						draft.calendar || this.plugin.settings.defaultCalendar,
					);
					const file = await createEventNote(this.app, this.plugin.settings.eventsFolder, {
						title: draft.title,
						start: draft.start,
						end: endOnOrAfterStart(draft.start, draft.end),
						color: draft.color,
						calendar,
						description: draft.description,
					});
					new Notice(`Created ${file.basename}`);
					this.render();
				})();
			},
		).open();
	}

	async refreshIcs(): Promise<void> {
		const sources = [
			...this.plugin.settings.icsSources.filter((source) => source.enabled && source.url),
			...(this.plugin.settings.googleHolidaysEnabled
				? [
						{
							id: "google-us-holidays",
							name: GOOGLE_HOLIDAYS_NAME,
							url: GOOGLE_US_HOLIDAYS_ICS_URL,
							color: this.plugin.settings.googleHolidaysColor,
							enabled: true,
						},
					]
				: []),
		];
		if (sources.length === 0) {
			new Notice("Add an ICS URL in Linear Year Calendar settings.");
			return;
		}
		const allDayOnly = this.plugin.settings.importAllDayOnly;
		let total = 0;
		let trashed = 0;
		const problems: string[] = [];
		for (const source of sources) {
			try {
				const res = await requestUrl({
					url: normalizeIcsUrl(source.url),
					headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8" },
				});
				const text = icsTextFromResponse(res);
				if (!isIcsCalendar(text)) {
					problems.push(`${source.name}: URL is not an iCal feed`);
					continue;
				}
				const vevents = countVevents(text);
				const includingTimed = parseIcs(text, source.name, source.color, this.year, this.year, false);
				const parsed = allDayOnly
					? parseIcs(text, source.name, source.color, this.year, this.year, true)
					: includingTimed;
				if (parsed.length === 0) {
					if (allDayOnly && includingTimed.length > 0) {
						problems.push(
							`${source.name}: ${includingTimed.length} timed events skipped — turn off All-day events only`,
						);
					} else if (vevents === 0) {
						problems.push(`${source.name}: feed has no events`);
					} else {
						problems.push(`${source.name}: ${vevents} in feed, none in ${this.year}`);
					}
				}
				const result = await upsertIcsNotes(
					this.app,
					this.plugin.settings.eventsFolder,
					source.name,
					source.color,
					parsed,
					this.year,
				);
				total += result.written;
				trashed += result.trashed;
			} catch (error) {
				console.error(error);
				const detail = error instanceof Error && error.message ? error.message : "Check the ICS URL.";
				problems.push(`${source.name}: ${detail}`);
			}
		}
		const extra = trashed > 0 ? `, removed ${trashed} stale` : "";
		const summary = `Imported ${total} event notes for ${this.year}${extra}.`;
		if (problems.length > 0) {
			new Notice(`${summary} ${problems.join(" ")}`, 8000);
		} else {
			new Notice(summary);
		}
		this.render();
	}
}
