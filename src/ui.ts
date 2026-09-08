import { wireCellDrag } from "./drag";
import { div, el, mount, setCssProps } from "./dom";
import {
	buildYearGrid,
	formatEventTooltip,
	formatISODate,
	maxLanes,
	parseISODate,
	segmentsForMonth,
	weekdayLabel,
} from "./grid";
import { partitionCalendars } from "./calendar-paths";
import type { CalendarEvent, ViewMode, YearGrid } from "./types";
import {
	chevronLeft,
	chevronRight,
	compressIcon,
	emptyState,
	expandIcon,
	iconButton,
	padDay,
	refreshIcon,
	toggleMenu,
	viewLabel,
} from "./ui-helpers";

export interface CalendarUIState {
	year: number;
	mode: ViewMode;
	weekStartsOn: number;
	events: CalendarEvent[];
	eventsFolder: string;
	hiddenCalendars: Set<string>;
	search: string;
	todayIso: string;
	wideLayout: boolean;
	/** When true, scroll today’s cell into view after paint. */
	scrollToToday?: boolean;
}

export interface CalendarUIHandlers {
	onYearChange: (year: number) => void;
	onFocusToday: () => void;
	onModeChange: (mode: ViewMode) => void;
	onSearchChange: (query: string) => void;
	onToggleCalendar: (name: string) => void;
	onShowAllCalendars?: () => void;
	onToggleWideLayout: () => void;
	onEventClick: (event: CalendarEvent, anchor: HTMLElement) => void;
	onRangeSelect: (start: string, end: string) => void;
	onRefresh?: () => void;
}

export function renderCalendar(
	root: HTMLElement,
	state: CalendarUIState,
	handlers: CalendarUIHandlers,
): void {
	const restoreSearchFocus = document.activeElement?.classList.contains("byc-search-input");
	root.replaceChildren();
	root.classList.add("byc-root");
	root.classList.toggle("is-wide", state.wideLayout);

	const query = state.search.trim().toLowerCase();
	const hiddenCount = state.hiddenCalendars.size;
	const visibleEvents = filterVisibleEvents(state.events, state.hiddenCalendars, query);
	const { local, google } = partitionCalendars(state.events, state.eventsFolder);
	const calendars = [...local, ...google];
	const grid = buildYearGrid(state.year, state.mode, state.weekStartsOn, state.todayIso);
	const todayYear = Number(state.todayIso.slice(0, 4));
	const todayDate = parseISODate(state.todayIso);

	const { displayMenu, filtersMenu } = renderToolbar(
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

	if (state.scrollToToday && state.year === todayYear) {
		requestAnimationFrame(() => {
			root
				.querySelector<HTMLElement>(".byc-cell.is-today")
				?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
		});
	}

	if (restoreSearchFocus) {
		const searchInput = root.querySelector<HTMLInputElement>(".byc-search-input");
		if (searchInput) {
			searchInput.focus();
			searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
		}
	}

	bindMenuDismiss(root, [displayMenu, filtersMenu]);
}

const menuDismiss = new WeakMap<HTMLElement, { menus: HTMLElement[]; onClick: (event: MouseEvent) => void }>();

function bindMenuDismiss(root: HTMLElement, menus: HTMLElement[]): void {
	const existing = menuDismiss.get(root);
	if (existing) {
		existing.menus = menus;
		return;
	}
	const onClick = (event: MouseEvent) => {
		const state = menuDismiss.get(root);
		if (!state) return;
		const target = event.target as HTMLElement | null;
		if (target?.closest(".byc-menu-wrap")) return;
		for (const menu of state.menus) menu.classList.add("is-hidden");
	};
	menuDismiss.set(root, { menus, onClick });
	document.addEventListener("click", onClick);
}

export function teardownCalendarUi(root: HTMLElement): void {
	const state = menuDismiss.get(root);
	if (!state) return;
	document.removeEventListener("click", state.onClick);
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
): { displayMenu: HTMLElement; filtersMenu: HTMLElement } {
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
	const wideBtn = iconButton(
		right,
		state.wideLayout ? "Fit calendar to window" : "Expand calendar width",
		state.wideLayout ? compressIcon() : expandIcon(),
	);
	wideBtn.classList.add("byc-width-btn");
	if (state.wideLayout) wideBtn.classList.add("is-active");
	wideBtn.addEventListener("click", () => handlers.onToggleWideLayout());

	const searchWrap = mount(right, div("byc-search"));
	const searchInput = mount(
		searchWrap,
		el("input", {
			cls: "byc-search-input",
			type: "search",
			placeholder: "Search events",
		}),
	) as HTMLInputElement;
	searchInput.value = state.search;
	searchInput.addEventListener("input", () => handlers.onSearchChange(searchInput.value));

	const displayWrap = mount(right, div("byc-menu-wrap"));
	const displayBtn = mount(
		displayWrap,
		el("button", { cls: "byc-btn byc-view-btn", text: viewLabel(state.mode) }),
	);
	const displayMenu = mount(displayWrap, div("byc-menu byc-menu-compact is-hidden"));
	for (const [title, mode] of [
		["Stacked", "stacked"],
		["Linear", "linear"],
		["Column", "column"],
		["Col-Stack", "col-stack"],
	] as const) {
		addModeOption(displayMenu, title, mode, state.mode, handlers);
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
			text: filterLabel,
		}),
	);
	const filtersMenu = mount(filterWrap, div("byc-menu byc-menu-filters is-hidden"));
	renderFiltersMenu(filtersMenu, calendars, state, handlers);

	displayBtn.addEventListener("click", (event) => {
		event.stopPropagation();
		toggleMenu(displayMenu, filtersMenu);
	});
	filterBtn.addEventListener("click", (event) => {
		event.stopPropagation();
		toggleMenu(filtersMenu, displayMenu);
	});

	if (handlers.onRefresh) {
		iconButton(right, "Refresh ICS calendars", refreshIcon()).addEventListener("click", () =>
			handlers.onRefresh?.(),
		);
	}

	return { displayMenu, filtersMenu };
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
	const option = mount(menu, el("button", { cls: "byc-mode-option" }));
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

function mountEventBar(
	parent: HTMLElement,
	segment: ReturnType<typeof segmentsForMonth>[number],
	handlers: CalendarUIHandlers,
	column: boolean,
): void {
	const bar = mount(parent, div(column ? "byc-event byc-column-event" : "byc-event"));
	if (column) {
		bar.style.gridRow = `${segment.startCol + 1} / ${segment.endCol + 2}`;
		bar.style.gridColumn = String(segment.lane + 2);
	} else {
		bar.style.gridColumn = `${segment.startCol + 1} / ${segment.endCol + 2}`;
		bar.style.gridRow = String(segment.lane + 2);
	}
	bar.style.background = segment.event.color;
	bar.textContent = segment.event.title;
	bar.title = formatEventTooltip(segment.event);
	bar.addEventListener("click", (event) => {
		event.stopPropagation();
		handlers.onEventClick(segment.event, bar);
	});
	bar.addEventListener("pointerdown", (event) => event.stopPropagation());
}

export function defaultTodayIso(): string {
	return formatISODate(new Date());
}
