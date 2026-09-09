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

/** Merge calendar name groups into a sorted local-only list. */
export function mergeLocalCalendarNames(...groups: string[][]): string[] {
	const names = new Set<string>();
	for (const group of groups) {
		for (const name of group) {
			if (!name.trim()) continue;
			names.add(sanitizeCalendarName(name));
		}
	}
	return [...names].sort((a, b) => a.localeCompare(b));
}

/** Filename of `currentPath` placed under `destFolder`. */
export function notePathInFolder(currentPath: string, destFolder: string): string {
	const slash = currentPath.replace(/\\/g, "/").lastIndexOf("/");
	const name = slash >= 0 ? currentPath.slice(slash + 1) : currentPath;
	return joinPath(destFolder, name || "note.md");
}

/** Append ` 2`, ` 3`, … before the extension when `desiredPath` is taken. */
export function uniqueNotePath(desiredPath: string, exists: (path: string) => boolean): string {
	if (!exists(desiredPath)) return desiredPath;
	const md = desiredPath.toLowerCase().endsWith(".md");
	const base = md ? desiredPath.slice(0, -3) : desiredPath;
	const ext = md ? ".md" : "";
	let n = 2;
	let candidate = `${base} ${n}${ext}`;
	while (exists(candidate)) {
		n += 1;
		candidate = `${base} ${n}${ext}`;
	}
	return candidate;
}

export function partitionCalendars(
	events: CalendarEvent[],
	eventsFolder: string,
	icsSourceNames: string[] = [],
): { local: string[]; google: string[] } {
	const local = new Set<string>();
	const google = new Set<string>();
	for (const event of events) {
		const name = event.calendar || "Personal";
		if (isGoogleEvent(event, eventsFolder)) google.add(name);
		else local.add(name);
	}
	for (const name of icsSourceNames) {
		if (name.trim()) google.add(name.trim());
	}
	return {
		local: [...local].sort((a, b) => a.localeCompare(b)),
		google: [...google].sort((a, b) => a.localeCompare(b)),
	};
}

/** Calendar name from `Calendar/<Name>/note` or `Calendar/google/<Name>/note`. */
export function calendarNameFromPath(path: string, eventsFolder: string): string {
	const root = joinPath(eventsFolder);
	const file = joinPath(path);
	const rest =
		file === root || file.startsWith(`${root}/`) ? file.slice(root.length).replace(/^\//, "") : file;
	const parts = rest.split("/").filter(Boolean);
	if (parts.length === 0) return "Personal";
	if (parts[0]?.toLowerCase() === GOOGLE_FOLDER) {
		return sanitizeFilename(parts[1] || "Google");
	}
	return sanitizeCalendarName(parts[0] ?? "Personal");
}

/** When Properties have not indexed yet, recover an event from `YYYY-MM-DD title.md`. */
export function eventFromNoteFilename(input: {
	path: string;
	basename: string;
	heading?: string;
	eventsFolder: string;
}): CalendarEvent | null {
	const match = /^(\d{4}-\d{2}-\d{2})(?:\s+(.*))?$/.exec(input.basename);
	const start = match?.[1];
	if (!start) return null;
	const title = (input.heading || match[2] || "Untitled").trim() || "Untitled";
	const calendar = calendarNameFromPath(input.path, input.eventsFolder);
	return {
		id: input.path,
		title,
		start,
		end: start,
		color: "#A9C7E8",
		calendar,
		path: input.path,
	};
}
