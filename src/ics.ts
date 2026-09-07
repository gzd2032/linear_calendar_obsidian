import { addDays, formatISODate, pad2, parseISODate } from "./dates";
import type { CalendarEvent } from "./types";

interface RawEvent {
	uid: string;
	summary: string;
	dtStart: string;
	dtEnd: string;
	allDay: boolean;
	rrule: string | null;
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
	};
}

function expandRawEvent(
	raw: RawEvent,
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
	const until = untilRaw ? parseIcsDate(`DUMMY:${untilRaw}`)?.iso : null;
	const windowStart = `${fromYear}-01-01`;
	const windowEnd = `${toYear}-12-31`;
	const out: { start: string; end: string }[] = [];
	let cursor = parseISODate(raw.dtStart);
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
		if (!advance(cursor, freq, interval)) break;
	}
	return out.length > 0 ? out : [{ start: raw.dtStart, end: raw.dtEnd }];
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

function propLine(body: string, name: string): string | null {
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
