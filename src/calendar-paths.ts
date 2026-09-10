import { sanitizeFilename } from "./format";
import type { CalendarEvent, FilterCalendar, IcsSource } from "./types";

const LOCAL_FILTER_PREFIX = "local:";
const GOOGLE_FILTER_PREFIX = "google:";
const GOOGLE_NAME_FILTER_PREFIX = "google:name:";
const DEFAULT_FILTER_COLOR = "#A9C7E8";
const DEFAULT_HOLIDAYS_NAME = "Google Holidays";
const DEFAULT_HOLIDAYS_SOURCE_ID = "google-us-holidays";

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

function sourceMatchingName(icsSources: IcsSource[], name: string): IcsSource | undefined {
	const trimmed = name.trim();
	return icsSources.find((source) => source.name.trim() === trimmed);
}

/** Stable hide/show key: `local:Personal` or `google:<source-id>`. */
export function calendarFilterId(
	event: Pick<CalendarEvent, "calendar" | "path" | "icsUid">,
	eventsFolder: string,
	icsSources: IcsSource[],
	holidaysName = DEFAULT_HOLIDAYS_NAME,
	holidaysSourceId = DEFAULT_HOLIDAYS_SOURCE_ID,
): string {
	const name = event.calendar?.trim() || "Personal";
	if (!isGoogleEvent(event, eventsFolder)) {
		return `${LOCAL_FILTER_PREFIX}${sanitizeCalendarName(name)}`;
	}
	if (name === holidaysName) {
		return `${GOOGLE_FILTER_PREFIX}${holidaysSourceId}`;
	}
	const source = sourceMatchingName(icsSources, name);
	if (source) return `${GOOGLE_FILTER_PREFIX}${source.id}`;
	return `${GOOGLE_NAME_FILTER_PREFIX}${sanitizeFilename(name)}`;
}

function isPrefixedFilterId(value: string): boolean {
	return value.startsWith(LOCAL_FILTER_PREFIX) || value.startsWith(GOOGLE_FILTER_PREFIX);
}

/** Expand pre-v7 hidden names (`Work`) into `local:` + matching `google:` ids. */
export function migrateHiddenCalendarIds(
	hidden: string[],
	icsSources: IcsSource[],
	holidaysName = DEFAULT_HOLIDAYS_NAME,
	holidaysSourceId = DEFAULT_HOLIDAYS_SOURCE_ID,
): string[] {
	const next = new Set<string>();
	for (const entry of hidden) {
		const value = entry.trim();
		if (!value) continue;
		if (isPrefixedFilterId(value)) {
			next.add(value);
			continue;
		}
		next.add(`${LOCAL_FILTER_PREFIX}${sanitizeCalendarName(value)}`);
		if (value === holidaysName) {
			next.add(`${GOOGLE_FILTER_PREFIX}${holidaysSourceId}`);
		}
		for (const source of icsSources) {
			if (source.name.trim() === value) {
				next.add(`${GOOGLE_FILTER_PREFIX}${source.id}`);
			}
		}
	}
	return [...next];
}

export function listFilterCalendars(input: {
	events: CalendarEvent[];
	eventsFolder: string;
	icsSources: IcsSource[];
	defaultCalendar: string;
	googleHolidaysEnabled: boolean;
	googleHolidaysColor: string;
	holidaysName?: string;
	holidaysSourceId?: string;
}): { local: FilterCalendar[]; google: FilterCalendar[] } {
	const holidaysName = input.holidaysName ?? DEFAULT_HOLIDAYS_NAME;
	const holidaysSourceId = input.holidaysSourceId ?? DEFAULT_HOLIDAYS_SOURCE_ID;
	const counts = new Map<string, { count: number; color: string; name: string }>();
	for (const event of input.events) {
		const id = calendarFilterId(
			event,
			input.eventsFolder,
			input.icsSources,
			holidaysName,
			holidaysSourceId,
		);
		const cur = counts.get(id);
		if (cur) cur.count += 1;
		else {
			counts.set(id, {
				count: 1,
				color: event.color,
				name: event.calendar.trim() || "Personal",
			});
		}
	}

	const local: FilterCalendar[] = localCalendarNames(
		input.events,
		input.eventsFolder,
		input.defaultCalendar,
	).map((name) => {
		const id = `${LOCAL_FILTER_PREFIX}${name}`;
		const meta = counts.get(id);
		return {
			id,
			name,
			kind: "local",
			color: meta?.color ?? DEFAULT_FILTER_COLOR,
			eventCount: meta?.count ?? 0,
			imported: true,
		};
	});

	const google: FilterCalendar[] = [];
	const seen = new Set<string>();
	for (const source of input.icsSources) {
		const id = `${GOOGLE_FILTER_PREFIX}${source.id}`;
		seen.add(id);
		const meta = counts.get(id);
		const eventCount = meta?.count ?? 0;
		google.push({
			id,
			name: source.name.trim() || "Google Calendar",
			kind: "google",
			color: meta?.color ?? source.color,
			eventCount,
			imported: eventCount > 0,
		});
	}
	if (input.googleHolidaysEnabled) {
		const id = `${GOOGLE_FILTER_PREFIX}${holidaysSourceId}`;
		seen.add(id);
		const meta = counts.get(id);
		const eventCount = meta?.count ?? 0;
		google.push({
			id,
			name: holidaysName,
			kind: "google",
			color: meta?.color ?? input.googleHolidaysColor,
			eventCount,
			imported: eventCount > 0,
		});
	}
	for (const [id, meta] of counts) {
		if (!id.startsWith(GOOGLE_FILTER_PREFIX) || seen.has(id)) continue;
		google.push({
			id,
			name: meta.name,
			kind: "google",
			color: meta.color,
			eventCount: meta.count,
			imported: meta.count > 0,
		});
	}
	google.sort((a, b) => a.name.localeCompare(b.name));
	return { local, google };
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
