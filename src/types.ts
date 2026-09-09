export type ViewMode = "linear" | "stacked" | "column" | "col-stack";

export interface CalendarEvent {
	id: string;
	title: string;
	start: string;
	end: string;
	color: string;
	calendar: string;
	/** Note body after frontmatter / title heading. */
	description?: string;
	path?: string;
	icsUid?: string;
}

export interface IcsSource {
	id: string;
	name: string;
	url: string;
	color: string;
	enabled: boolean;
}

export interface PluginSettings {
	eventsFolder: string;
	weekStartsOn: number;
	defaultView: ViewMode;
	defaultCalendar: string;
	icsSources: IcsSource[];
	hiddenCalendars: string[];
	importAllDayOnly: boolean;
	googleHolidaysEnabled: boolean;
	googleHolidaysColor: string;
	wideLayout: boolean;
	settingsVersion: number;
}

export interface YearGrid {
	year: number;
	mode: ViewMode;
	colCount: number;
	headers: string[];
	months: MonthGrid[];
	/** Total days in the year (column view). */
	yearLength?: number;
}

export interface MonthGrid {
	month: number;
	label: string;
	startCol: number;
	cells: DayCell[];
	/** Day-of-year index (0-based) of the first day of this month (column view). */
	yearDayOffset?: number;
}

export interface DayCell {
	col: number;
	day: number;
	date: string;
	weekday: number;
	isWeekend: boolean;
	isToday: boolean;
	inMonth: boolean;
	/** Day-of-year index (0-based) for column view positioning. */
	yearDay?: number;
}

export interface EventSegment {
	event: CalendarEvent;
	startCol: number;
	endCol: number;
	lane: number;
}

export const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
export const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

export const PASTEL_COLORS = [
	"#E7A989",
	"#A9C7E8",
	"#C5B3E0",
	"#F0C987",
	"#B5CDB0",
	"#E8B4C4",
	"#9DC8C5",
	"#D4B896",
];
