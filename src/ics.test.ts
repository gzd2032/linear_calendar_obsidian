import { describe, expect, it } from "vitest";
import {
	countVevents,
	diagnoseIcs,
	icsTextFromResponse,
	isIcsCalendar,
	icsUrlIssue,
	normalizeIcsUrl,
	parseIcs,
} from "./ics";

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

describe("parseIcs first-commit behavior", () => {
	it("parses all-day events and converts exclusive DTEND", () => {
		const events = parseIcs(sample, "Work", "#abc", 2026, 2026, true);
		const vacation = events.find((event) => event.icsUid === "one@example.com");
		expect(vacation?.start).toBe("2026-09-07");
		expect(vacation?.end).toBe("2026-09-09");
		expect(events.some((event) => event.icsUid === "timed@example.com")).toBe(false);
	});

	it("includes timed events when allDayOnly is false", () => {
		const events = parseIcs(sample, "Work", "#abc", 2026, 2026, false);
		expect(events.some((event) => event.icsUid === "timed@example.com")).toBe(true);
	});

	it("expands weekly RRULE within the year window", () => {
		const events = parseIcs(sample, "Work", "#abc", 2026, 2026, true);
		const standups = events.filter((event) => event.icsUid === "weekly@example.com");
		expect(standups).toHaveLength(3);
		expect(standups.map((event) => event.start)).toEqual([
			"2026-01-05",
			"2026-01-12",
			"2026-01-19",
		]);
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
});

describe("ICS response diagnostics", () => {
	it("accepts a VCALENDAR feed and rejects HTML", () => {
		expect(isIcsCalendar(sample)).toBe(true);
		expect(isIcsCalendar("<!DOCTYPE html><html><body>Sign in</body></html>")).toBe(false);
	});

	it("decodes arrayBuffer when text is empty", () => {
		const encoded = new TextEncoder().encode(sample);
		expect(icsTextFromResponse({ text: "", arrayBuffer: encoded.buffer })).toContain("BEGIN:VCALENDAR");
		expect(countVevents(sample)).toBe(3);
	});

	it("reports parser-stage counts", () => {
		expect(diagnoseIcs(sample, 2026)).toMatchObject({
			vevents: 3,
			decoded: 3,
			invalid: 0,
			expandedInYear: 5,
			expandedAllDayInYear: 4,
		});
	});
});

describe("normalizeIcsUrl", () => {
	it("rewrites webcal to https", () => {
		expect(normalizeIcsUrl("webcal://example.com/cal.ics")).toBe("https://example.com/cal.ics");
		expect(normalizeIcsUrl(" https://example.com/cal.ics ")).toBe("https://example.com/cal.ics");
	});
});

describe("icsUrlIssue", () => {
	it("allows empty URLs", () => {
		expect(icsUrlIssue("")).toBeNull();
		expect(icsUrlIssue("   ")).toBeNull();
	});

	it("accepts http(s) and webcal calendar URLs", () => {
		expect(icsUrlIssue("https://calendar.google.com/calendar/ical/x/private/basic.ics")).toBeNull();
		expect(icsUrlIssue("webcal://example.com/cal.ics")).toBeNull();
	});

	it("rejects non-URLs", () => {
		expect(icsUrlIssue("not a url")).toBe("That doesn’t look like a valid calendar URL.");
	});
});
