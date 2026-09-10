import { describe, expect, it } from "vitest";
import {
	GOOGLE_FOLDER,
	calendarFilterId,
	eventFromNoteFilename,
	googleCalendarDayUrl,
	googleCalendarFolder,
	isGoogleEvent,
	isGooglePath,
	listFilterCalendars,
	localCalendarFolder,
	localCalendarNames,
	mergeLocalCalendarNames,
	migrateHiddenCalendarIds,
	notePathInFolder,
	partitionCalendars,
	sanitizeCalendarName,
	uniqueNotePath,
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

	it("merges local calendar names and skips blanks", () => {
		expect(mergeLocalCalendarNames(["Work", ""], ["Personal", "Work"])).toEqual([
			"Personal",
			"Work",
		]);
	});

	it("places a note in another folder and uniquifies collisions", () => {
		expect(notePathInFolder("Calendar/Personal/2026-01-01 Trip.md", "Calendar/Work")).toBe(
			"Calendar/Work/2026-01-01 Trip.md",
		);
		const taken = new Set(["Calendar/Work/2026-01-01 Trip.md", "Calendar/Work/2026-01-01 Trip 2.md"]);
		expect(uniqueNotePath("Calendar/Work/2026-01-01 Trip.md", (path) => taken.has(path))).toBe(
			"Calendar/Work/2026-01-01 Trip 3.md",
		);
		expect(uniqueNotePath("Calendar/Work/fresh.md", (path) => taken.has(path))).toBe(
			"Calendar/Work/fresh.md",
		);
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
		expect(partitionCalendars(events, "Calendar", ["Family Events"])).toEqual({
			local: ["Personal"],
			google: ["Family Events", "Work"],
		});
	});

	it("keys local and Google calendars with the same name separately", () => {
		const localWork = {
			id: "1",
			title: "Local Work",
			start: "2026-01-01",
			end: "2026-01-01",
			color: "#A9C7E8",
			calendar: "Work",
			path: "Calendar/Work/a.md",
		};
		const googleWork = {
			id: "2",
			title: "Google Work",
			start: "2026-01-02",
			end: "2026-01-02",
			color: "#C5B3E0",
			calendar: "Work",
			path: "Calendar/google/Work/b.md",
			icsUid: "b@google.com",
		};
		const sources = [
			{
				id: "src-work",
				name: "Work",
				url: "https://example.com/work.ics",
				color: "#C5B3E0",
				enabled: true,
			},
			{
				id: "src-family",
				name: "Family Events",
				url: "https://example.com/family.ics",
				color: "#F0C987",
				enabled: true,
			},
		];
		expect(calendarFilterId(localWork, "Calendar", sources)).toBe("local:Work");
		expect(calendarFilterId(googleWork, "Calendar", sources)).toBe("google:src-work");
		expect(
			listFilterCalendars({
				events: [localWork, googleWork],
				eventsFolder: "Calendar",
				icsSources: sources,
				defaultCalendar: "Personal",
				googleHolidaysEnabled: false,
				googleHolidaysColor: "#F0C987",
			}),
		).toEqual({
			local: [
				{
					id: "local:Personal",
					name: "Personal",
					kind: "local",
					color: "#A9C7E8",
					eventCount: 0,
					imported: true,
				},
				{
					id: "local:Work",
					name: "Work",
					kind: "local",
					color: "#A9C7E8",
					eventCount: 1,
					imported: true,
				},
			],
			google: [
				{
					id: "google:src-family",
					name: "Family Events",
					kind: "google",
					color: "#F0C987",
					eventCount: 0,
					imported: false,
				},
				{
					id: "google:src-work",
					name: "Work",
					kind: "google",
					color: "#C5B3E0",
					eventCount: 1,
					imported: true,
				},
			],
		});
	});

	it("maps holidays to a stable google source id", () => {
		expect(
			calendarFilterId(
				{
					calendar: "Google Holidays",
					path: "Calendar/google/Google Holidays/x.md",
					icsUid: "holiday@google.com",
				},
				"Calendar",
				[],
			),
		).toBe("google:google-us-holidays");
	});

	it("keeps orphan Google notes filterable after the source is removed", () => {
		expect(
			calendarFilterId(
				{
					calendar: "Annual Events",
					path: "Calendar/google/Annual Events/x.md",
					icsUid: "x@google.com",
				},
				"Calendar",
				[],
			),
		).toBe("google:name:Annual Events");
	});

	it("expands pre-v7 hidden names into local and google ids", () => {
		expect(
			migrateHiddenCalendarIds(["Work", "local:Home"], [
				{
					id: "src-work",
					name: "Work",
					url: "https://example.com/work.ics",
					color: "#C5B3E0",
					enabled: true,
				},
			]),
		).toEqual(["local:Work", "google:src-work", "local:Home"]);
		expect(migrateHiddenCalendarIds(["Google Holidays"], [])).toEqual([
			"local:Google Holidays",
			"google:google-us-holidays",
		]);
	});

	it("recovers events from dated filenames when Properties are missing", () => {
		expect(
			eventFromNoteFilename({
				path: "Calendar/google/Annual Events/2026-03-15 Pat.md",
				basename: "2026-03-15 Pat",
				eventsFolder: "Calendar",
			}),
		).toMatchObject({
			start: "2026-03-15",
			title: "Pat",
			calendar: "Annual Events",
			path: "Calendar/google/Annual Events/2026-03-15 Pat.md",
		});
	});
});
