import { addDays, formatISODate, pad2, parseISODate } from "./dates";
import type { CalendarEvent } from "./types";

interface RawEvent {
	uid: string;
	summary: string;
	dtStart: string;
	dtEnd: string;
	allDay: boolean;
	rrule: string | null;
	exdates: Set<string>;
}

const WEEKDAY_CODES: Record<string, number> = {
	SU: 0,
	MO: 1,
	TU: 2,
	WE: 3,
	TH: 4,
	FR: 5,
	SA: 6,
};

/** Google and Apple calendar links often use webcal://; fetch needs https://. */
export function normalizeIcsUrl(url: string): string {
	return url.trim().replace(/^webcal:\/\//i, "https://");
}

export function parseIcs(
	text: string,
	calendar: string,
	color: string,
	fromYear = new Date().getFullYear(),
	toYear = fromYear,
	allDayOnly = false,
): CalendarEvent[] {
	const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
	const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
	const events: CalendarEvent[] = [];

	for (const block of blocks) {
		const body = block.split(/END:VEVENT/i)[0] ?? "";
		const raw = parseRawEvent(body);
		if (!raw) continue;
		if (allDayOnly && !raw.allDay) continue;
		const expanded = expandRawEvent(raw, fromYear, toYear);
		const windowStart = `${fromYear}-01-01`;
		const windowEnd = `${toYear}-12-31`;
		for (const instance of expanded) {
			if (instance.end < windowStart || instance.start > windowEnd) continue;
			events.push({
				id: `${raw.uid}:${instance.start}`,
				title: raw.summary || "Untitled",
				start: instance.start,
				end: instance.end,
				color,
				calendar,
				icsUid: raw.uid,
			});
		}
	}
	return events;
}

function parseRawEvent(body: string): RawEvent | null {
	const uid = prop(body, "UID");
	const dtStartLine = propLine(body, "DTSTART");
	if (!uid || !dtStartLine) return null;
	const startParsed = parseIcsDate(dtStartLine);
	if (!startParsed) return null;
	const dtEndLine = propLine(body, "DTEND");
	const endParsed = dtEndLine ? parseIcsDate(dtEndLine) : null;
	let end = endParsed?.iso ?? startParsed.iso;
	const allDay = startParsed.allDay;
	if (allDay && endParsed && endParsed.iso > startParsed.iso) {
		end = addDays(endParsed.iso, -1);
	} else if (!endParsed) {
		end = startParsed.iso;
	}
	if (end < startParsed.iso) end = startParsed.iso;
	return {
		uid: unescapeIcs(uid),
		summary: unescapeIcs(prop(body, "SUMMARY") ?? "Untitled"),
		dtStart: startParsed.iso,
		dtEnd: end,
		allDay,
		rrule: prop(body, "RRULE"),
		exdates: parseExdates(body),
	};
}

function expandRawEvent(
	raw: RawEvent,
	fromYear: number,
	toYear: number,
): { start: string; end: string }[] {
	const durationDays = dayDelta(raw.dtStart, raw.dtEnd);
	if (!raw.rrule) {
		return occurrenceIfKept(raw.dtStart, raw.dtEnd, raw.exdates);
	}
	const byDays = parseByDays(raw.rrule);
	const freq = /FREQ=([A-Z]+)/i.exec(raw.rrule)?.[1]?.toUpperCase();
	if (freq === "WEEKLY" && byDays.length > 0) {
		return expandWeeklyByDay(raw, byDays, durationDays, fromYear, toYear);
	}
	const interval = Number(/INTERVAL=(\d+)/i.exec(raw.rrule)?.[1] ?? "1") || 1;
	const count = Number(/COUNT=(\d+)/i.exec(raw.rrule)?.[1] ?? "0");
	const untilRaw = /UNTIL=([^;]+)/i.exec(raw.rrule)?.[1];
	const until = untilRaw ? parseIcsDate(`DUMMY:${untilRaw}`)?.iso : null;
	const windowStart = `${fromYear}-01-01`;
	const windowEnd = `${toYear}-12-31`;
	const out: { start: string; end: string }[] = [];
	let cursor = parseISODate(raw.dtStart);
	if (!cursor) return occurrenceIfKept(raw.dtStart, raw.dtEnd, raw.exdates);
	let emitted = 0;
	for (let i = 0; i < 800; i++) {
		const start = formatISODate(cursor);
		if (until && start > until) break;
		if (count && emitted >= count) break;
		if (start > windowEnd) break;
		emitted += 1;
		if (!raw.exdates.has(start)) {
			const end = addDays(start, durationDays);
			if (end >= windowStart && start <= windowEnd) {
				out.push({ start, end });
			}
		}
		if (!advance(cursor, freq, interval)) break;
	}
	return out.length > 0 ? out : occurrenceIfKept(raw.dtStart, raw.dtEnd, raw.exdates);
}

function expandWeeklyByDay(
	raw: RawEvent,
	weekdays: number[],
	durationDays: number,
	fromYear: number,
	toYear: number,
): { start: string; end: string }[] {
	const rrule = raw.rrule ?? "";
	const interval = Number(/INTERVAL=(\d+)/i.exec(rrule)?.[1] ?? "1") || 1;
	const count = Number(/COUNT=(\d+)/i.exec(rrule)?.[1] ?? "0");
	const untilRaw = /UNTIL=([^;]+)/i.exec(rrule)?.[1];
	const until = untilRaw ? parseIcsDate(`DUMMY:${untilRaw}`)?.iso : null;
	const windowStart = `${fromYear}-01-01`;
	const windowEnd = `${toYear}-12-31`;
	const anchor = parseISODate(raw.dtStart);
	if (!anchor) return occurrenceIfKept(raw.dtStart, raw.dtEnd, raw.exdates);
	const out: { start: string; end: string }[] = [];
	let emitted = 0;
	for (let i = 0; i < 800; i++) {
		for (const weekday of weekdays) {
			const occ = dateOnWeekday(anchor, weekday);
			const start = formatISODate(occ);
			if (start < raw.dtStart) continue;
			if (until && start > until) return out;
			if (count && emitted >= count) return out;
			emitted += 1;
			if (raw.exdates.has(start)) continue;
			const end = addDays(start, durationDays);
			if (end >= windowStart && start <= windowEnd) {
				out.push({ start, end });
			}
		}
		anchor.setDate(anchor.getDate() + 7 * interval);
		const next = formatISODate(anchor);
		if (next > windowEnd) break;
		if (until && next > until) break;
	}
	return out;
}

function dateOnWeekday(ref: Date, weekday: number): Date {
	const date = new Date(ref);
	date.setDate(date.getDate() + (weekday - date.getDay()));
	return date;
}

function parseByDays(rrule: string): number[] {
	const raw = /BYDAY=([^;]+)/i.exec(rrule)?.[1];
	if (!raw) return [];
	const days: number[] = [];
	for (const token of raw.split(",")) {
		const code = /([A-Z]{2})$/i.exec(token.trim())?.[1]?.toUpperCase();
		const day = code ? WEEKDAY_CODES[code] : undefined;
		if (day !== undefined && !days.includes(day)) days.push(day);
	}
	return days.sort((a, b) => a - b);
}

function parseExdates(body: string): Set<string> {
	const out = new Set<string>();
	for (const line of allPropLines(body, "EXDATE")) {
		const colon = line.indexOf(":");
		if (colon < 0) continue;
		const prefix = line.slice(0, colon);
		for (const part of line.slice(colon + 1).split(",")) {
			const parsed = parseIcsDate(`${prefix}:${part.trim()}`);
			if (parsed) out.add(parsed.iso);
		}
	}
	return out;
}

function occurrenceIfKept(
	start: string,
	end: string,
	exdates: Set<string>,
): { start: string; end: string }[] {
	return exdates.has(start) ? [] : [{ start, end }];
}

function advance(date: Date, freq: string | undefined, interval: number): boolean {
	if (freq === "DAILY") {
		date.setDate(date.getDate() + interval);
		return true;
	}
	if (freq === "WEEKLY") {
		date.setDate(date.getDate() + 7 * interval);
		return true;
	}
	if (freq === "MONTHLY") {
		date.setMonth(date.getMonth() + interval);
		return true;
	}
	if (freq === "YEARLY") {
		date.setFullYear(date.getFullYear() + interval);
		return true;
	}
	return false;
}

function dayDelta(start: string, end: string): number {
	const a = parseISODate(start);
	const b = parseISODate(end);
	if (!a || !b) return 0;
	return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function prop(body: string, name: string): string | null {
	const line = propLine(body, name);
	if (!line) return null;
	const idx = line.indexOf(":");
	return idx >= 0 ? line.slice(idx + 1).trim() : null;
}

function allPropLines(body: string, name: string): string[] {
	const prefix = name.toUpperCase();
	const out: string[] = [];
	for (const line of body.split("\n")) {
		const upper = line.toUpperCase();
		if (upper.startsWith(`${prefix}:`) || upper.startsWith(`${prefix};`)) {
			out.push(line.trim());
		}
	}
	return out;
}

function propLine(body: string, name: string): string | null {
	return allPropLines(body, name)[0] ?? null;
}

function parseIcsDate(line: string): { iso: string; allDay: boolean } | null {
	const value = line.includes(":") ? line.slice(line.indexOf(":") + 1).trim() : line.replace(/^DUMMY:/, "");
	const allDay = /VALUE=DATE/i.test(line) || /^\d{8}$/.test(value);
	const dateMatch = /^(\d{4})(\d{2})(\d{2})/.exec(value);
	if (!dateMatch) return null;
	const year = Number(dateMatch[1]);
	const month = Number(dateMatch[2]);
	const day = Number(dateMatch[3]);
	const timeMatch = /T(\d{2})(\d{2})(\d{2})/.exec(value);
	if (allDay || !timeMatch) {
		return { iso: `${year}-${pad2(month)}-${pad2(day)}`, allDay: true };
	}
	const hour = Number(timeMatch[1]);
	const minute = Number(timeMatch[2]);
	const second = Number(timeMatch[3]);
	const isUtc = value.endsWith("Z");
	const date = isUtc
		? new Date(Date.UTC(year, month - 1, day, hour, minute, second))
		: new Date(year, month - 1, day, hour, minute, second);
	return { iso: formatISODate(date), allDay: false };
}

function unescapeIcs(value: string): string {
	return value
		.replace(/\\n/gi, "\n")
		.replace(/\\,/g, ",")
		.replace(/\\;/g, ";")
		.replace(/\\\\/g, "\\");
}
