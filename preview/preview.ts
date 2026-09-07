import { renderCalendar } from "../src/ui";
import type { CalendarEvent, ViewMode } from "../src/types";

const events: CalendarEvent[] = [
	{
		id: "1",
		title: "Digital Declutter Month",
		start: "2026-06-12",
		end: "2026-07-09",
		color: "#E7A989",
		calendar: "Home",
	},
	{
		id: "2",
		title: "Home Office Makeover",
		start: "2026-06-24",
		end: "2026-07-15",
		color: "#A9C7E8",
		calendar: "Home",
	},
	{
		id: "3",
		title: "Midyear Review",
		start: "2026-07-17",
		end: "2026-07-21",
		color: "#C5B3E0",
		calendar: "Work",
	},
	{
		id: "4",
		title: "Couch to 5K Training",
		start: "2026-07-29",
		end: "2026-09-09",
		color: "#F0C987",
		calendar: "Health",
	},
	{
		id: "5",
		title: "Bathroom Tile Project",
		start: "2026-07-31",
		end: "2026-08-11",
		color: "#B5CDB0",
		calendar: "Home",
	},
	{
		id: "6",
		title: "Memorial Day at the Lake",
		start: "2026-08-19",
		end: "2026-08-21",
		color: "#9DC8C5",
		calendar: "Personal",
	},
	{
		id: "7",
		title: "🏃 5K Race Day",
		start: "2026-09-09",
		end: "2026-09-09",
		color: "#E8B4C4",
		calendar: "Health",
	},
	{
		id: "8",
		title: "Client Proposal Crunch",
		start: "2026-09-11",
		end: "2026-09-22",
		color: "#C5B3E0",
		calendar: "Work",
	},
	{
		id: "9",
		title: "🎂 Mom's 60th Birthday Party",
		start: "2026-09-16",
		end: "2026-09-16",
		color: "#E7A989",
		calendar: "Personal",
	},
	{
		id: "10",
		title: "Anniversary Weekend",
		start: "2026-09-29",
		end: "2026-10-01",
		color: "#A9C7E8",
		calendar: "Personal",
	},
	{
		id: "11",
		title: "Raised Garden Beds",
		start: "2026-10-02",
		end: "2026-10-15",
		color: "#B5CDB0",
		calendar: "Home",
	},
	{
		id: "12",
		title: "Work: Q3 Planning",
		start: "2026-10-09",
		end: "2026-10-20",
		color: "#D4B896",
		calendar: "Work",
	},
	{
		id: "13",
		title: "🏖️ Summer Break - Florida",
		start: "2026-10-28",
		end: "2026-11-04",
		color: "#9DC8C5",
		calendar: "Personal",
	},
];

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app");
const root: HTMLElement = app;

const state = {
	year: 2026,
	mode: "stacked" as ViewMode,
	weekStartsOn: 0,
	events,
	hiddenCalendars: new Set<string>(),
	search: "",
	todayIso: "2026-09-07",
	wideLayout: false,
	scrollToToday: true,
};

function paint(): void {
	const scrollToToday = state.scrollToToday;
	state.scrollToToday = false;
	renderCalendar(
		root,
		{ ...state, hiddenCalendars: new Set(state.hiddenCalendars), scrollToToday },
		{
			onYearChange: (year) => {
				state.year = year;
				if (year === Number(state.todayIso.slice(0, 4))) state.scrollToToday = true;
				paint();
			},
			onFocusToday: () => {
				const todayYear = Number(state.todayIso.slice(0, 4));
				if (state.year !== todayYear) {
					state.year = todayYear;
					state.scrollToToday = true;
					paint();
					return;
				}
				const cell = root.querySelector<HTMLElement>(".byc-cell.is-today");
				cell?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
			},
			onModeChange: (mode) => {
				state.mode = mode;
				paint();
			},
			onSearchChange: (query) => {
				state.search = query;
				paint();
			},
			onToggleWideLayout: () => {
				state.wideLayout = !state.wideLayout;
				paint();
			},
			onToggleCalendar: (name) => {
				if (state.hiddenCalendars.has(name)) state.hiddenCalendars.delete(name);
				else state.hiddenCalendars.add(name);
				paint();
			},
			onShowAllCalendars: () => {
				state.hiddenCalendars.clear();
				paint();
			},
			onEventClick: (event, _anchor) => {
				window.alert(`${event.title}\n${event.start} → ${event.end}`);
			},
			onRangeSelect: (start, end) => {
				window.alert(`Create event ${start} → ${end}`);
			},
		},
	);
}

paint();
