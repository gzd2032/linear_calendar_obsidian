import { wireCellDrag } from "./drag";
import { div, el, mount, setCssProps } from "./dom";
import { contrastingTextColor } from "./format";
import {
	buildYearGrid,
	daysInMonth,
	formatEventRange,
	formatEventTooltip,
	formatISODate,
	maxLanes,
	monthLabel,
	pad2,
	parseISODate,
	segmentsForMonth,
	weekdayIndex,
	weekdayLabel,
} from "./grid";
import { partitionCalendars } from "./calendar-paths";
import type { CalendarEvent, ViewMode, YearGrid } from "./types";
import {
	chevronLeft,
	chevronRight,
	closeMenus,
	compressIcon,
	emptyState,
	expandIcon,
	iconButton,
	padDay,
	refreshIcon,
	spinnerIcon,
	toggleMenu,
	viewLabel,
} from "./ui-helpers";

/** Pane width at or below this uses the compact month-list layout. */
export const NARROW_MAX_WIDTH_PX = 768;

export interface CalendarUIState {
	year: number;
	mode: ViewMode;
	weekStartsOn: number;
	events: CalendarEvent[];
	eventsFolder: string;
	icsCalendarNames: string[];
	hiddenCalendars: Set<string>;
	search: string;
	todayIso: string;
	wideLayout: boolean;
	/** When true, scroll today’s cell into view after paint. */
	scrollToToday?: boolean;
	/** When true (pane ≤ {@link NARROW_MAX_WIDTH_PX}), render compact month-list. */
	narrow?: boolean;
	/** ICS refresh in flight — disable refresh control. */
	icsImporting?: boolean;
	/** Short label for last refresh time (toolbar). */
	icsLastRefreshLabel?: string;
	/** Tooltip / title with per-calendar refresh status. */
	icsRefreshStatusTitle?: string;
}

export interface CalendarUIHandlers {
	onYearChange: (year: number) => void;
	onFocusToday: () => void;
	onModeChange: (mode: ViewMode) => void;
	onSearchChange: (query: string) => void;
	onToggleCalendar: (name: string) => void;
	onShowAllCalendars?: () => void;
	onToggleWideLayout: () => void;
	onEventClick: (event: CalendarEvent, anchor: HTMLElement, pointer?: { x: number; y: number }) => void;
	onRangeSelect: (start: string, end: string) => void;
	onRefresh?: () => void;
}

const boardScrollMemory = new WeakMap<
	HTMLElement,
	{ year: number; layout: string; scrollTop: number; scrollLeft: number }
>();

export function renderCalendar(
	root: HTMLElement,
	state: CalendarUIState,
	handlers: CalendarUIHandlers,
): void {
	const restoreSearchFocus = document.activeElement?.classList.contains("byc-search-input");
	const narrow = Boolean(state.narrow);
	const layoutKey = narrow ? "list" : state.mode;
	const previous = boardScrollMemory.get(root);
	const oldBoard = root.querySelector<HTMLElement>(".byc-board");
	const savedScroll =
		oldBoard && previous && previous.year === state.year && previous.layout === layoutKey
			? { top: oldBoard.scrollTop, left: oldBoard.scrollLeft }
			: null;
	const restoreScroll = Boolean(savedScroll) && !state.scrollToToday;

	root.replaceChildren();
	root.classList.add("byc-root");
	root.classList.toggle("is-wide", state.wideLayout);
	root.classList.toggle("is-narrow", narrow);

	const query = state.search.trim().toLowerCase();
	const hiddenCount = state.hiddenCalendars.size;
	const visibleEvents = filterVisibleEvents(state.events, state.hiddenCalendars, query);
	const { local, google } = partitionCalendars(
		state.events,
		state.eventsFolder,
		state.icsCalendarNames,
	);
	const calendars = [...local, ...google];
	const todayYear = Number(state.todayIso.slice(0, 4));
	const todayDate = parseISODate(state.todayIso);

	const { menus, buttons } = renderToolbar(
		root,
		state,
		handlers,
		{ local, google, all: calendars },
		hiddenCount,
	);

	const board = mount(root, div("byc-board"));
	if (visibleEvents.length === 0 && state.events.length > 0 && (hiddenCount > 0 || Boolean(query))) {
		emptyState(board, {
			query: Boolean(query),
			hiddenCount,
			onShowAll: handlers.onShowAllCalendars,
		});
	}

	if (narrow) {
		renderMonthList(board, state.year, visibleEvents, state.todayIso, handlers);
	} else {
		const grid = buildYearGrid(state.year, state.mode, state.weekStartsOn, state.todayIso);
		if (grid.mode === "column" || grid.mode === "col-stack") {
			renderColumnBoard(board, grid, visibleEvents, handlers);
		} else {
			renderRowBoard(
				board,
				grid,
				visibleEvents,
				{
					todayDay: todayDate?.getDate() ?? -1,
					todayMonth: todayDate?.getMonth() ?? -1,
					todayWeekday: todayDate?.getDay() ?? -1,
					todayYear,
					year: state.year,
					weekStartsOn: state.weekStartsOn,
				},
				handlers,
			);
		}
	}

	if (restoreScroll && savedScroll) {
		board.scrollTop = savedScroll.top;
		board.scrollLeft = savedScroll.left;
		window.requestAnimationFrame(() => {
			board.scrollTop = savedScroll.top;
			board.scrollLeft = savedScroll.left;
		});
	} else if (state.scrollToToday && state.year === todayYear) {
		window.requestAnimationFrame(() => {
			const target = narrow
				? root.querySelector<HTMLElement>(".byc-list-day.is-today")
				: root.querySelector<HTMLElement>(".byc-cell.is-today");
			target?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
		});
	}

	boardScrollMemory.set(root, {
		year: state.year,
		layout: layoutKey,
		scrollTop: board.scrollTop,
		scrollLeft: board.scrollLeft,
	});

	if (restoreSearchFocus) {
		const searchInput = root.querySelector<HTMLInputElement>(".byc-search-input");
		if (searchInput) {
			searchInput.focus();
			searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
		}
	}

	bindMenuDismiss(root, menus, buttons);
}

const menuDismiss = new WeakMap<
	HTMLElement,
	{
		menus: HTMLElement[];
		buttons: HTMLButtonElement[];
		onClick: (event: MouseEvent) => void;
		onKeyDown: (event: KeyboardEvent) => void;
	}
>();

function bindMenuDismiss(
	root: HTMLElement,
	menus: HTMLElement[],
	buttons: HTMLButtonElement[],
): void {
	const existing = menuDismiss.get(root);
	if (existing) {
		existing.menus = menus;
		existing.buttons = buttons;
		return;
	}
	const onClick = (event: MouseEvent) => {
		const state = menuDismiss.get(root);
		if (!state) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest(".byc-menu-wrap")) return;
		closeMenus(state.menus, state.buttons);
	};
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key !== "Escape") return;
		const state = menuDismiss.get(root);
		if (!state) return;
		const anyOpen = state.menus.some((menu) => !menu.classList.contains("is-hidden"));
		if (!anyOpen) return;
		closeMenus(state.menus, state.buttons);
		event.preventDefault();
	};
	menuDismiss.set(root, { menus, buttons, onClick, onKeyDown });
	document.addEventListener("click", onClick);
	document.addEventListener("keydown", onKeyDown);
}

export function teardownCalendarUi(root: HTMLElement): void {
	const state = menuDismiss.get(root);
	if (!state) return;
	document.removeEventListener("click", state.onClick);
	document.removeEventListener("keydown", state.onKeyDown);
	menuDismiss.delete(root);
}

function filterVisibleEvents(
	events: CalendarEvent[],
	hidden: Set<string>,
	query: string,
): CalendarEvent[] {
	return events.filter((event) => {
		if (hidden.has(event.calendar)) return false;
		if (query && !event.title.toLowerCase().includes(query)) return false;
		return true;
	});
}

function renderToolbar(
	root: HTMLElement,
	state: CalendarUIState,
	handlers: CalendarUIHandlers,
	calendars: { local: string[]; google: string[]; all: string[] },
	hiddenCount: number,
): { menus: HTMLElement[]; buttons: HTMLButtonElement[] } {
	const toolbar = mount(root, div("byc-toolbar"));
	const left = mount(toolbar, div("byc-toolbar-left"));
	mount(left, el("h1", { cls: "byc-year", text: String(state.year) }));

	iconButton(left, "Previous year", chevronLeft()).addEventListener("click", () =>
		handlers.onYearChange(state.year - 1),
	);
	iconButton(left, "Next year", chevronRight()).addEventListener("click", () =>
		handlers.onYearChange(state.year + 1),
	);
	mount(
		left,
		el("button", {
			cls: "byc-chip byc-today-btn",
			type: "button",
			text: "Today",
			attr: { title: "Focus on today", "aria-label": "Focus on today" },
		}),
	).addEventListener("click", () => handlers.onFocusToday());

	const right = mount(toolbar, div("byc-toolbar-right"));
	const menus: HTMLElement[] = [];
	const buttons: HTMLButtonElement[] = [];

	// Width + Display only apply to grid layouts; narrow uses auto month-list.
	if (!state.narrow) {
		const wideBtn = iconButton(
			right,
			state.wideLayout ? "Fit calendar to window" : "Expand calendar width",
			state.wideLayout ? compressIcon() : expandIcon(),
		);
		wideBtn.classList.add("byc-width-btn");
		if (state.wideLayout) wideBtn.classList.add("is-active");
		wideBtn.addEventListener("click", () => handlers.onToggleWideLayout());
	}

	const searchWrap = mount(right, div("byc-search"));
	const searchInput = mount(
		searchWrap,
		el("input", {
			cls: "byc-search-input",
			type: "search",
			placeholder: "Search events",
			attr: { "aria-label": "Search events" },
		}),
	) as HTMLInputElement;
	searchInput.value = state.search;
	searchInput.addEventListener("input", () => handlers.onSearchChange(searchInput.value));

	let displayMenu: HTMLElement | null = null;
	let displayBtn: HTMLButtonElement | null = null;
	if (!state.narrow) {
		const displayWrap = mount(right, div("byc-menu-wrap"));
		displayBtn = mount(
			displayWrap,
			el("button", {
				cls: "byc-btn byc-view-btn",
				type: "button",
				text: viewLabel(state.mode),
				attr: {
					"aria-haspopup": "menu",
					"aria-expanded": "false",
					"aria-controls": "byc-display-menu",
				},
			}),
		) as HTMLButtonElement;
		displayMenu = mount(
			displayWrap,
			el("div", {
				cls: "byc-menu byc-menu-compact is-hidden",
				attr: { id: "byc-display-menu", role: "menu" },
			}),
		);
		for (const [title, mode] of [
			["Stacked", "stacked"],
			["Linear", "linear"],
			["Column", "column"],
			["Col-Stack", "col-stack"],
		] as const) {
			addModeOption(displayMenu, title, mode, state.mode, handlers);
		}
		menus.push(displayMenu);
		buttons.push(displayBtn);
	}

	const filterWrap = mount(right, div("byc-menu-wrap"));
	const visibleCount = calendars.all.filter((name) => !state.hiddenCalendars.has(name)).length;
	const filterLabel =
		hiddenCount > 0
			? `Filters · ${hiddenCount} hidden`
			: `Filters ${visibleCount}/${calendars.all.length || 0}`;
	const filterBtn = mount(
		filterWrap,
		el("button", {
			cls: `byc-btn byc-btn-accent${hiddenCount > 0 ? " is-filtering" : ""}`,
			type: "button",
			text: filterLabel,
			attr: {
				"aria-haspopup": "menu",
				"aria-expanded": "false",
				"aria-controls": "byc-filters-menu",
			},
		}),
	) as HTMLButtonElement;
	const filtersMenu = mount(
		filterWrap,
		el("div", {
			cls: "byc-menu byc-menu-filters is-hidden",
			attr: { id: "byc-filters-menu", role: "menu" },
		}),
	);
	renderFiltersMenu(filtersMenu, calendars, state, handlers);
	menus.push(filtersMenu);
	buttons.push(filterBtn);

	if (displayBtn && displayMenu) {
		displayBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			toggleMenu(displayMenu, filtersMenu, displayBtn, filterBtn);
		});
		filterBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			toggleMenu(filtersMenu, displayMenu, filterBtn, displayBtn);
		});
	} else {
		filterBtn.addEventListener("click", (event) => {
			event.stopPropagation();
			filtersMenu.classList.toggle("is-hidden");
			filterBtn.setAttribute(
				"aria-expanded",
				filtersMenu.classList.contains("is-hidden") ? "false" : "true",
			);
		});
	}

	if (handlers.onRefresh) {
		const importing = Boolean(state.icsImporting);
		if (importing) {
			const busy = mount(
				right,
				el("button", {
					cls: "byc-icon-btn byc-refresh-btn is-importing",
					type: "button",
					text: "",
					attr: {
						disabled: "true",
						"aria-busy": "true",
						"aria-label": "Importing…",
						title: "Importing…",
					},
				}),
			) as HTMLButtonElement;
			busy.appendChild(spinnerIcon());
			busy.appendChild(el("span", { cls: "byc-refresh-label", text: "Importing…" }));
		} else {
			const btn = iconButton(right, "Refresh ICS calendars", refreshIcon());
			btn.classList.add("byc-refresh-btn");
			btn.addEventListener("click", () => handlers.onRefresh?.());
		}
		if (state.icsLastRefreshLabel) {
			mount(
				right,
				el("span", {
					cls: "byc-refresh-meta",
					text: state.icsLastRefreshLabel,
					attr: {
						title: state.icsRefreshStatusTitle || state.icsLastRefreshLabel,
					},
				}),
			);
		}
	}

	return { menus, buttons };
}

function renderFiltersMenu(
	filtersMenu: HTMLElement,
	calendars: { local: string[]; google: string[]; all: string[] },
	state: CalendarUIState,
	handlers: CalendarUIHandlers,
): void {
	if (calendars.all.length === 0) {
		mount(filtersMenu, div("byc-menu-empty", "No calendars yet"));
		return;
	}
	renderFilterSection(filtersMenu, "Local", calendars.local, state, handlers);
	renderFilterSection(filtersMenu, "Google", calendars.google, state, handlers);
	if (state.hiddenCalendars.size > 0 && handlers.onShowAllCalendars) {
		mount(
			filtersMenu,
			el("button", { cls: "byc-menu-action", type: "button", text: "Show all calendars" }),
		).addEventListener("click", () => handlers.onShowAllCalendars?.());
	}
}

function renderFilterSection(
	filtersMenu: HTMLElement,
	label: string,
	names: string[],
	state: CalendarUIState,
	handlers: CalendarUIHandlers,
): void {
	if (names.length === 0) return;
	mount(filtersMenu, div("byc-filter-section", label));
	for (const name of names) {
		const row = mount(filtersMenu, el("label", { cls: "byc-filter-row" }));
		const checkbox = mount(row, el("input", { type: "checkbox" })) as HTMLInputElement;
		checkbox.checked = !state.hiddenCalendars.has(name);
		checkbox.addEventListener("change", () => handlers.onToggleCalendar(name));
		mount(row, el("span", { text: name }));
		const swatch = mount(row, el("span", { cls: "byc-swatch" }));
		swatch.style.background =
			state.events.find((event) => event.calendar === name)?.color ?? "#A9C7E8";
	}
}

function addModeOption(
	menu: HTMLElement,
	title: string,
	mode: ViewMode,
	active: ViewMode,
	handlers: CalendarUIHandlers,
): void {
	const option = mount(
		menu,
		el("button", {
			cls: "byc-mode-option",
			type: "button",
			attr: { role: "menuitem" },
		}),
	);
	if (mode === active) option.classList.add("is-active");
	option.textContent = title;
	option.addEventListener("click", () => handlers.onModeChange(mode));
}

interface TodayMarks {
	todayDay: number;
	todayMonth: number;
	todayWeekday: number;
	todayYear: number;
	year: number;
	weekStartsOn: number;
}

function renderColumnBoard(
	board: HTMLElement,
	grid: YearGrid,
	events: CalendarEvent[],
	handlers: CalendarUIHandlers,
): void {
	const wrap = mount(board, div("byc-column-wrap"));
	if (grid.mode === "col-stack") wrap.classList.add("is-col-stack");
	const monthsRow = mount(wrap, div("byc-column-months"));

	if (grid.mode === "col-stack") {
		const gutter = mount(monthsRow, div("byc-column-gutter"));
		mount(gutter, div("byc-column-month-label", ""));
		const gutterDays = mount(gutter, div("byc-column-days byc-column-gutter-days"));
		const rowCount = grid.months[0]?.cells.length ?? 0;
		setCssProps(gutterDays, {
			"--byc-month-days": String(rowCount),
			"--byc-lanes": "1",
		});
		for (const cell of grid.months[0]?.cells ?? []) {
			const label = mount(gutterDays, div("byc-column-gutter-label"));
			label.style.gridRow = String(cell.col + 1);
			if (cell.isWeekend) label.classList.add("is-weekend");
			label.textContent = weekdayLabel(cell.weekday);
		}
	}

	for (const month of grid.months) {
		const segments = segmentsForMonth(grid, month.month, events);
		const lanes = maxLanes(segments);
		const col = mount(monthsRow, div("byc-column-month"));
		mount(col, div("byc-column-month-label", month.label));
		const body = mount(col, div("byc-column-days"));
		body.style.setProperty("--byc-month-days", String(month.cells.length));
		body.style.setProperty("--byc-lanes", String(lanes));

		for (const cell of month.cells) {
			const cellEl = mount(body, div("byc-cell byc-column-cell"));
			cellEl.style.gridRow = String(cell.col + 1);
			if (cell.isWeekend) cellEl.classList.add("is-weekend");
			if (cell.isToday) cellEl.classList.add("is-today");
			if (!cell.inMonth) cellEl.classList.add("is-empty");
			if (cell.date) cellEl.dataset.date = cell.date;
			if (cell.inMonth) {
				mount(cellEl, div("byc-daynum", padDay(cell.day)));
				wireCellDrag(cellEl, cell.date, wrap, handlers.onRangeSelect);
			}
		}

		for (const segment of segments) {
			mountEventBar(body, segment, handlers, true);
		}
	}
}

function renderRowBoard(
	board: HTMLElement,
	grid: YearGrid,
	events: CalendarEvent[],
	today: TodayMarks,
	handlers: CalendarUIHandlers,
): void {
	const table = mount(board, div(`byc-table is-${grid.mode}`));
	table.style.setProperty("--byc-cols", String(grid.colCount));
	const wide = board.closest(".byc-root")?.classList.contains("is-wide") ?? false;
	const headPx = wide ? 20 : 18;
	const lanePx = wide ? 28 : grid.mode === "linear" ? 24 : 22;
	const padPx = 4;
	const showToday = today.year === today.todayYear;

	const headerRow = mount(table, div("byc-header-row"));
	mount(headerRow, div("byc-month-label byc-month-label-spacer"));
	const headerCells = mount(headerRow, div("byc-header-cells"));
	grid.headers.forEach((label, col) => {
		const header = mount(headerCells, div("byc-header-cell", label));
		if (grid.mode !== "stacked" || !showToday) return;
		const weekday = (today.weekStartsOn + col) % 7;
		if (weekday === 0 || weekday === 6) header.classList.add("is-weekend");
		if (weekday === today.todayWeekday) header.classList.add("is-today");
	});

	for (const month of grid.months) {
		const segments = segmentsForMonth(grid, month.month, events);
		const lanes = Math.max(1, maxLanes(segments));
		const rowHeight = headPx + lanes * lanePx + padPx;
		const isTodayMonth = showToday && month.month === today.todayMonth;

		const row = mount(table, div("byc-month-row"));
		row.style.setProperty("--byc-lanes", String(lanes));
		const monthLabelEl = mount(row, div("byc-month-label", month.label));
		if (isTodayMonth) monthLabelEl.classList.add("is-today");

		const body = mount(row, div("byc-month-body"));
		body.style.setProperty("--byc-lanes", String(lanes));
		body.style.gridTemplateRows = `${headPx}px repeat(${lanes}, ${lanePx}px) ${padPx}px`;
		body.style.height = `${rowHeight}px`;
		body.style.minHeight = `${rowHeight}px`;
		body.style.maxHeight = `${rowHeight}px`;

		for (const cell of month.cells) {
			const cellEl = mount(body, div("byc-cell"));
			cellEl.style.gridColumn = String(cell.col + 1);
			if (cell.col === 0) cellEl.classList.add("is-first-col");
			if (cell.isWeekend) cellEl.classList.add("is-weekend");
			if (cell.isToday) cellEl.classList.add("is-today");
			if (
				grid.mode === "linear" &&
				showToday &&
				cell.inMonth &&
				cell.day === today.todayDay &&
				!cell.isToday
			) {
				cellEl.classList.add("is-today-col");
			}
			if (!cell.inMonth) cellEl.classList.add("is-empty");
			if (cell.date) cellEl.dataset.date = cell.date;
			if (cell.inMonth) {
				if (grid.mode === "linear") {
					mount(cellEl, div("byc-daynum byc-dow-cell", weekdayLabel(cell.weekday)));
				} else {
					mount(cellEl, div("byc-daynum", padDay(cell.day)));
				}
			}
			wireCellDrag(cellEl, cell.date, table, handlers.onRangeSelect);
		}

		for (const segment of segments) {
			mountEventBar(body, segment, handlers, false);
		}
	}
}

function eventsOverlappingMonth(
	events: CalendarEvent[],
	year: number,
	month: number,
): CalendarEvent[] {
	const monthStart = `${year}-${pad2(month + 1)}-01`;
	const monthEnd = `${year}-${pad2(month + 1)}-${pad2(daysInMonth(year, month))}`;
	return events
		.filter((event) => event.start <= monthEnd && event.end >= monthStart)
		.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

function listDateLabel(event: CalendarEvent, year: number, month: number): string {
	const monthStart = `${year}-${pad2(month + 1)}-01`;
	const monthEnd = `${year}-${pad2(month + 1)}-${pad2(daysInMonth(year, month))}`;
	const start = event.start < monthStart ? monthStart : event.start;
	const end = event.end > monthEnd ? monthEnd : event.end;
	const startDay = Number(start.slice(8, 10));
	const endDay = Number(end.slice(8, 10));
	if (start === end) return String(startDay);
	return `${startDay}–${endDay}`;
}

function createIsoForEventInMonth(event: CalendarEvent, year: number, month: number): string {
	const monthStart = `${year}-${pad2(month + 1)}-01`;
	const monthEnd = `${year}-${pad2(month + 1)}-${pad2(daysInMonth(year, month))}`;
	if (event.start >= monthStart && event.start <= monthEnd) return event.start;
	return monthStart;
}

/** Compact year list for narrow panes: month title + day rows with events. */
function renderMonthList(
	board: HTMLElement,
	year: number,
	events: CalendarEvent[],
	todayIso: string,
	handlers: CalendarUIHandlers,
): void {
	const list = mount(board, div("byc-month-list"));
	for (let month = 0; month < 12; month++) {
		const section = mount(list, el("section", { cls: "byc-list-month" }));
		const heading = mount(
			section,
			el("h2", { cls: "byc-list-month-title", text: monthLabel(month) }),
		);
		if (todayIso.startsWith(`${year}-${pad2(month + 1)}`)) {
			heading.classList.add("is-today");
		}

		const monthEvents = eventsOverlappingMonth(events, year, month);
		if (monthEvents.length === 0) {
			const empty = mount(
				section,
				el("button", {
					cls: "byc-list-row byc-list-empty",
					type: "button",
					text: "Tap to add an event",
				}),
			) as HTMLButtonElement;
			const dayIso = `${year}-${pad2(month + 1)}-01`;
			empty.addEventListener("click", () => handlers.onRangeSelect(dayIso, dayIso));
			continue;
		}

		const byDay = new Map<string, CalendarEvent[]>();
		for (const event of monthEvents) {
			const dayIso = createIsoForEventInMonth(event, year, month);
			const bucket = byDay.get(dayIso) ?? [];
			bucket.push(event);
			byDay.set(dayIso, bucket);
		}

		for (const dayIso of [...byDay.keys()].sort()) {
			const dayEvents = byDay.get(dayIso) ?? [];
			const row = mount(section, div("byc-list-row"));
			row.dataset.date = dayIso;
			if (dayIso === todayIso) row.classList.add("is-today");
			row.addEventListener("click", () => handlers.onRangeSelect(dayIso, dayIso));

			const dayNum = Number(dayIso.slice(8, 10));
			const dow = weekdayLabel(weekdayIndex(year, month, dayNum));
			mount(row, el("span", { cls: "byc-list-day", text: `${dayNum}` }));
			mount(row, el("span", { cls: "byc-list-dow", text: dow }));

			const eventsWrap = mount(row, div("byc-list-events"));
			for (const event of dayEvents) {
				const label =
					event.start === event.end
						? event.title
						: `${event.title} (${listDateLabel(event, year, month)})`;
				const eventBtn = mount(
					eventsWrap,
					el("button", {
						cls: "byc-list-event",
						type: "button",
						text: label,
						title: formatEventTooltip(event),
						attr: {
							"aria-label": `${event.title}, ${formatEventRange(event.start, event.end)}`,
							"data-event-id": event.id,
						},
					}),
				) as HTMLButtonElement;
				eventBtn.style.background = event.color;
				eventBtn.style.color = contrastingTextColor(event.color);
				eventBtn.addEventListener("click", (ev) => {
					ev.stopPropagation();
					handlers.onEventClick(event, eventBtn, { x: ev.clientX, y: ev.clientY });
				});
			}
		}
	}
}

function mountEventBar(
	parent: HTMLElement,
	segment: ReturnType<typeof segmentsForMonth>[number],
	handlers: CalendarUIHandlers,
	column: boolean,
): void {
	const range = formatEventRange(segment.event.start, segment.event.end);
	const bar = mount(
		parent,
		el("button", {
			cls: column ? "byc-event byc-column-event" : "byc-event",
			type: "button",
			text: segment.event.title,
			title: formatEventTooltip(segment.event),
			attr: {
				"aria-label": `${segment.event.title}, ${range}`,
			},
		}),
	) as HTMLButtonElement;
	if (column) {
		bar.style.gridRow = `${segment.startCol + 1} / ${segment.endCol + 2}`;
		bar.style.gridColumn = String(segment.lane + 2);
	} else {
		bar.style.gridColumn = `${segment.startCol + 1} / ${segment.endCol + 2}`;
		bar.style.gridRow = String(segment.lane + 2);
	}
	bar.dataset.eventId = segment.event.id;
	bar.style.background = segment.event.color;
	bar.style.color = contrastingTextColor(segment.event.color);
	bar.addEventListener("click", (event) => {
		event.stopPropagation();
		handlers.onEventClick(segment.event, bar, { x: event.clientX, y: event.clientY });
	});
	bar.addEventListener("pointerdown", (event) => event.stopPropagation());
}

export function defaultTodayIso(): string {
	return formatISODate(new Date());
}
