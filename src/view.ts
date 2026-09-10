import { ItemView, Notice, type WorkspaceLeaf } from "obsidian";
import { colorForName, endOnOrAfterStart } from "./grid";
import { GOOGLE_HOLIDAYS_NAME } from "./ics";
import type LinearYearCalendarPlugin from "./main";
import { EventCreateModal } from "./modal";
import { createEventNote, listEventNotes, localCalendarsForPicker, sanitizeCalendarName } from "./notes";
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
				icsSources: this.plugin.settings.icsSources,
				defaultCalendar: this.plugin.settings.defaultCalendar,
				googleHolidaysEnabled: this.plugin.settings.googleHolidaysEnabled,
				googleHolidaysColor: this.plugin.settings.googleHolidaysColor,
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
					this.render();
					void this.plugin.saveSettings();
				},
				onSearchChange: (query) => {
					this.search = query;
					this.render();
				},
				onToggleWideLayout: () => {
					this.plugin.settings.wideLayout = !this.plugin.settings.wideLayout;
					void this.plugin.saveSettings().then(() => this.render());
				},
				onToggleCalendar: (id) => {
					const hidden = new Set(this.plugin.settings.hiddenCalendars);
					if (hidden.has(id)) hidden.delete(id);
					else hidden.add(id);
					this.plugin.settings.hiddenCalendars = [...hidden];
					this.render();
					void this.plugin.saveSettings();
				},
				onShowAllCalendars: () => {
					this.plugin.settings.hiddenCalendars = [];
					this.render();
					void this.plugin.saveSettings();
				},
				onHideAllCalendars: (ids) => {
					this.plugin.settings.hiddenCalendars = [...ids];
					this.render();
					void this.plugin.saveSettings();
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
				onOpenSettings: () => {
					const setting = (
						this.app as typeof this.app & {
							setting?: { open: () => void; openTabById: (id: string) => void };
						}
					).setting;
					setting?.open();
					setting?.openTabById(this.plugin.manifest.id);
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
			async (draft) => {
				const calendar = sanitizeCalendarName(
					draft.calendar || this.plugin.settings.defaultCalendar,
				);
				try {
					const file = await createEventNote(this.app, this.plugin.settings.eventsFolder, {
						title: draft.title.trim(),
						start: draft.start,
						end: endOnOrAfterStart(draft.start, draft.end),
						color: draft.color,
						calendar,
						description: draft.description,
					});
					new Notice(`Created ${file.basename}`);
					this.render();
				} catch (error) {
					console.error(error);
					throw new Error("Could not create event.");
				}
			},
		).open();
	}

	async refreshIcs(sourceId?: string): Promise<void> {
		await this.plugin.refreshIcs(sourceId);
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
