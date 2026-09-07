import { type App, TFile, normalizePath } from "obsidian";
import { sanitizeFilename } from "./format";
import {
	buildNoteBody,
	eventFromFrontmatter,
	extractNoteDescription,
	toIsoDate,
} from "./note-model";
import type { CalendarEvent } from "./types";

export { buildNoteBody, extractNoteDescription, toIsoDate } from "./note-model";

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
	const existing = app.vault.getAbstractFileByPath(path);
	if (existing) return;
	await app.vault.createFolder(path);
}

export async function readNoteDescription(app: App, path: string): Promise<string> {
	const file = app.vault.getAbstractFileByPath(path);
	if (!(file instanceof TFile)) return "";
	const content = await app.vault.cachedRead(file);
	return extractNoteDescription(content);
}

export async function createEventNote(
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
	folder: string,
	calendar: string,
	color: string,
	incoming: CalendarEvent[],
): Promise<number> {
	const dest = normalizePath(`${folder}/${sanitizeFilename(calendar)}`);
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
		await createEventNote(app, dest, payload);
		written += 1;
	}
	return written;
}
