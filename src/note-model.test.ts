import { describe, expect, it } from "vitest";
import {
	buildNoteBody,
	eventFromFrontmatter,
	extractNoteDescription,
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
});

describe("drag preview helper", () => {
	it("formats selection preview", () => {
		expect(formatSelectionPreview("2026-09-10", "2026-09-07")).toBe("Sep 7 – Sep 10 · 4 days");
		expect(formatSelectionPreview("2026-09-07", "2026-09-07")).toBe("Sep 7 · 1 day");
	});
});
