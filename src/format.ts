import type { CalendarEvent } from "./types";
import { MONTHS } from "./types";
import { parseISODate } from "./dates";

export function colorForName(name: string): string {
	const colors = [
		"#E7A989",
		"#A9C7E8",
		"#C5B3E0",
		"#F0C987",
		"#B5CDB0",
		"#E8B4C4",
		"#9DC8C5",
		"#D4B896",
	];
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
	}
	return colors[hash % colors.length] ?? "#A9C7E8";
}

export function sanitizeFilename(title: string): string {
	return (
		title
			.replace(/[\\/:*?"<>|]/g, "-")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 80) || "Untitled"
	);
}

/** Inclusive day count (Jun 24–Jun 24 = 1 day). */
export function eventDayCount(start: string, end: string): number {
	const a = parseISODate(start);
	const b = parseISODate(end);
	if (!a || !b) return 1;
	return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export function formatShortDate(iso: string): string {
	const date = parseISODate(iso);
	if (!date) return iso;
	return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function formatEventRange(start: string, end: string): string {
	if (start === end) return formatShortDate(start);
	return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

export function formatEventTooltip(event: CalendarEvent): string {
	const days = eventDayCount(event.start, event.end);
	const dayLabel = days === 1 ? "1 day" : `${days} days`;
	return `${event.title}\n${formatEventRange(event.start, event.end)}\n${dayLabel}`;
}
