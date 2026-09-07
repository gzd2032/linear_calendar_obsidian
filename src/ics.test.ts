import { describe, expect, it } from "vitest";
import { parseIcs, normalizeIcsUrl } from "./ics";

const sample = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:one@example.com
SUMMARY:Vacation
DTSTART;VALUE=DATE:20260907
DTEND;VALUE=DATE:20260910
END:VEVENT
BEGIN:VEVENT
UID:timed@example.com
SUMMARY:Meeting
DTSTART:20260907T150000Z
DTEND:20260907T160000Z
END:VEVENT
BEGIN:VEVENT
UID:weekly@example.com
SUMMARY:Standup
DTSTART;VALUE=DATE:20260105
DTEND;VALUE=DATE:20260106
RRULE:FREQ=WEEKLY;COUNT=3
END:VEVENT
END:VCALENDAR`;

describe("parseIcs", () => {
	it("parses all-day events and converts exclusive DTEND", () => {
		const events = parseIcs(sample, "Work", "#abc", 2026, 2026, true);
		const vacation = events.find((e) => e.icsUid === "one@example.com");
		expect(vacation?.start).toBe("2026-09-07");
		expect(vacation?.end).toBe("2026-09-09");
		expect(events.some((e) => e.icsUid === "timed@example.com")).toBe(false);
	});

	it("includes timed events when allDayOnly is false", () => {
		const events = parseIcs(sample, "Work", "#abc", 2026, 2026, false);
		expect(events.some((e) => e.icsUid === "timed@example.com")).toBe(true);
	});

	it("expands weekly RRULE within the year window", () => {
		const events = parseIcs(sample, "Work", "#abc", 2026, 2026, true);
		const standups = events.filter((e) => e.icsUid === "weekly@example.com");
		expect(standups).toHaveLength(3);
		expect(standups.map((e) => e.start)).toEqual(["2026-01-05", "2026-01-12", "2026-01-19"]);
	});

	it("unescapes summary text", () => {
		const ics = `BEGIN:VEVENT
UID:esc@example.com
SUMMARY:Hello\\, world\\nNext
DTSTART;VALUE=DATE:20260301
DTEND;VALUE=DATE:20260302
END:VEVENT`;
		const [event] = parseIcs(ics, "P", "#000", 2026, 2026, true);
		expect(event?.title).toContain("Hello, world");
	});

	it("expands weekly BYDAY and skips EXDATE", () => {
		const ics = `BEGIN:VEVENT
UID:byday@example.com
SUMMARY:Sync
DTSTART;VALUE=DATE:20260105
DTEND;VALUE=DATE:20260106
RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4
EXDATE;VALUE=DATE:20260107
END:VEVENT`;
		const events = parseIcs(ics, "Work", "#abc", 2026, 2026, true);
		expect(events.map((e) => e.start)).toEqual(["2026-01-05", "2026-01-12", "2026-01-14"]);
	});
});

describe("normalizeIcsUrl", () => {
	it("rewrites webcal to https", () => {
		expect(normalizeIcsUrl("webcal://example.com/cal.ics")).toBe("https://example.com/cal.ics");
		expect(normalizeIcsUrl(" https://example.com/cal.ics ")).toBe("https://example.com/cal.ics");
	});
});
