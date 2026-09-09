import { describe, expect, it } from "vitest";
import {
	colorForName,
	contrastingTextColor,
	eventDayCount,
	formatEventRange,
	formatEventTooltip,
	formatShortDate,
	sanitizeFilename,
} from "./format";

describe("format", () => {
	it("counts inclusive days", () => {
		expect(eventDayCount("2026-06-24", "2026-06-24")).toBe(1);
		expect(eventDayCount("2026-06-24", "2026-07-15")).toBe(22);
		expect(eventDayCount("bad", "bad")).toBe(1);
	});

	it("formats short dates and ranges", () => {
		expect(formatShortDate("2026-09-07")).toBe("Sep 7");
		expect(formatShortDate("nope")).toBe("nope");
		expect(formatEventRange("2026-09-07", "2026-09-07")).toBe("Sep 7");
		expect(formatEventRange("2026-06-24", "2026-07-15")).toBe("Jun 24 – Jul 15");
	});

	it("builds tooltips", () => {
		expect(
			formatEventTooltip({
				id: "1",
				title: "Trip",
				start: "2026-09-07",
				end: "2026-09-08",
				color: "#fff",
				calendar: "Personal",
			}),
		).toBe("Trip\nSep 7 – Sep 8\n2 days");
	});

	it("sanitizes filenames and picks stable colors", () => {
		expect(sanitizeFilename('a/b:c*?"<>|')).toBe("a-b-c------");
		expect(sanitizeFilename("   ")).toBe("Untitled");
		expect(colorForName("Home")).toBe(colorForName("Home"));
		expect(colorForName("A")).not.toBe(colorForName("B"));
	});

	it("picks black or white text for stronger WCAG contrast", () => {
		expect(contrastingTextColor("#F0C987")).toBe("#1a1a1a");
		expect(contrastingTextColor("#A9C7E8")).toBe("#1a1a1a");
		expect(contrastingTextColor("#222222")).toBe("#ffffff");
		expect(contrastingTextColor("#5a4b80")).toBe("#ffffff");
		expect(contrastingTextColor("#abc")).toBe("#1a1a1a");
		expect(contrastingTextColor("not-a-color")).toBe("#3a322c");
	});
});
