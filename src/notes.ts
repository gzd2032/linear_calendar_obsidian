import { type App, TFile, normalizePath } from "obsidian";
import { googleCalendarFolder, localCalendarFolder, sanitizeCalendarName } from "./calendar-paths";
import { sanitizeFilename } from "./format";
import {
	buildNoteBody,
	eventFromFrontmatter,
	extractNoteDescription,
	staleIcsNotes,
	toIsoDate,
} from "./note-model";
import type { CalendarEvent } from "./types";

export { buildNoteBody, extractNoteDescription, toIsoDate } from "./note-model";
export {
	googleCalendarDayUrl,
	googleCalendarFolder,
	isGoogleEvent,
	localCalendarFolder,
	localCalendarNames,
	partitionCalendars,
	sanitizeCalendarName,
} from "./calendar-paths";

export function listEventNotes(app: App, folder: string): CalendarEvent[] {
	const prefix = normalizePath(folder).replace(/\/$/, "");
	const events: CalendarEvent[] = [];
	for (const file of app.vault.getMarkdownFiles()) {
		if (prefix && file.path !== prefix && !file.path.startsWith(`${prefix}/`)) continue;
		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm) continue;
		const event = eventFromFrontmatter({
			path: file.path,
			basename: file.basename,
			frontmatter: fm,
			heading: cache?.headings?.[0]?.heading,
		});
		if (event) events.push(event);
	}
	return events;
}

export async function ensureFolder(app: App, folder: string): Promise<void> {
	const path = normalizePath(folder);
	if (!path) return;
	const parts = path.split("/").filter(Boolean);
	let current = "";
	for (const part of parts) {
		current = current ? `${current}/${part}` : part;
		const existing = app.vault.getAbstractFileByPath(current);
		if (existing) continue;
		await app.vault.createFolder(current);
	}
}

export async function readNoteDescription(app: App, path: string): Promise<string> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return "";
	const content = await app.vault.cachedRead(file);
	return extractNoteDescription(content);
}

export async function createEventNote(
	app: App,
	eventsFolder: string,
	event: Omit<CalendarEvent, "id" | "path">,
): Promise<TFile> {
	const calendar = sanitizeCalendarName(event.calendar);
	const folder = localCalendarFolder(eventsFolder, calendar);
	await ensureFolder(app, folder);
	const payload = { ...event, calendar };
	const base = normalizePath(`${folder}/${event.start} ${sanitizeFilename(event.title)}`);
	let path = `${base}.md`;
	let n = 2;
	while (app.vault.getAbstractFileByPath(path)) {
		path = `${base} ${n}.md`;
		n += 1;
	}
	return app.vault.create(path, buildNoteBody(payload));
}

/** Create a note in an explicit folder (used for Google ICS imports). */
export async function createEventNoteInFolder(
	app: App,
	folder: string,
	event: Omit<CalendarEvent, "id" | "path">,
): Promise<TFile> {
	await ensureFolder(app, folder);
	const base = normalizePath(`${folder}/${event.start} ${sanitizeFilename(event.title)}`);
	let path = `${base}.md`;
	let n = 2;
	while (app.vault.getAbstractFileByPath(path)) {
		path = `${base} ${n}.md`;
		n += 1;
	}
	return app.vault.create(path, buildNoteBody(event));
}

export async function updateEventNote(
	app: App,
	path: string,
	event: Omit<CalendarEvent, "id" | "path">,
): Promise<void> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) throw new Error(`Missing note: ${path}`);
	await app.vault.modify(file, buildNoteBody(event));
}

export async function upsertIcsNotes(
	app: App,
	eventsFolder: string,
	calendar: string,
	color: string,
	incoming: CalendarEvent[],
	year: number,
): Promise<{ written: number; trashed: number }> {
	const dest = googleCalendarFolder(eventsFolder, calendar);
	await ensureFolder(app, dest);
	const existing = listEventNotes(app, dest);
	const byKey = new Map(
		existing
			.filter((event) => event.icsUid)
			.map((event) => [`${event.icsUid}:${event.start}`, event]),
	);
	let written = 0;
	for (const event of incoming) {
		if (!event.icsUid) continue;
		const current = byKey.get(`${event.icsUid}:${event.start}`);
		const payload = { ...event, calendar, color: event.color || color };
		if (current?.path) {
			const file = app.vault.getAbstractFileByPath(current.path);
			if (file instanceof TFile) {
				const description = await readNoteDescription(app, current.path);
				await app.vault.modify(file, buildNoteBody({ ...payload, description }));
				written += 1;
				continue;
			}
		}
		await createEventNoteInFolder(app, dest, payload);
		written += 1;
	}
	let trashed = 0;
	for (const event of staleIcsNotes(existing, incoming, year)) {
		if (!event.path) continue;
		const file = app.vault.getAbstractFileByPath(event.path);
		if (file instanceof TFile) {
			await app.fileManager.trashFile(file);
			trashed += 1;
		}
	}
	return { written, trashed };
}
