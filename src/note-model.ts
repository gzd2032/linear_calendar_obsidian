import type { CalendarEvent } from "./types";

export function toIsoDate(value: unknown): string | null {
	if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
		return value.trim().slice(0, 10);
	}
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const y = value.getFullYear();
		const m = String(value.getMonth() + 1).padStart(2, "0");
		const d = String(value.getDate()).padStart(2, "0");
		return `${y}-${m}-${d}`;
	}
	return null;
}

/** Body text after YAML frontmatter and the leading `# Title` heading. */
export function extractNoteDescription(content: string): string {
	let body = content;
	if (body.startsWith("---")) {
		const end = body.indexOf("\n---", 3);
		if (end !== -1) body = body.slice(end + 4);
	}
	body = body.replace(/^\s*#[^\n]*\r?\n?/, "");
	return body.trim();
}

export function buildNoteBody(event: Omit<CalendarEvent, "id" | "path">): string {
	const lines = [
		"---",
		`start: ${event.start}`,
		`end: ${event.end}`,
		`color: "${event.color}"`,
		`calendar: "${event.calendar.replace(/"/g, '\\"')}"`,
	];
	if (event.icsUid) lines.push(`ics-uid: ${event.icsUid}`);
	lines.push("---", "", `# ${event.title}`, "");
	const description = (event.description ?? "").trim();
	if (description) lines.push(description, "");
	return lines.join("\n");
}

export function eventFromFrontmatter(input: {
	path: string;
	basename: string;
	frontmatter: Record<string, unknown>;
	heading?: string;
}): CalendarEvent | null {
	const fm = input.frontmatter;
	const start = toIsoDate(fm.start ?? fm.date);
	if (!start) return null;
	const end = toIsoDate(fm.end ?? fm.date_end ?? fm.start) ?? start;
	const title =
		(typeof fm.title === "string" && fm.title) ||
		input.heading ||
		input.basename.replace(/^\d{4}-\d{2}-\d{2}\s*/, "");
	const calendar = typeof fm.calendar === "string" && fm.calendar ? fm.calendar : "Personal";
	const color = typeof fm.color === "string" && fm.color ? fm.color : "#A9C7E8";
	return {
		id: input.path,
		title,
		start,
		end: end < start ? start : end,
		color,
		calendar,
		path: input.path,
		icsUid: typeof fm["ics-uid"] === "string" ? fm["ics-uid"] : undefined,
	};
}

/** ICS notes in `year` that are no longer in the latest feed for that year. */
export function staleIcsNotes(
	existing: CalendarEvent[],
	incoming: CalendarEvent[],
	year: number,
): CalendarEvent[] {
	const incomingKeys = new Set(
		incoming.filter((event) => event.icsUid).map((event) => `${event.icsUid}:${event.start}`),
	);
	const prefix = `${year}-`;
	return existing.filter((event) => {
		if (!event.icsUid || !event.path) return false;
		if (!event.start.startsWith(prefix)) return false;
		return !incomingKeys.has(`${event.icsUid}:${event.start}`);
	});
}
