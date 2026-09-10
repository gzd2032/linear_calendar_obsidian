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
import { defaultTodayIso, NARROW_MAX_WIDTH_PX, renderCalendar, teardownCalendarUi } from "./ui";

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
	private narrow = false;
	private resizeObserver: ResizeObserver | null = null;
	/** True while an ICS import is running (toolbar + command). */
	importing = false;

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
		this.narrow =
			this.contentEl.clientWidth > 0 && this.contentEl.clientWidth <= NARROW_MAX_WIDTH_PX;
		const syncNarrow = (): void => {
			const next =
				this.contentEl.clientWidth > 0 && this.contentEl.clientWidth <= NARROW_MAX_WIDTH_PX;
			if (next === this.narrow) return;
			this.narrow = next;
			if (!this.closed) this.render();
		};
		this.resizeObserver = new ResizeObserver(() => syncNarrow());
		this.resizeObserver.observe(this.contentEl);
		this.register(() => {
			this.resizeObserver?.disconnect();
			this.resizeObserver = null;
		});
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
				narrow: this.narrow,
				icsImporting: this.importing,
				icsLastRefreshLabel: formatToolbarRefreshLabel(this.plugin.settings.lastIcsRefreshAt),
				icsRefreshStatusTitle: formatRefreshStatusTitle(this.plugin.settings.icsRefreshResults),
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
				onEventClick: (event, anchor, pointer) => {
					this.popover?.open(event, anchor, pointer);
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
			`.byc-event[data-event-id="${CSS.escape(openEventId)}"], .byc-list-event[data-event-id="${CSS.escape(openEventId)}"]`,
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
		if (this.importing) return;
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

		this.importing = true;
		this.render();

		const allDayOnly = this.plugin.settings.importAllDayOnly;
		let total = 0;
		let trashed = 0;
		const results: { name: string; ok: boolean; detail: string }[] = [];

		try {
			for (const source of sources) {
				try {
					const res = await requestUrl({
						url: normalizeIcsUrl(source.url),
						headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8" },
					});
					const text = icsTextFromResponse(res);
					if (!isIcsCalendar(text)) {
						results.push({ name: source.name, ok: false, detail: "URL is not an iCal feed" });
						continue;
					}
					const vevents = countVevents(text);
					const includingTimed = parseIcs(
						text,
						source.name,
						source.color,
						this.year,
						this.year,
						false,
					);
					const parsed = allDayOnly
						? parseIcs(text, source.name, source.color, this.year, this.year, true)
						: includingTimed;
					if (parsed.length === 0) {
						if (allDayOnly && includingTimed.length > 0) {
							results.push({
								name: source.name,
								ok: false,
								detail: `${includingTimed.length} timed events skipped — turn off All-day events only`,
							});
						} else if (vevents === 0) {
							results.push({ name: source.name, ok: false, detail: "feed has no events" });
						} else {
							results.push({
								name: source.name,
								ok: false,
								detail: `${vevents} in feed, none in ${this.year}`,
							});
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
					if (parsed.length > 0 || results.every((r) => r.name !== source.name)) {
						results.push({
							name: source.name,
							ok: true,
							detail: `${result.written} notes${result.trashed ? `, ${result.trashed} removed` : ""}`,
						});
					}
				} catch (error) {
					console.error(error);
					const detail =
						error instanceof Error && error.message ? error.message : "Check the ICS URL.";
					results.push({ name: source.name, ok: false, detail });
				}
			}

			const extra = trashed > 0 ? `, removed ${trashed} stale` : "";
			const summary = `Imported ${total} event notes for ${this.year}${extra}.`;
			const failures = results.filter((r) => !r.ok);
			if (failures.length > 0) {
				showMultilineNotice(
					[summary, ...failures.map((f) => `${f.name}: ${f.detail}`)],
					10000,
				);
			} else {
				new Notice(summary);
			}

			this.plugin.settings.lastIcsRefreshAt = new Date().toISOString();
			this.plugin.settings.icsRefreshResults = results;
			await this.plugin.saveSettings();
		} finally {
			this.importing = false;
			this.render();
		}
	}
}

function showMultilineNotice(lines: string[], timeout = 8000): void {
	const notice = new Notice("", timeout);
	const host = notice.messageEl;
	host.empty();
	for (const line of lines) {
		host.createDiv({ text: line });
	}
}

function formatToolbarRefreshLabel(iso: string): string | undefined {
	if (!iso) return undefined;
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return undefined;
	const when = date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
	return `Updated ${when}`;
}

function formatRefreshStatusTitle(
	results: { name: string; ok: boolean; detail: string }[] | undefined,
): string {
	if (!results?.length) return "";
	return results.map((r) => `${r.ok ? "OK" : "Fail"} · ${r.name}: ${r.detail}`).join("\n");
}
