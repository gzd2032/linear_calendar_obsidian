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
	const rawEvents: RawEvent[] = [];

	for (const block of blocks) {
		const body = block.split(/END:VEVENT/i)[0] ?? "";
		const raw = parseRawEvent(body);
		if (!raw) continue;
		if (allDayOnly && !raw.allDay && !raw.recurrenceId) continue;
		rawEvents.push(raw);
	}

	const cancelledByUid = new Map<string, Set<string>>();
	for (const raw of rawEvents) {
		if (raw.status !== "CANCELLED" || !raw.recurrenceId) continue;
		let dates = cancelledByUid.get(raw.uid);
		if (!dates) {
			dates = new Set();
			cancelledByUid.set(raw.uid, dates);
		}
		dates.add(raw.recurrenceId);
	}

	const events: CalendarEvent[] = [];
	const windowStart = `${fromYear}-01-01`;
	const windowEnd = `${toYear}-12-31`;
	for (const raw of rawEvents) {
		if (raw.status === "CANCELLED") continue;
		if (raw.recurrenceId) continue;
		const extra = cancelledByUid.get(raw.uid);
		if (extra) {
			for (const date of extra) raw.exdates.add(date);
		}
		const expanded = expandRawEvent(raw, fromYear, toYear);
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
	const recLine = propLine(body, "RECURRENCE-ID");
	const recurrenceId = recLine ? (parseIcsDate(recLine)?.iso ?? null) : null;
	const dtStartLine = propLine(body, "DTSTART") ?? recLine;
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
	const status = prop(body, "STATUS")?.trim().toUpperCase() || null;
	return {
		uid: unescapeIcs(uid),
		summary: unescapeIcs(prop(body, "SUMMARY") ?? "Untitled"),
		dtStart: startParsed.iso,
		dtEnd: end,
		allDay,
		rrule: prop(body, "RRULE"),
		exdates: parseExdates(body),
		status,
		recurrenceId,
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
	const byDayTokens = parseByDayTokens(raw.rrule);
	const byMonthDays = parseByMonthDays(raw.rrule);
	const freq = /FREQ=([A-Z]+)/i.exec(raw.rrule)?.[1]?.toUpperCase();
	if (freq === "WEEKLY" && byDays.length > 0) {
		return expandWeeklyByDay(raw, byDays, durationDays, fromYear, toYear);
	}
	if (freq === "MONTHLY" && (byDayTokens.length > 0 || byMonthDays.length > 0)) {
		return expandMonthly(raw, byDayTokens, byMonthDays, durationDays, fromYear, toYear);
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
	const out: { start: string; end: string }[] = [];
	let emitted = 0;
	for (let i = 0; i < 800; i++) {
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
