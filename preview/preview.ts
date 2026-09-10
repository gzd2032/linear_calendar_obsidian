import "./obsidian-dom-shim";
import { renderCalendar } from "../src/ui";
import type { CalendarEvent, ViewMode } from "../src/types";

const events: CalendarEvent[] = [
	{
		id: "1",
		title: "New Year Reset Week",
		start: "2026-01-01",
		end: "2026-01-07",
		color: "#E7A989",
		calendar: "Personal",
	},
	{
		id: "2",
		title: "Q1 Planning Offsite",
		start: "2026-01-20",
		end: "2026-01-22",
		color: "#C5B3E0",
		calendar: "Work",
		path: "Calendar/google/Work/q1-planning.md",
		icsUid: "q1-planning@google.com",
	},
	{
		id: "3",
		title: "Tax Prep Sprint",
		start: "2026-02-09",
		end: "2026-02-20",
		color: "#D4B896",
		calendar: "Home",
	},
	{
		id: "4",
		title: "Valentine's Weekend",
		start: "2026-02-13",
		end: "2026-02-15",
		color: "#E8B4C4",
		calendar: "Personal",
	},
	{
		id: "5",
		title: "Tokyo, Japan",
		start: "2026-03-02",
		end: "2026-03-09",
		color: "#F0C987",
		calendar: "Personal",
	},
	{
		id: "6",
		title: "Kitchen Deep Clean",
		start: "2026-03-16",
		end: "2026-03-20",
		color: "#B5CDB0",
		calendar: "Home",
	},
	{
		id: "6b",
		title: "Lisbon, Portugal",
		start: "2026-03-28",
		end: "2026-04-04",
		color: "#E8B4C4",
		calendar: "Personal",
	},
	{
		id: "7",
		title: "Client Kickoff — Northstar",
		start: "2026-04-06",
		end: "2026-04-08",
		color: "#C5B3E0",
		calendar: "Work",
	},
	{
		id: "8",
		title: "🌱 Garden Planting Weekend",
		start: "2026-04-24",
		end: "2026-04-26",
		color: "#B5CDB0",
		calendar: "Home",
	},
	{
		id: "9",
		title: "Company All-Hands",
		start: "2026-05-12",
		end: "2026-05-12",
		color: "#C5B3E0",
		calendar: "Work",
		path: "Calendar/google/Work/all-hands.md",
		icsUid: "all-hands@google.com",
	},
	{
		id: "10",
		title: "Cabin Weekend Upstate",
		start: "2026-05-22",
		end: "2026-05-25",
		color: "#9DC8C5",
		calendar: "Personal",
	},
	{
		id: "11",
		title: "Rome, Italy",
		start: "2026-06-01",
		end: "2026-06-08",
		color: "#F0C987",
		calendar: "Personal",
	},
	{
		id: "12",
		title: "Deck Staining Project",
		start: "2026-06-15",
		end: "2026-07-03",
		color: "#A9C7E8",
		calendar: "Home",
	},
	{
		id: "12b",
		title: "Barcelona, Spain",
		start: "2026-07-04",
		end: "2026-07-11",
		color: "#E8B4C4",
		calendar: "Personal",
	},
	{
		id: "12c",
		title: "Cape Town, South Africa",
		start: "2026-08-03",
		end: "2026-08-12",
		color: "#F0C987",
		calendar: "Personal",
	},
	{
		id: "13",
		title: "Product Roadmap Week",
		start: "2026-07-13",
		end: "2026-07-17",
		color: "#C5B3E0",
		calendar: "Work",
	},
	{
		id: "14",
		title: "🏖️ Coast Trip — Maine",
		start: "2026-07-25",
		end: "2026-08-02",
		color: "#9DC8C5",
		calendar: "Personal",
	},
	{
		id: "15",
		title: "Closet Remodel",
		start: "2026-08-10",
		end: "2026-08-21",
		color: "#B5CDB0",
		calendar: "Home",
	},
	{
		id: "16",
		title: "Launch Readiness Push",
		start: "2026-09-08",
		end: "2026-09-18",
		color: "#C5B3E0",
		calendar: "Work",
	},
	{
		id: "17",
		title: "🎂 Family Reunion Dinner",
		start: "2026-09-19",
		end: "2026-09-19",
		color: "#E7A989",
		calendar: "Personal",
	},
	{
		id: "18",
		title: "Leaf-Peeping Weekend",
		start: "2026-10-02",
		end: "2026-10-04",
		color: "#A9C7E8",
		calendar: "Personal",
	},
	{
		id: "19",
		title: "Q4 Planning",
		start: "2026-10-12",
		end: "2026-10-16",
		color: "#D4B896",
		calendar: "Work",
	},
	{
		id: "20",
		title: "Fall Yard Cleanup",
		start: "2026-11-06",
		end: "2026-11-08",
		color: "#B5CDB0",
		calendar: "Home",
	},
	{
		id: "21",
		title: "Thanksgiving Travel",
		start: "2026-11-25",
		end: "2026-11-29",
		color: "#E7A989",
		calendar: "Personal",
	},
	{
		id: "22",
		title: "Holiday Gift Wrapping",
		start: "2026-12-18",
		end: "2026-12-20",
		color: "#E8B4C4",
		calendar: "Home",
	},
	{
		id: "23",
		title: "Year-End Shutdown",
		start: "2026-12-24",
		end: "2026-12-31",
		color: "#9DC8C5",
		calendar: "Personal",
	},
];

const app = document.getElementById("app");
if (!app) throw new Error("Missing #app");
const root: HTMLElement = app;

const statusNode = document.getElementById("preview-status");
if (!statusNode) throw new Error("Missing #preview-status");
const statusEl: HTMLElement = statusNode;

function setPreviewStatus(message: string): void {
	statusEl.textContent = message;
	statusEl.hidden = !message;
}

const state = {
	year: 2026,
	mode: "stacked" as ViewMode,
	weekStartsOn: 0,
	events,
	eventsFolder: "Calendar",
	icsCalendarNames: ["Work"],
	hiddenCalendars: new Set<string>(),
	search: "",
	todayIso: "2026-09-07",
	wideLayout: false,
	scrollToToday: true,
	narrow: false,
};

function paint(): void {
	const scrollToToday = state.scrollToToday;
	state.scrollToToday = false;
	state.narrow = root.clientWidth > 0 && root.clientWidth <= 768;
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
				setPreviewStatus(`Event: ${event.title} · ${event.start} → ${event.end}`);
			},
			onRangeSelect: (start, end) => {
				setPreviewStatus(`Create event ${start} → ${end}`);
			},
		},
	);
}

paint();
{
	let lastNarrow = state.narrow;
	new ResizeObserver(() => {
		const next = root.clientWidth > 0 && root.clientWidth <= 768;
		if (next === lastNarrow) return;
		lastNarrow = next;
		paint();
	}).observe(root);
}
