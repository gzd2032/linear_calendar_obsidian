import { MONTHS, WEEKDAYS } from "./types";

export function pad2(n: number): string {
	return n.toString().padStart(2, "0");
}

export function formatISODate(date: Date): string {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseISODate(value: string): Date | null {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(year, month - 1, day);
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day
	) {
		return null;
	}
	return date;
}

export function addDays(iso: string, days: number): string {
	const date = parseISODate(iso);
	if (!date) return iso;
	date.setDate(date.getDate() + days);
	return formatISODate(date);
}

export function daysInMonth(year: number, month: number): number {
	return new Date(year, month + 1, 0).getDate();
}

export function weekdayIndex(year: number, month: number, day: number): number {
	return new Date(year, month, day).getDay();
}

export function weekdayLabel(index: number): string {
	return WEEKDAYS[((index % 7) + 7) % 7] ?? "Su";
}

export function monthLabel(month: number): string {
	return MONTHS[month] ?? "Jan";
}

export function clampRange(start: string, end: string): { start: string; end: string } {
	return start <= end ? { start, end } : { start: end, end: start };
}

export function rangesOverlap(
	aStart: string,
	aEnd: string,
	bStart: string,
	bEnd: string,
): boolean {
	return aStart <= bEnd && aEnd >= bStart;
}

export function isoInYear(iso: string, year: number): boolean {
	return iso.startsWith(`${year}-`);
}

/** Gregorian leap-year length. */
export function yearLength(year: number): number {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 366 : 365;
}
