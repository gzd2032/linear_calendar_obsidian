import { Notice, requestUrl, type App } from "obsidian";
import {
	countVevents,
	diagnoseIcs,
	icsTextFromResponse,
	isIcsCalendar,
	normalizeIcsUrl,
	parseIcs,
} from "./ics";
import { upsertIcsNotes } from "./notes";
import type { IcsRefreshResult, IcsSource } from "./types";

const ICS_ACCEPT = "text/calendar, text/plain;q=0.9, */*;q=0.8";

export async function testIcsFeed(
	url: string,
	year: number,
): Promise<{ ok: boolean; detail: string }> {
	const res = await requestUrl({
		url: normalizeIcsUrl(url),
		headers: { Accept: ICS_ACCEPT },
	});
	const text = icsTextFromResponse(res);
	if (!isIcsCalendar(text)) {
		return { ok: false, detail: "URL is not an iCal feed" };
	}
	const diag = diagnoseIcs(text, year);
	return {
		ok: true,
		detail: `${diag.vevents} events in feed, ${diag.expandedInYear} in ${year}`,
	};
}

export async function runIcsImport(input: {
	app: App;
	eventsFolder: string;
	allDayOnly: boolean;
	year: number;
	sources: IcsSource[];
}): Promise<{ total: number; trashed: number; results: IcsRefreshResult[] }> {
	const { app, eventsFolder, allDayOnly, year, sources } = input;
	let total = 0;
	let trashed = 0;
	const results: IcsRefreshResult[] = [];

	for (const source of sources) {
		try {
			const res = await requestUrl({
				url: normalizeIcsUrl(source.url),
				headers: { Accept: ICS_ACCEPT },
			});
			const text = icsTextFromResponse(res);
			if (!isIcsCalendar(text)) {
				results.push({ name: source.name, ok: false, detail: "URL is not an iCal feed" });
				continue;
			}
			const vevents = countVevents(text);
			const includingTimed = parseIcs(text, source.name, source.color, year, year, false);
			const parsed = allDayOnly
				? parseIcs(text, source.name, source.color, year, year, true)
				: includingTimed;
			if (parsed.length === 0) {
				if (allDayOnly && includingTimed.length > 0) {
					results.push({
						name: source.name,
						ok: false,
						detail: `${includingTimed.length} timed events skipped — turn off All-day events only`,
					});
				} else if (vevents === 0) {
					results.push({ name: source.name, ok: false, detail: "feed has no events" });
				} else {
					results.push({
						name: source.name,
						ok: false,
						detail: `${vevents} in feed, none in ${year}`,
					});
				}
			}
			const result = await upsertIcsNotes(app, eventsFolder, source.name, source.color, parsed, year);
			total += result.written;
			trashed += result.trashed;
			if (parsed.length > 0 || results.every((row) => row.name !== source.name)) {
				results.push({
					name: source.name,
					ok: true,
					detail: `${result.written} notes${result.trashed ? `, ${result.trashed} removed` : ""}`,
				});
			}
		} catch (error) {
			console.error(error);
			const detail =
				error instanceof Error && error.message ? error.message : "Check the ICS URL.";
			results.push({ name: source.name, ok: false, detail });
		}
	}

	return { total, trashed, results };
}

export function showIcsImportNotice(
	year: number,
	total: number,
	trashed: number,
	results: IcsRefreshResult[],
): void {
	const extra = trashed > 0 ? `, removed ${trashed} stale` : "";
	const summary = `Imported ${total} event notes for ${year}${extra}.`;
	const failures = results.filter((row) => !row.ok);
	if (failures.length > 0) {
		const notice = new Notice("", 10000);
		const host = notice.messageEl;
		host.empty();
		host.createDiv({ text: summary });
		for (const failure of failures) {
			host.createDiv({ text: `${failure.name}: ${failure.detail}` });
		}
		return;
	}
	new Notice(summary);
}
