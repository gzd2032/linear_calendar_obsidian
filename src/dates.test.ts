import { describe, expect, it } from "vitest";
import {
	addDays,
	clampRange,
	daysInMonth,
	formatISODate,
	isoInYear,
	monthLabel,
	pad2,
	parseISODate,
	rangesOverlap,
	weekdayIndex,
	weekdayLabel,
	yearLength,
} from "./dates";

describe("dates", () => {
	it("pads numbers", () => {
		expect(pad2(3)).toBe("03");
		expect(pad2(12)).toBe("12");
	});

	it("formats and parses ISO dates", () => {
		expect(formatISODate(new Date(2026, 8, 7))).toBe("2026-09-07");
		expect(parseISODate("2026-09-07")?.getDate()).toBe(7);
		expect(parseISODate("not-a-date")).toBeNull();
		expect(parseISODate("2026-02-30")).toBeNull();
	});

	it("adds days and clamps ranges", () => {
		expect(addDays("2026-09-07", 2)).toBe("2026-09-09");
		expect(addDays("bad", 1)).toBe("bad");
		expect(clampRange("2026-09-10", "2026-09-07")).toEqual({
			start: "2026-09-07",
			end: "2026-09-10",
		});
	});

	it("computes calendar helpers", () => {
		expect(daysInMonth(2024, 1)).toBe(29);
		expect(daysInMonth(2025, 1)).toBe(28);
		expect(yearLength(2024)).toBe(366);
		expect(yearLength(1900)).toBe(365);
		expect(yearLength(2000)).toBe(366);
		expect(weekdayIndex(2026, 8, 7)).toBe(1);
		expect(weekdayLabel(1)).toBe("Mo");
		expect(weekdayLabel(-1)).toBe("Sa");
		expect(monthLabel(8)).toBe("Sep");
		expect(monthLabel(99)).toBe("Jan");
		expect(isoInYear("2026-01-01", 2026)).toBe(true);
		expect(isoInYear("2025-12-31", 2026)).toBe(false);
	});

	it("detects range overlap", () => {
		expect(rangesOverlap("2026-01-01", "2026-01-10", "2026-01-05", "2026-01-20")).toBe(true);
		expect(rangesOverlap("2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04")).toBe(false);
	});
});
