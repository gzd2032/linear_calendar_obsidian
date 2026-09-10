import { addDays, daysInMonth, formatISODate, pad2, parseISODate } from "./dates";
import type { CalendarEvent } from "./types";

interface RawEvent {
	uid: string;
	summary: string;
	dtStart: string;
	dtEnd: string;
	allDay: boolean;
	rrule: string | null;
	exdates: Set<string>;
	status: string | null;
	recurrenceId: string | null;
}

interface ByDayToken {
	weekday: number;
	nth: number | null;
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

export const GOOGLE_HOLIDAYS_NAME = "Google Holidays";
export const GOOGLE_US_HOLIDAYS_SOURCE_ID = "google-us-holidays";
export const GOOGLE_US_HOLIDAYS_ICS_URL =
	"https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics";

/** Google and Apple calendar links often use webcal://; fetch needs https://. */
export function normalizeIcsUrl(url: string): string {
	return url.trim().replace(/^webcal:\/\//i, "https://");
}

/** Inline settings hint; empty URLs are allowed until the user pastes one. */
export function icsUrlIssue(url: string): string | null {
	const normalized = normalizeIcsUrl(url);
	if (!normalized) return null;
	try {
		const parsed = new URL(normalized);
		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			return "Use an https:// or webcal:// calendar URL.";
		}
		return null;
	} catch {
		return "That doesn’t look like a valid calendar URL.";
	}
}

export function isIcsCalendar(text: string): boolean {
	return /BEGIN:VCALENDAR/i.test(text);
}

export function countVevents(text: string): number {
	return (text.match(/BEGIN:VEVENT/gi) ?? []).length;
}

/** Prefer `text`; fall back to UTF-8 bytes when Obsidian leaves `text` empty. */
export function icsTextFromResponse(res: { text?: string; arrayBuffer?: ArrayBuffer }): string {
	const text = res.text ?? "";
	if (/BEGIN:VCALENDAR/i.test(text)) return text;
	const buf = res.arrayBuffer;
	if (buf && buf.byteLength > 0) {
		const decoded = new TextDecoder("utf-8").decode(buf);
		if (decoded) return decoded;
	}
	return text;
}

export function parseIcs(
	text: string,
	calendar: string,
	color: string,
	fromYear = new Date().getFullYear(),
	toYear = fromYear,
	allDayOnly = false,
): CalendarEvent[] {
	return firstCommitParseIcs(text, calendar, color, fromYear, toYear, allDayOnly);
}

interface FirstCommitRawEvent {
	uid: string;
	summary: string;
	dtStart: string;
	dtEnd: string;
	allDay: boolean;
	rrule: string | null;
}

/** Parsing behavior from a1d65a2, the first plugin implementation. */
function firstCommitParseIcs(
	text: string,
	calendar: string,
	color: string,
	fromYear: number,
	toYear: number,
	allDayOnly: boolean,
): CalendarEvent[] {
	const unfolded = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
	const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
	const events: CalendarEvent[] = [];

	for (const block of blocks) {
		const body = block.split(/END:VEVENT/i)[0] ?? "";
		const raw = firstCommitParseRawEvent(body);
		if (!raw) continue;
		if (allDayOnly && !raw.allDay) continue;
		const expanded = firstCommitExpandRawEvent(raw, fromYear, toYear);
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

function firstCommitParseRawEvent(body: string): FirstCommitRawEvent | null {
	const uid = firstCommitProp(body, "UID");
	const dtStartLine = firstCommitPropLine(body, "DTSTART");
	if (!uid || !dtStartLine) return null;
	const startParsed = firstCommitParseIcsDate(dtStartLine);
	if (!startParsed) return null;
	const dtEndLine = firstCommitPropLine(body, "DTEND");
	const endParsed = dtEndLine ? firstCommitParseIcsDate(dtEndLine) : null;
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
		summary: unescapeIcs(firstCommitProp(body, "SUMMARY") ?? "Untitled"),
		dtStart: startParsed.iso,
		dtEnd: end,
		allDay,
		rrule: firstCommitProp(body, "RRULE"),
	};
}

function firstCommitExpandRawEvent(
	raw: FirstCommitRawEvent,
	fromYear: number,
	toYear: number,
): { start: string; end: string }[] {
	const durationDays = dayDelta(raw.dtStart, raw.dtEnd);
	if (!raw.rrule) {
		return [{ start: raw.dtStart, end: raw.dtEnd }];
	}
	const freq = /FREQ=([A-Z]+)/i.exec(raw.rrule)?.[1]?.toUpperCase();
	const interval = Number(/INTERVAL=(\d+)/i.exec(raw.rrule)?.[1] ?? "1") || 1;
	const count = Number(/COUNT=(\d+)/i.exec(raw.rrule)?.[1] ?? "0");
	const untilRaw = /UNTIL=([^;]+)/i.exec(raw.rrule)?.[1];
	const until = untilRaw ? firstCommitParseIcsDate(`DUMMY:${untilRaw}`)?.iso : null;
	const windowStart = `${fromYear}-01-01`;
	const windowEnd = `${toYear}-12-31`;
	const out: { start: string; end: string }[] = [];
	const cursor = parseISODate(raw.dtStart);
	if (!cursor) return [{ start: raw.dtStart, end: raw.dtEnd }];
	let emitted = 0;
	for (let i = 0; i < 800; i++) {
		const start = formatISODate(cursor);
		if (until && start > until) break;
		if (count && emitted >= count) break;
		if (start > windowEnd && emitted > 0) break;
		const end = addDays(start, durationDays);
		if (end >= windowStart && start <= windowEnd) {
			out.push({ start, end });
		}
		emitted += 1;
		if (!firstCommitAdvance(cursor, freq, interval)) break;
	}
	return out.length > 0 ? out : [{ start: raw.dtStart, end: raw.dtEnd }];
}

function firstCommitAdvance(date: Date, freq: string | undefined, interval: number): boolean {
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

function firstCommitProp(body: string, name: string): string | null {
	const line = firstCommitPropLine(body, name);
	if (!line) return null;
	const idx = line.indexOf(":");
	return idx >= 0 ? line.slice(idx + 1).trim() : null;
}

function firstCommitPropLine(body: string, name: string): string | null {
	const lines = body.split("\n");
	const prefix = name.toUpperCase();
	for (const line of lines) {
		const upper = line.toUpperCase();
		if (upper.startsWith(`${prefix}:`) || upper.startsWith(`${prefix};`)) {
			return line.trim();
		}
	}
	return null;
}

function firstCommitParseIcsDate(line: string): { iso: string; allDay: boolean } | null {
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

export interface IcsDiagnostics {
	vevents: number;
	decoded: number;
	invalid: number;
	recurring: number;
	allDay: number;
	rawInYear: number;
	expandedInYear: number;
	expandedAllDayInYear: number;
	earliest: string | null;
	latest: string | null;
}

/** Parser-stage counts for diagnosing feed differences inside Obsidian. */
export function diagnoseIcs(text: string, year: number): IcsDiagnostics {
	const unfolded = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "");
	const blocks = unfolded.split(/BEGIN:VEVENT/i).slice(1);
	const rawEvents = blocks
		.map((block) => parseRawEvent(block.split(/END:VEVENT/i)[0] ?? ""))
		.filter((event): event is RawEvent => event !== null);
	const starts = rawEvents.map((event) => event.dtStart).sort();
	const prefix = `${year}-`;
	return {
		vevents: blocks.length,
		decoded: rawEvents.length,
		invalid: blocks.length - rawEvents.length,
		recurring: rawEvents.filter((event) => event.rrule !== null).length,
		allDay: rawEvents.filter((event) => event.allDay).length,
		rawInYear: rawEvents.filter((event) => event.dtStart.startsWith(prefix)).length,
		expandedInYear: parseIcs(text, "Diagnostic", "#000000", year, year, false).length,
		expandedAllDayInYear: parseIcs(text, "Diagnostic", "#000000", year, year, true).length,
		earliest: starts[0] ?? null,
		latest: starts.at(-1) ?? null,
	};
}

function parseRawEvent(body: string): RawEvent | null {
	const recLine = propLine(body, "RECURRENCE-ID");
	const recurrenceId = recLine ? (parseIcsDate(recLine)?.iso ?? null) : null;
	const dtStartLine = propLine(body, "DTSTART") ?? recLine;
	if (!dtStartLine) return null;
	const startParsed = parseIcsDate(dtStartLine);
	if (!startParsed) return null;
	const dtEndLine = propLine(body, "DTEND");
	let endParsed = dtEndLine ? parseIcsDate(dtEndLine) : null;
	const duration = prop(body, "DURATION");
	if (!endParsed && duration) {
		endParsed = { iso: addIcsDuration(startParsed.iso, duration), allDay: startParsed.allDay, midnight: false };
	}
	let end = endParsed?.iso ?? startParsed.iso;
	const allDay =
		startParsed.allDay ||
		/X-MICROSOFT-CDO-ALLDAYEVENT\s*:\s*TRUE/i.test(body) ||
		isMidnightSpan(startParsed, endParsed);
	if (allDay && endParsed && endParsed.iso > startParsed.iso) {
		end = addDays(endParsed.iso, -1);
	} else if (!endParsed) {
		end = startParsed.iso;
	}
	if (end < startParsed.iso) end = startParsed.iso;
	const summary = unescapeIcs(prop(body, "SUMMARY") ?? "Untitled");
	const uidRaw = prop(body, "UID");
	const uid = unescapeIcs(uidRaw?.trim() ? uidRaw : `${summary}:${startParsed.iso}`);
	const status = prop(body, "STATUS")?.trim().toUpperCase() || null;
	return {
		uid,
		summary,
		dtStart: startParsed.iso,
		dtEnd: end,
		allDay,
		rrule: prop(body, "RRULE"),
		exdates: parseExdates(body),
		status,
		recurrenceId,
	};
}

// Kept temporarily for regression comparison; production parsing uses firstCommitParseIcs.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained until runtime diagnosis is complete
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
	const byDayTokens = parseByDayTokens(raw.rrule);
	const byMonthDays = parseByMonthDays(raw.rrule);
	const freq = /FREQ=([A-Z]+)/i.exec(raw.rrule)?.[1]?.toUpperCase();
	if (freq === "WEEKLY" && byDays.length > 0) {
		return expandWeeklyByDay(raw, byDays, durationDays, fromYear, toYear);
	}
	if (freq === "MONTHLY" && (byDayTokens.length > 0 || byMonthDays.length > 0)) {
		return expandMonthly(raw, byDayTokens, byMonthDays, durationDays, fromYear, toYear);
	}
	if (freq === "YEARLY") {
		return expandYearly(raw, durationDays, fromYear, toYear);
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
	if (!count) {
		const win = parseISODate(windowStart);
		if (win) fastForward(cursor, freq, interval, win);
	}
	let emitted = 0;
	for (let i = 0; i < expandLimit(count); i++) {
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
	if (!count) {
		const win = parseISODate(windowStart);
		if (win) fastForward(anchor, "WEEKLY", interval, win);
	}
	let emitted = 0;
	for (let i = 0; i < expandLimit(count); i++) {
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

/** Paint YEARLY events onto the viewed year (Google birthdays often have DTSTART = next occurrence). */
function expandYearly(
	raw: RawEvent,
	durationDays: number,
	fromYear: number,
	toYear: number,
): { start: string; end: string }[] {
	const rrule = raw.rrule ?? "";
	const interval = Number(/INTERVAL=(\d+)/i.exec(rrule)?.[1] ?? "1") || 1;
	const count = Number(/COUNT=(\d+)/i.exec(rrule)?.[1] ?? "0");
	const untilRaw = /UNTIL=([^;]+)/i.exec(rrule)?.[1];
	const until = untilRaw ? parseIcsDate(`DUMMY:${untilRaw}`)?.iso : null;
	const origin = parseISODate(raw.dtStart);
	if (!origin) return occurrenceIfKept(raw.dtStart, raw.dtEnd, raw.exdates);
	const month = origin.getMonth();
	const day = origin.getDate();
	const originYear = origin.getFullYear();
	const windowStart = `${fromYear}-01-01`;
	const windowEnd = `${toYear}-12-31`;
	const out: { start: string; end: string }[] = [];
	for (let year = fromYear; year <= toYear; year++) {
		if ((year - originYear) % interval !== 0) continue;
		if (count) {
			const index = Math.floor((year - originYear) / interval);
			if (index < 0 || index >= count) continue;
		}
		const occ = new Date(year, month, day);
		if (occ.getMonth() !== month) continue;
		const start = formatISODate(occ);
		if (until && start > until) continue;
		if (raw.exdates.has(start)) continue;
		const end = addDays(start, durationDays);
		if (end >= windowStart && start <= windowEnd) {
			out.push({ start, end });
		}
	}
	return out.length > 0 ? out : occurrenceIfKept(raw.dtStart, raw.dtEnd, raw.exdates);
}

function expandMonthly(
	raw: RawEvent,
	byDays: ByDayToken[],
	byMonthDays: number[],
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
	let year = anchor.getFullYear();
	let month = anchor.getMonth();
	if (!count && year < fromYear) {
		const monthsBehind = (fromYear - year) * 12 - month;
		const steps = Math.floor(monthsBehind / interval);
		if (steps > 1) {
			month += (steps - 1) * interval;
			while (month > 11) {
				month -= 12;
				year += 1;
			}
		}
	}
	const out: { start: string; end: string }[] = [];
	let emitted = 0;
	for (let i = 0; i < expandLimit(count); i++) {
		const candidates = monthlyCandidates(year, month, byDays, byMonthDays).sort(
			(a, b) => a.getTime() - b.getTime(),
		);
		for (const date of candidates) {
			const start = formatISODate(date);
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
		month += interval;
		while (month > 11) {
			month -= 12;
			year += 1;
		}
		const monthStart = `${year}-${pad2(month + 1)}-01`;
		if (monthStart > windowEnd) break;
		if (until && monthStart > until) break;
	}
	return out;
}

function monthlyCandidates(
	year: number,
	month: number,
	byDays: ByDayToken[],
	byMonthDays: number[],
): Date[] {
	if (byMonthDays.length > 0) {
		const days = byMonthDays
			.map((n) => dateFromMonthDay(year, month, n))
			.filter((date): date is Date => date !== null);
		if (byDays.length === 0) return days;
		return days.filter((date) => dateMatchesByDays(date, byDays));
	}
	const dates: Date[] = [];
	for (const token of byDays) {
		if (token.nth === null) {
			dates.push(...allWeekdaysInMonth(year, month, token.weekday));
		} else {
			const date = nthWeekdayOfMonth(year, month, token.weekday, token.nth);
			if (date) dates.push(date);
		}
	}
	return dates;
}

function dateFromMonthDay(year: number, month: number, n: number): Date | null {
	const last = daysInMonth(year, month);
	const day = n > 0 ? n : last + n + 1;
	if (day < 1 || day > last) return null;
	return new Date(year, month, day);
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): Date | null {
	if (nth > 0) {
		const first = new Date(year, month, 1);
		const day = 1 + ((weekday - first.getDay() + 7) % 7) + (nth - 1) * 7;
		if (day > daysInMonth(year, month)) return null;
		return new Date(year, month, day);
	}
	if (nth < 0) {
		const lastDate = daysInMonth(year, month);
		const last = new Date(year, month, lastDate);
		const day = lastDate - ((last.getDay() - weekday + 7) % 7) + (nth + 1) * 7;
		if (day < 1) return null;
		return new Date(year, month, day);
	}
	return null;
}

function allWeekdaysInMonth(year: number, month: number, weekday: number): Date[] {
	const dates: Date[] = [];
	for (let nth = 1; nth <= 5; nth++) {
		const date = nthWeekdayOfMonth(year, month, weekday, nth);
		if (date) dates.push(date);
	}
	return dates;
}

function dateMatchesByDays(date: Date, tokens: ByDayToken[]): boolean {
	return tokens.some((token) => {
		if (date.getDay() !== token.weekday) return false;
		if (token.nth === null) return true;
		const expected = nthWeekdayOfMonth(date.getFullYear(), date.getMonth(), token.weekday, token.nth);
		return expected !== null && formatISODate(expected) === formatISODate(date);
	});
}

function dateOnWeekday(ref: Date, weekday: number): Date {
	const date = new Date(ref);
	date.setDate(date.getDate() + (weekday - date.getDay()));
	return date;
}

function parseByDayTokens(rrule: string): ByDayToken[] {
	const raw = /BYDAY=([^;]+)/i.exec(rrule)?.[1];
	if (!raw) return [];
	const tokens: ByDayToken[] = [];
	for (const part of raw.split(",")) {
		const match = /^([+-]?\d{1,2})?([A-Z]{2})$/i.exec(part.trim());
		if (!match) continue;
		const code = match[2]?.toUpperCase();
		const weekday = code ? WEEKDAY_CODES[code] : undefined;
		if (weekday === undefined) continue;
		const nth = match[1] ? Number(match[1]) : null;
		if (nth === 0 || Number.isNaN(nth)) continue;
		tokens.push({ weekday, nth });
	}
	return tokens;
}

function parseByMonthDays(rrule: string): number[] {
	const raw = /BYMONTHDAY=([^;]+)/i.exec(rrule)?.[1];
	if (!raw) return [];
	const days: number[] = [];
	for (const part of raw.split(",")) {
		const n = Number(part.trim());
		if (!n || Number.isNaN(n) || n < -31 || n > 31) continue;
		days.push(n);
	}
	return days;
}

function parseByDays(rrule: string): number[] {
	const days: number[] = [];
	for (const token of parseByDayTokens(rrule)) {
		if (token.nth !== null) continue;
		if (!days.includes(token.weekday)) days.push(token.weekday);
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

const MAX_EXPAND = 20000;

function expandLimit(count: number): number {
	if (count > 0) return Math.min(MAX_EXPAND, Math.max(count + 8, 800));
	return 800;
}

/** Jump close to the visible year so weekly/daily series from 2010 still appear in 2026. */
function fastForward(cursor: Date, freq: string | undefined, interval: number, windowStart: Date): void {
	const step = Math.max(1, interval);
	if (cursor.getTime() >= windowStart.getTime()) return;
	if (freq === "DAILY") {
		const days = Math.round((windowStart.getTime() - cursor.getTime()) / 86400000);
		const steps = Math.floor(days / step);
		if (steps > 1) cursor.setDate(cursor.getDate() + (steps - 1) * step);
		return;
	}
	if (freq === "WEEKLY") {
		const days = Math.round((windowStart.getTime() - cursor.getTime()) / 86400000);
		const steps = Math.floor(days / (7 * step));
		if (steps > 1) cursor.setDate(cursor.getDate() + (steps - 1) * 7 * step);
		return;
	}
	if (freq === "MONTHLY") {
		const months =
			(windowStart.getFullYear() - cursor.getFullYear()) * 12 + (windowStart.getMonth() - cursor.getMonth());
		const steps = Math.floor(months / step);
		if (steps > 1) cursor.setMonth(cursor.getMonth() + (steps - 1) * step);
		return;
	}
	if (freq === "YEARLY") {
		const steps = Math.floor((windowStart.getFullYear() - cursor.getFullYear()) / step);
		if (steps > 1) cursor.setFullYear(cursor.getFullYear() + (steps - 1) * step);
	}
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
	for (const rawLine of body.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		const upper = line.toUpperCase();
		if (upper.startsWith(`${prefix}:`) || upper.startsWith(`${prefix};`)) {
			out.push(line);
		}
	}
	return out;
}

function propLine(body: string, name: string): string | null {
	return allPropLines(body, name)[0] ?? null;
}

interface ParsedIcsDate {
	iso: string;
	allDay: boolean;
	midnight: boolean;
}

function isMidnightSpan(start: ParsedIcsDate, end: ParsedIcsDate | null): boolean {
	if (!start.midnight) return false;
	return !end || end.midnight;
}

function addIcsDuration(startIso: string, duration: string): string {
	const match = /^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(duration.trim());
	if (!match) return startIso;
	const weeks = Number(match[1] ?? 0);
	const days = Number(match[2] ?? 0);
	const hours = Number(match[3] ?? 0);
	const extra = weeks * 7 + days + Math.floor(hours / 24);
	return extra > 0 ? addDays(startIso, extra) : startIso;
}

function parseIcsDate(line: string): ParsedIcsDate | null {
	const colon = line.lastIndexOf(":");
	const value = (colon >= 0 ? line.slice(colon + 1) : line.replace(/^DUMMY:/, "")).trim();
	const dateMatch = /^(\d{4})(\d{2})(\d{2})/.exec(value);
	const yearText = dateMatch?.[1];
	const monthText = dateMatch?.[2];
	const dayText = dateMatch?.[3];
	if (!yearText || !monthText || !dayText) return null;
	const year = Number(yearText);
	const month = Number(monthText);
	const day = Number(dayText);
	const timeMatch = /T(\d{2})(\d{2})(\d{2})/.exec(value);
	const allDay = /(?:^|;)VALUE=DATE(?:;|:|$)/i.test(line) || !timeMatch;
	if (allDay || !timeMatch) {
		return { iso: `${year}-${pad2(month)}-${pad2(day)}`, allDay: true, midnight: true };
	}
	const hour = Number(timeMatch[1] ?? 0);
	const minute = Number(timeMatch[2] ?? 0);
	const second = Number(timeMatch[3] ?? 0);
	const isUtc = /Z$/i.test(value);
	const date = isUtc
		? new Date(Date.UTC(year, month - 1, day, hour, minute, second))
		: new Date(year, month - 1, day, hour, minute, second);
	return {
		iso: formatISODate(date),
		allDay: false,
		midnight: hour === 0 && minute === 0 && second === 0,
	};
}

function unescapeIcs(value: string): string {
	return value
		.replace(/\\n/gi, "\n")
		.replace(/\\,/g, ",")
		.replace(/\\;/g, ";")
		.replace(/\\\\/g, "\\");
}
