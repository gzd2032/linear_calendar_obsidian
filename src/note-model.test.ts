import { describe, expect, it } from "vitest";
import {
	buildNoteBody,
	eventFromFrontmatter,
	extractNoteDescription,
	staleIcsNotes,
	toIsoDate,
} from "./note-model";
import { formatSelectionPreview } from "./drag";

describe("note-model", () => {
	it("parses dates from strings and Date objects", () => {
		expect(toIsoDate("2026-09-07T12:00:00")).toBe("2026-09-07");
		expect(toIsoDate(new Date(2026, 8, 7))).toBe("2026-09-07");
		expect(toIsoDate(42)).toBeNull();
	});

	it("extracts description after frontmatter and title", () => {
		const content = `---
start: 2026-09-07
---

# Title

Body line
More`;
		expect(extractNoteDescription(content)).toBe("Body line\nMore");
		expect(extractNoteDescription("# Only title")).toBe("");
	});

	it("builds note bodies with optional description and ics uid", () => {
		const body = buildNoteBody({
			title: "Trip",
			start: "2026-09-07",
			end: "2026-09-08",
			color: "#fff",
			calendar: 'Say "hi"',
			description: "Pack bags",
			icsUid: "abc",
		});
		expect(body).toContain('calendar: "Say \\"hi\\""');
		expect(body).toContain("ics-uid: abc");
		expect(body).toContain("Pack bags");
	});

	it("maps frontmatter to events", () => {
		const event = eventFromFrontmatter({
			path: "Calendar/note.md",
			basename: "2026-09-07 Note",
			frontmatter: { start: "2026-09-10", end: "2026-09-09", color: "#123" },
		});
		expect(event?.end).toBe("2026-09-10");
		expect(event?.title).toBe("Note");
		expect(eventFromFrontmatter({ path: "x", basename: "x", frontmatter: {} })).toBeNull();
	});

	it("finds stale ICS notes in the import year only", () => {
		const existing = [
			{
				id: "a",
				title: "Gone",
				start: "2026-03-01",
				end: "2026-03-01",
				color: "#fff",
				calendar: "Work",
				path: "Calendar/Work/gone.md",
				icsUid: "gone@example.com",
			},
			{
				id: "b",
				title: "Kept",
				start: "2026-04-01",
				end: "2026-04-01",
				color: "#fff",
				calendar: "Work",
				path: "Calendar/Work/kept.md",
				icsUid: "kept@example.com",
			},
			{
				id: "c",
				title: "Next year",
				start: "2027-01-01",
				end: "2027-01-01",
				color: "#fff",
				calendar: "Work",
				path: "Calendar/Work/next.md",
				icsUid: "next@example.com",
			},
			{
				id: "d",
				title: "Manual",
				start: "2026-05-01",
				end: "2026-05-01",
				color: "#fff",
				calendar: "Work",
				path: "Calendar/Work/manual.md",
			},
		];
		const incoming = [
			{
				id: "b",
				title: "Kept",
				start: "2026-04-01",
				end: "2026-04-01",
				color: "#fff",
				calendar: "Work",
				icsUid: "kept@example.com",
			},
		];
		expect(staleIcsNotes(existing, incoming, 2026).map((event) => event.path)).toEqual([
			"Calendar/Work/gone.md",
		]);
	});
});

describe("drag preview helper", () => {
	it("formats selection preview", () => {
		expect(formatSelectionPreview("2026-09-10", "2026-09-07")).toBe("Sep 7 – Sep 10 · 4 days");
		expect(formatSelectionPreview("2026-09-07", "2026-09-07")).toBe("Sep 7 · 1 day");
	});
});
