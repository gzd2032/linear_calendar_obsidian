import { sanitizeFilename } from "./format";
import type { CalendarEvent } from "./types";

/** Reserved folder name under the events root for ICS imports. */
export const GOOGLE_FOLDER = "google";

function joinPath(...parts: string[]): string {
	return parts
		.join("/")
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/\/$/, "");
}

export function sanitizeCalendarName(name: string): string {
	const cleaned = sanitizeFilename(name.trim() || "Personal");
	if (cleaned.toLowerCase() === GOOGLE_FOLDER) return "Personal";
	return cleaned;
}

export function localCalendarFolder(eventsFolder: string, calendarName: string): string {
	return joinPath(eventsFolder, sanitizeCalendarName(calendarName));
}

export function googleCalendarFolder(eventsFolder: string, sourceName: string): string {
	return joinPath(eventsFolder, GOOGLE_FOLDER, sanitizeFilename(sourceName.trim() || "Google"));
}

/** True when the note lives under the google/ import tree. */
export function isGooglePath(path: string | undefined, eventsFolder: string): boolean {
	if (!path) return false;
	const root = joinPath(eventsFolder);
	const googleRoot = joinPath(root, GOOGLE_FOLDER);
	const file = joinPath(path);
	return file === googleRoot || file.startsWith(`${googleRoot}/`);
}

/** Google SoT events: under google/ or tagged with an ICS uid. */
export function isGoogleEvent(
	event: Pick<CalendarEvent, "path" | "icsUid">,
	eventsFolder: string,
): boolean {
	if (event.icsUid) return true;
	return isGooglePath(event.path, eventsFolder);
}

export function googleCalendarDayUrl(isoStart: string): string | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoStart.trim());
	if (!match) return null;
	const year = match[1];
	const month = String(Number(match[2]));
	const day = String(Number(match[3]));
	return `https://calendar.google.com/calendar/r/day/${year}/${month}/${day}`;
}

export function localCalendarNames(
	events: CalendarEvent[],
	eventsFolder: string,
	defaultCalendar: string,
): string[] {
	const names = new Set<string>();
	names.add(sanitizeCalendarName(defaultCalendar));
	for (const event of events) {
		if (isGoogleEvent(event, eventsFolder)) continue;
		names.add(sanitizeCalendarName(event.calendar));
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}

export function partitionCalendars(
	events: CalendarEvent[],
	eventsFolder: string,
): { local: string[]; google: string[] } {
	const local = new Set<string>();
	const google = new Set<string>();
	for (const event of events) {
		const name = event.calendar || "Personal";
		if (isGoogleEvent(event, eventsFolder)) google.add(name);
		else local.add(name);
	}
	return {
		local: [...local].sort((a, b) => a.localeCompare(b)),
		google: [...google].sort((a, b) => a.localeCompare(b)),
	};
}
