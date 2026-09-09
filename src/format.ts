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

/** Parse `#RGB` / `#RRGGBB` (optional alpha ignored). */
function parseHexColor(color: string): { r: number; g: number; b: number } | null {
	const raw = color.trim().replace(/^#/, "");
	if (/^[0-9a-f]{3}$/i.test(raw)) {
		return {
			r: Number.parseInt(raw[0]! + raw[0]!, 16),
			g: Number.parseInt(raw[1]! + raw[1]!, 16),
			b: Number.parseInt(raw[2]! + raw[2]!, 16),
		};
	}
	if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(raw)) {
		return {
			r: Number.parseInt(raw.slice(0, 2), 16),
			g: Number.parseInt(raw.slice(2, 4), 16),
			b: Number.parseInt(raw.slice(4, 6), 16),
		};
	}
	return null;
}

function channelLuminance(channel: number): number {
	const c = channel / 255;
	return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of an sRGB color. */
function relativeLuminance(r: number, g: number, b: number): number {
	return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

function contrastAgainst(luminance: number, against: number): number {
	const lighter = Math.max(luminance, against);
	const darker = Math.min(luminance, against);
	return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Black or white text for a background, choosing the higher WCAG contrast.
 * Falls back to the existing event-bar dark text when the color cannot be parsed.
 */
export function contrastingTextColor(background: string): string {
	const rgb = parseHexColor(background);
	if (!rgb) return "#3a322c";
	const L = relativeLuminance(rgb.r, rgb.g, rgb.b);
	const white = contrastAgainst(L, 1);
	const black = contrastAgainst(L, 0);
	return white >= black ? "#ffffff" : "#1a1a1a";
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
