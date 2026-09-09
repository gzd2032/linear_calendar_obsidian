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

/** Opening `---` through the closing fence, including a trailing newline. */
const YAML_FRONTMATTER = /^[\uFEFF\s]*---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;

/** Quote YAML scalars that would break Properties (`#` colors, spaces, quotes). */
function yamlScalar(value: string): string {
	if (value === "" || /[^A-Za-z0-9_./-]/.test(value)) return JSON.stringify(value);
	return value;
}

/** Body text after YAML frontmatter and the leading `# Title` heading. */
export function extractNoteDescription(content: string): string {
	const withoutBom = content.replace(/^\uFEFF/, "");
	const fence = withoutBom.match(YAML_FRONTMATTER);
	const body = fence ? withoutBom.slice(fence[0].length) : withoutBom;
	return body.replace(/^\s*#[^\n]*\r?\n?/, "").trim();
}

/**
 * Obsidian Properties only parse a tight fence: `---` with no trailing spaces,
 * keys immediately after the opener, and the heading on the next line after the closer.
 */
export function buildNoteBody(event: Omit<CalendarEvent, "id" | "path">): string {
	const title = event.title.trim() || "Untitled";
	const lines = [
		"---",
		`start: ${event.start}`,
		`end: ${event.end}`,
		`color: ${yamlScalar(event.color)}`,
		`calendar: ${yamlScalar(event.calendar)}`,
	];
	if (event.icsUid) lines.push(`ics-uid: ${yamlScalar(event.icsUid)}`);
	lines.push("---", "", `# ${title}`);
	const description = (event.description ?? "").trim();
	if (description) lines.push("", description);
	return `${lines.join("\n")}\n`;
}

/** Markdown after Properties: `# Title` plus optional description. */
export function buildNoteMarkdown(event: Omit<CalendarEvent, "id" | "path">): string {
	const title = event.title.trim() || "Untitled";
	const description = (event.description ?? "").trim();
	return description ? `# ${title}\n\n${description}\n` : `# ${title}\n`;
}

export function assignEventFrontmatter(
	fm: Record<string, unknown>,
	event: Omit<CalendarEvent, "id" | "path">,
): void {
	fm.start = event.start;
	fm.end = event.end;
	fm.color = event.color;
	fm.calendar = event.calendar;
	if (event.icsUid) fm["ics-uid"] = event.icsUid;
	else delete fm["ics-uid"];
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
