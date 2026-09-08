import { describe, expect, it } from "vitest";
import {
	GOOGLE_FOLDER,
	googleCalendarDayUrl,
	googleCalendarFolder,
	isGoogleEvent,
	isGooglePath,
	localCalendarFolder,
	localCalendarNames,
	partitionCalendars,
	sanitizeCalendarName,
} from "./calendar-paths";

describe("calendar-paths", () => {
	it("builds local and google folders", () => {
		expect(localCalendarFolder("Calendar", "Personal")).toBe("Calendar/Personal");
		expect(googleCalendarFolder("Calendar", "Work")).toBe(`Calendar/${GOOGLE_FOLDER}/Work`);
	});

	it("refuses google as a local calendar name", () => {
		expect(sanitizeCalendarName("google")).toBe("Personal");
		expect(sanitizeCalendarName("Google")).toBe("Personal");
		expect(localCalendarFolder("Calendar", "google")).toBe("Calendar/Personal");
	});

	it("detects google paths and events", () => {
		expect(isGooglePath("Calendar/google/Work/note.md", "Calendar")).toBe(true);
		expect(isGooglePath("Calendar/Personal/note.md", "Calendar")).toBe(false);
		expect(
			isGoogleEvent({ path: "Calendar/Personal/a.md", icsUid: "x@google.com" }, "Calendar"),
		).toBe(true);
		expect(isGoogleEvent({ path: "Calendar/Personal/a.md" }, "Calendar")).toBe(false);
	});

	it("builds Google Calendar day URLs without zero-padding", () => {
		expect(googleCalendarDayUrl("2026-09-07")).toBe(
			"https://calendar.google.com/calendar/r/day/2026/9/7",
		);
		expect(googleCalendarDayUrl("bad")).toBeNull();
	});

	it("lists local calendars and partitions filters", () => {
		const events = [
			{
				id: "1",
				title: "Local",
				start: "2026-01-01",
				end: "2026-01-01",
				color: "#fff",
				calendar: "Personal",
				path: "Calendar/Personal/a.md",
			},
			{
				id: "2",
				title: "Trip",
				start: "2026-02-01",
				end: "2026-02-01",
				color: "#fff",
				calendar: "Work",
				path: "Calendar/google/Work/b.md",
				icsUid: "trip@google.com",
			},
		];
		expect(localCalendarNames(events, "Calendar", "Personal")).toEqual(["Personal"]);
		expect(partitionCalendars(events, "Calendar")).toEqual({
			local: ["Personal"],
			google: ["Work"],
		});
	});
});
