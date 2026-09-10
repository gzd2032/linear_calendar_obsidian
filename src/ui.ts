import { wireCellDrag } from "./drag";
import { div, el, mount, setCssProps } from "./dom";
import { contrastingTextColor } from "./format";
import {
	MAX_VISIBLE_LANES,
	buildYearGrid,
	daysInMonth,
	eventsAtCol,
	formatEventRange,
	formatEventTooltip,
	formatISODate,
	formatShortDate,
	hasOverflowLanes,
	monthLabel,
	overflowCountAtCol,
	pad2,
	parseISODate,
	segmentsForMonth,
	visibleLaneCount,
	weekdayIndex,
	weekdayLabel,
} from "./grid";
import { calendarFilterId, listFilterCalendars } from "./calendar-paths";
import type { CalendarEvent, FilterCalendar, IcsSource, ViewMode, YearGrid } from "./types";
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
	viewBlurb,
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
	icsSources: IcsSource[];
	defaultCalendar: string;
	googleHolidaysEnabled: boolean;
	googleHolidaysColor: string;
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
	onToggleCalendar: (id: string) => void;
	onShowAllCalendars?: () => void;
	onHideAllCalendars?: (ids: string[]) => void;
	onToggleWideLayout: () => void;
	onEventClick: (event: CalendarEvent, anchor: HTMLElement, pointer?: { x: number; y: number }) => void;
	onRangeSelect: (start: string, end: string) => void;
	onRefresh?: () => void;
	onOpenSettings?: () => void;
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

	closeMoreMenu();

	root.replaceChildren();
	root.classList.add("byc-root");
	root.classList.toggle("is-wide", state.wideLayout);
	root.classList.toggle("is-narrow", narrow);

	const query = state.search.trim().toLowerCase();
	const { local, google } = listFilterCalendars({
		events: state.events,
		eventsFolder: state.eventsFolder,
		icsSources: state.icsSources,
		defaultCalendar: state.defaultCalendar,
		googleHolidaysEnabled: state.googleHolidaysEnabled,
		googleHolidaysColor: state.googleHolidaysColor,
	});
	const calendars = { local, google, all: [...local, ...google] };
	const hiddenCount = calendars.all.filter((cal) => state.hiddenCalendars.has(cal.id)).length;
	const visibleEvents = filterVisibleEvents(
		state.events,
		state.hiddenCalendars,
		query,
		state.eventsFolder,
		state.icsSources,
	);
	const todayYear = Number(state.todayIso.slice(0, 4));
	const todayDate = parseISODate(state.todayIso);

	const { menus, buttons } = renderToolbar(
		root,
		state,
		handlers,
		calendars,
		hiddenCount,
	);

	const host = mount(root, div("byc-board-host"));
	const board = mount(host, div("byc-board"));
	const queryActive = Boolean(query);
	const yearEvents = visibleEvents.filter((event) => eventOverlapsYear(event, state.year));
	if (state.events.length === 0) {
		emptyState(board, {
			kind: "onboarding",
			onOpenSettings: handlers.onOpenSettings,
			onRefresh: handlers.onRefresh,
		});
	} else if (visibleEvents.length === 0 && (hiddenCount > 0 || queryActive)) {
		board.classList.add("has-empty-overlay");
		emptyState(host, {
			kind: "filtered",
			query: queryActive,
			hiddenCount,
			onShowAll: handlers.onShowAllCalendars,
		});
	} else if (yearEvents.length === 0) {
		emptyState(host, {
			kind: "empty-year",
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
	closeMoreMenu();
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
	eventsFolder: string,
	icsSources: IcsSource[],
): CalendarEvent[] {
	return events.filter((event) => {
		if (hidden.has(calendarFilterId(event, eventsFolder, icsSources))) return false;
		if (query && !event.title.toLowerCase().includes(query)) return false;
		return true;
	});
}

function eventOverlapsYear(event: CalendarEvent, year: number): boolean {
	const start = `${year}-01-01`;
	const end = `${year}-12-31`;
	return event.start <= end && event.end >= start;
}

function renderToolbar(
	root: HTMLElement,
	state: CalendarUIState,
	handlers: CalendarUIHandlers,
	calendars: { local: FilterCalendar[]; google: FilterCalendar[]; all: FilterCalendar[] },
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
			attr: { "aria-label": "Focus on today" },
		}),
	).addEventListener("click", () => handlers.onFocusToday());

	if (state.icsLastRefreshLabel) {
		mount(
			left,
			el("span", {
				cls: "byc-refresh-meta",
				text: state.icsLastRefreshLabel,
				attr: {
					title: state.icsRefreshStatusTitle || state.icsLastRefreshLabel,
				},
			}),
		);
	}

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
	const visibleCount = calendars.all.filter((cal) => !state.hiddenCalendars.has(cal.id)).length;
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
	}

	return { menus, buttons };
}

function renderFiltersMenu(
	filtersMenu: HTMLElement,
	calendars: { local: FilterCalendar[]; google: FilterCalendar[]; all: FilterCalendar[] },
	state: CalendarUIState,
	handlers: CalendarUIHandlers,
): void {
	if (calendars.all.length === 0) {
		mount(filtersMenu, div("byc-menu-empty", "No calendars yet"));
		return;
	}
	renderFilterSection(filtersMenu, "Local", calendars.local, state, handlers);
	renderFilterSection(filtersMenu, "Google", calendars.google, state, handlers);
	const actions = mount(filtersMenu, div("byc-filter-actions"));
	if (handlers.onShowAllCalendars) {
		const showAll = mount(
			actions,
			el("button", { cls: "byc-menu-action", type: "button", text: "Show all" }),
		);
		showAll.toggleAttribute("disabled", state.hiddenCalendars.size === 0);
		showAll.addEventListener("click", () => handlers.onShowAllCalendars?.());
	}
	if (handlers.onHideAllCalendars) {
		const hideAll = mount(
			actions,
			el("button", { cls: "byc-menu-action", type: "button", text: "Hide all" }),
		);
		const allHidden =
			calendars.all.length > 0 && calendars.all.every((cal) => state.hiddenCalendars.has(cal.id));
		hideAll.toggleAttribute("disabled", allHidden);
		hideAll.addEventListener("click", () =>
			handlers.onHideAllCalendars?.(calendars.all.map((cal) => cal.id)),
		);
	}
}

function renderFilterSection(
	filtersMenu: HTMLElement,
	label: string,
	calendars: FilterCalendar[],
	state: CalendarUIState,
	handlers: CalendarUIHandlers,
): void {
	if (calendars.length === 0) return;
	mount(filtersMenu, div("byc-filter-section", label));
	for (const calendar of calendars) {
		const row = mount(
			filtersMenu,
			el("label", {
				cls: `byc-filter-row${calendar.imported ? "" : " is-not-imported"}`,
			}),
		);
		const checkbox = mount(row, el("input", { type: "checkbox" })) as HTMLInputElement;
		checkbox.checked = !state.hiddenCalendars.has(calendar.id);
		checkbox.addEventListener("change", () => handlers.onToggleCalendar(calendar.id));
		mount(row, el("span", { cls: "byc-filter-name", text: calendar.name }));
		mount(
			row,
			el("span", {
				cls: "byc-filter-meta",
				text: calendar.imported ? `(${calendar.eventCount})` : "(not imported)",
			}),
		);
		const swatch = mount(row, el("span", { cls: "byc-swatch" }));
		swatch.style.background = calendar.color;
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
			attr: {
				role: "menuitem",
				"aria-label": viewBlurb(mode),
			},
		}),
	);
	if (mode === active) {
		option.classList.add("is-active");
		option.setAttribute("aria-current", "true");
	}
	const head = mount(option, div("byc-mode-option-head"));
	mount(head, el("span", { cls: "byc-mode-check", text: mode === active ? "✓" : "" }));
	mount(head, el("span", { cls: "byc-mode-option-title", text: title }));
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
		const lanes = visibleLaneCount(segments);
		const overflow = hasOverflowLanes(segments);
		const laneCols = lanes + (overflow ? 1 : 0);
		const col = mount(monthsRow, div("byc-column-month"));
		mount(col, div("byc-column-month-label", month.label));
		const body = mount(col, div("byc-column-days"));
		body.style.setProperty("--byc-month-days", String(month.cells.length));
		body.style.setProperty("--byc-lanes", String(laneCols));

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
			if (segment.lane >= MAX_VISIBLE_LANES) continue;
			mountEventBar(body, segment, handlers, true);
		}
		if (overflow) {
			for (const cell of month.cells) {
				if (!cell.inMonth || !cell.date) continue;
				const hidden = overflowCountAtCol(segments, cell.col);
				if (hidden === 0) continue;
				mountMoreChip(body, {
					column: true,
					col: cell.col,
					lanes,
					count: hidden,
					date: cell.date,
					events: eventsAtCol(segments, cell.col),
					handlers,
				});
			}
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
	const lanePx = wide ? 32 : grid.mode === "linear" ? 28 : 26;
	const morePx = 14;
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
		const lanes = visibleLaneCount(segments);
		const overflow = hasOverflowLanes(segments);
		const overflowRows = overflow ? 1 : 0;
		const rowHeight = headPx + lanes * lanePx + overflowRows * morePx + padPx;
		const isTodayMonth = showToday && month.month === today.todayMonth;

		const row = mount(table, div("byc-month-row"));
		row.style.setProperty("--byc-lanes", String(lanes + overflowRows));
		const monthLabelEl = mount(row, div("byc-month-label", month.label));
		if (isTodayMonth) monthLabelEl.classList.add("is-today");

		const body = mount(row, div("byc-month-body"));
		body.style.setProperty("--byc-lanes", String(lanes + overflowRows));
		const laneRows = overflow
			? `${headPx}px repeat(${lanes}, ${lanePx}px) ${morePx}px ${padPx}px`
			: `${headPx}px repeat(${lanes}, ${lanePx}px) ${padPx}px`;
		body.style.gridTemplateRows = laneRows;
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
			if (segment.lane >= MAX_VISIBLE_LANES) continue;
			mountEventBar(body, segment, handlers, false);
		}
		if (overflow) {
			for (const cell of month.cells) {
				if (!cell.inMonth || !cell.date) continue;
				const hidden = overflowCountAtCol(segments, cell.col);
				if (hidden === 0) continue;
				mountMoreChip(body, {
					column: false,
					col: cell.col,
					lanes,
					count: hidden,
					date: cell.date,
					events: eventsAtCol(segments, cell.col),
					handlers,
				});
			}
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
			const visible = dayEvents.slice(0, MAX_VISIBLE_LANES);
			const hidden = dayEvents.slice(MAX_VISIBLE_LANES);
			for (const event of visible) {
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
						attr: {
							"data-event-id": event.id,
						},
					}),
				) as HTMLButtonElement;
				suppressNativeTooltip(eventBtn);
				eventBtn.style.background = event.color;
				eventBtn.style.color = contrastingTextColor(event.color);
				wireEventHoverTip(eventBtn, formatEventTooltip(event));
				eventBtn.addEventListener("click", (ev) => {
					ev.stopPropagation();
					hideEventHoverTip();
					handlers.onEventClick(event, eventBtn, { x: ev.clientX, y: ev.clientY });
				});
			}
			if (hidden.length > 0) {
				const more = mount(
					eventsWrap,
					el("button", {
						cls: "byc-more",
						type: "button",
						text: `+${hidden.length} more`,
						attr: {
							"aria-label": moreChipLabel(hidden.length, dayIso),
						},
					}),
				) as HTMLButtonElement;
				more.addEventListener("click", (ev) => {
					ev.stopPropagation();
					openMoreMenu(more, dayIso, dayEvents, handlers);
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
	const tipText = formatEventTooltip(segment.event);
	const bar = mount(
		parent,
		el("button", {
			cls: column ? "byc-event byc-column-event" : "byc-event",
			type: "button",
			text: segment.event.title,
		}),
	) as HTMLButtonElement;
	mount(bar, el("span", { cls: "byc-sr-only", text: `, ${range}` }));
	suppressNativeTooltip(bar);
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
	wireEventHoverTip(bar, tipText);
	bar.addEventListener("click", (event) => {
		event.stopPropagation();
		hideEventHoverTip();
		handlers.onEventClick(segment.event, bar, { x: event.clientX, y: event.clientY });
	});
	bar.addEventListener("pointerdown", (event) => event.stopPropagation());
}

function moreChipLabel(count: number, date: string): string {
	return `${count} more event${count === 1 ? "" : "s"} on ${formatShortDate(date)}`;
}

function mountMoreChip(
	parent: HTMLElement,
	opts: {
		column: boolean;
		col: number;
		lanes: number;
		count: number;
		date: string;
		events: CalendarEvent[];
		handlers: CalendarUIHandlers;
	},
): void {
	const chip = mount(
		parent,
		el("button", {
			cls: opts.column ? "byc-more byc-column-more" : "byc-more",
			type: "button",
			text: `+${opts.count} more`,
			attr: {
				"aria-label": moreChipLabel(opts.count, opts.date),
			},
		}),
	) as HTMLButtonElement;
	if (opts.column) {
		chip.style.gridRow = String(opts.col + 1);
		chip.style.gridColumn = String(opts.lanes + 2);
	} else {
		chip.style.gridColumn = String(opts.col + 1);
		chip.style.gridRow = String(opts.lanes + 2);
	}
	chip.addEventListener("pointerdown", (event) => event.stopPropagation());
	chip.addEventListener("click", (event) => {
		event.stopPropagation();
		openMoreMenu(chip, opts.date, opts.events, opts.handlers);
	});
}

let moreMenu: HTMLElement | null = null;
let moreMenuOnDoc: ((event: MouseEvent) => void) | null = null;
let moreMenuOnKey: ((event: KeyboardEvent) => void) | null = null;

function closeMoreMenu(): void {
	if (moreMenuOnDoc) {
		document.removeEventListener("mousedown", moreMenuOnDoc);
		moreMenuOnDoc = null;
	}
	if (moreMenuOnKey) {
		document.removeEventListener("keydown", moreMenuOnKey);
		moreMenuOnKey = null;
	}
	moreMenu?.remove();
	moreMenu = null;
}

function openMoreMenu(
	anchor: HTMLElement,
	date: string,
	events: CalendarEvent[],
	handlers: CalendarUIHandlers,
): void {
	closeMoreMenu();
	const menu = mount(
		document.body,
		el("div", {
			cls: "byc-more-menu",
			attr: { role: "dialog", "aria-label": formatShortDate(date) },
		}),
	);
	moreMenu = menu;
	mount(menu, div("byc-more-menu-title", formatShortDate(date)));
	const list = mount(menu, div("byc-more-menu-list"));
	for (const event of events) {
		const row = mount(
			list,
			el("button", {
				cls: "byc-more-menu-event",
				type: "button",
				text: event.title,
			}),
		) as HTMLButtonElement;
		row.style.background = event.color;
		row.style.color = contrastingTextColor(event.color);
		row.addEventListener("click", (ev) => {
			ev.stopPropagation();
			closeMoreMenu();
			handlers.onEventClick(event, row, { x: ev.clientX, y: ev.clientY });
		});
	}
	const rect = anchor.getBoundingClientRect();
	const pad = 8;
	let left = rect.left;
	let top = rect.bottom + 4;
	menu.style.left = `${left}px`;
	menu.style.top = `${top}px`;
	window.requestAnimationFrame(() => {
		const w = menu.offsetWidth;
		const h = menu.offsetHeight;
		left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
		if (top + h > window.innerHeight - pad) {
			top = Math.max(pad, rect.top - h - 4);
		}
		menu.style.left = `${left}px`;
		menu.style.top = `${top}px`;
	});
	moreMenuOnDoc = (event: MouseEvent) => {
		const target = event.target as Node | null;
		if (menu.contains(target) || anchor.contains(target)) return;
		closeMoreMenu();
	};
	moreMenuOnKey = (event: KeyboardEvent) => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		closeMoreMenu();
		anchor.focus();
	};
	window.setTimeout(() => {
		if (moreMenuOnDoc) document.addEventListener("mousedown", moreMenuOnDoc);
		if (moreMenuOnKey) document.addEventListener("keydown", moreMenuOnKey);
	}, 0);
}

let eventHoverTip: HTMLElement | null = null;
let eventHoverTipTimer: number | null = null;
let eventHoverTipPending: { text: string; x: number; y: number } | null = null;

/** Strip native/Obsidian tooltips (they center on long multi-day bars). */
function suppressNativeTooltip(target: HTMLElement): void {
	target.removeAttribute("title");
	target.removeAttribute("aria-label");
	target.removeAttribute("data-tooltip");
	target.removeAttribute("aria-describedby");
	// Empty title blocks Chromium’s truncated-text overflow tip on some builds.
	target.title = "";
	hideForeignTooltips();
}

function hideForeignTooltips(): void {
	document.querySelectorAll(".tooltip").forEach((node) => {
		if (node === eventHoverTip) return;
		node.remove();
	});
}

function wireEventHoverTip(target: HTMLElement, text: string): void {
	suppressNativeTooltip(target);
	target.addEventListener("pointerenter", (event) => {
		suppressNativeTooltip(target);
		scheduleEventHoverTip(text, event.clientX, event.clientY);
	});
	target.addEventListener("pointermove", (event) => {
		suppressNativeTooltip(target);
		if (eventHoverTip && !eventHoverTip.hidden) {
			placeEventHoverTip(event.clientX, event.clientY);
		} else {
			scheduleEventHoverTip(text, event.clientX, event.clientY);
		}
	});
	target.addEventListener("pointerleave", () => {
		hideEventHoverTip();
	});
}

function scheduleEventHoverTip(text: string, clientX: number, clientY: number): void {
	eventHoverTipPending = { text, x: clientX, y: clientY };
	if (eventHoverTipTimer !== null) return;
	eventHoverTipTimer = window.setTimeout(() => {
		eventHoverTipTimer = null;
		const pending = eventHoverTipPending;
		if (!pending) return;
		showEventHoverTip(pending.text, pending.x, pending.y);
	}, 280);
}

function showEventHoverTip(text: string, clientX: number, clientY: number): void {
	if (!eventHoverTip) {
		eventHoverTip = el("div", {
			cls: "byc-event-hover-tip is-end-right",
			attr: { role: "tooltip" },
		});
		mount(eventHoverTip, el("div", { cls: "byc-event-hover-tip-arrow" }));
		mount(eventHoverTip, el("div", { cls: "byc-event-hover-tip-text" }));
		document.body.appendChild(eventHoverTip);
	}
	const textEl = eventHoverTip.querySelector(".byc-event-hover-tip-text");
	if (textEl) textEl.textContent = text;
	eventHoverTip.hidden = false;
	placeEventHoverTip(clientX, clientY);
}

function placeEventHoverTip(clientX: number, clientY: number): void {
	if (!eventHoverTip || eventHoverTip.hidden) return;
	if (eventHoverTipPending) {
		eventHoverTipPending.x = clientX;
		eventHoverTipPending.y = clientY;
	}
	const pad = 22;
	const w = eventHoverTip.offsetWidth || 180;
	const h = eventHoverTip.offsetHeight || 40;
	let left = clientX + pad;
	let side: "right" | "left" = "right";
	if (left + w > window.innerWidth - 8) {
		left = clientX - w - pad;
		side = "left";
	}
	let top = clientY - h / 2;
	if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
	if (top < 8) top = 8;
	const arrowY = Math.min(h - 10, Math.max(10, clientY - top));
	eventHoverTip.classList.toggle("is-end-right", side === "right");
	eventHoverTip.classList.toggle("is-end-left", side === "left");
	eventHoverTip.style.left = `${left}px`;
	eventHoverTip.style.top = `${Math.max(8, top)}px`;
	setCssProps(eventHoverTip, { "--byc-tip-arrow-y": `${arrowY}px` });
}

function hideEventHoverTip(): void {
	eventHoverTipPending = null;
	if (eventHoverTipTimer !== null) {
		window.clearTimeout(eventHoverTipTimer);
		eventHoverTipTimer = null;
	}
	if (eventHoverTip) eventHoverTip.hidden = true;
}

export function defaultTodayIso(): string {
	return formatISODate(new Date());
}
