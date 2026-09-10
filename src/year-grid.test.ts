import { describe, expect, it } from "vitest";
import { buildYearGrid } from "./year-grid";
import { eventsAtCol, hasOverflowLanes, maxLanes, overflowCountAtCol, packLanes, segmentsForMonth, visibleLaneCount } from "./segments";
import type { CalendarEvent } from "./types";

const sampleEvent = (partial: Partial<CalendarEvent> & Pick<CalendarEvent, "start" | "end">): CalendarEvent => ({
	id: partial.id ?? "e1",
	title: partial.title ?? "Event",
	start: partial.start,
	end: partial.end,
	color: partial.color ?? "#A9C7E8",
	calendar: partial.calendar ?? "Personal",
});

describe("year-grid", () => {
	it("builds linear with 31 columns and marks today", () => {
		const grid = buildYearGrid(2026, "linear", 0, "2026-09-07");
		expect(grid.mode).toBe("linear");
		expect(grid.colCount).toBe(31);
		expect(grid.months).toHaveLength(12);
		const sep = grid.months[8];
		expect(sep?.cells.find((c) => c.date === "2026-09-07")?.isToday).toBe(true);
		expect(sep?.cells.filter((c) => !c.inMonth).length).toBeGreaterThan(0);
	});

	it("builds stacked with weekday headers", () => {
		const grid = buildYearGrid(2026, "stacked", 0, "2026-09-07");
		expect(grid.mode).toBe("stacked");
		expect(grid.headers[0]).toBe("Su");
		expect(grid.months[0]?.startCol).toBeGreaterThanOrEqual(0);
	});

	it("builds column and col-stack", () => {
		const column = buildYearGrid(2024, "column", 0, "2024-02-29");
		expect(column.yearLength).toBe(366);
		expect(column.months[1]?.cells).toHaveLength(29);
		const colStack = buildYearGrid(2026, "col-stack", 1, "2026-09-07");
		expect(colStack.mode).toBe("col-stack");
		expect(colStack.colCount).toBe(12);
	});
});

describe("segments", () => {
	it("packs non-overlapping events into one lane", () => {
		const packed = packLanes([
			{ event: sampleEvent({ start: "2026-01-01", end: "2026-01-02" }), startCol: 0, endCol: 1 },
			{ event: sampleEvent({ start: "2026-01-04", end: "2026-01-05" }), startCol: 3, endCol: 4 },
		]);
		expect(packed.every((s) => s.lane === 0)).toBe(true);
		expect(maxLanes(packed)).toBe(1);
	});

	it("stacks overlapping events into multiple lanes", () => {
		const packed = packLanes([
			{ event: sampleEvent({ start: "2026-01-01", end: "2026-01-10" }), startCol: 0, endCol: 9 },
			{ event: sampleEvent({ start: "2026-01-02", end: "2026-01-03" }), startCol: 1, endCol: 2 },
		]);
		expect(new Set(packed.map((s) => s.lane)).size).toBe(2);
		expect(maxLanes([])).toBe(1);
	});

	it("caps visible lanes and counts overflow per day column", () => {
		const packed = packLanes(
			[0, 1, 2, 3, 4, 5].map((i) => ({
				event: sampleEvent({ id: `e${i}`, start: "2026-01-02", end: "2026-01-02" }),
				startCol: 1,
				endCol: 1,
			})),
		);
		expect(maxLanes(packed)).toBe(6);
		expect(visibleLaneCount(packed)).toBe(4);
		expect(hasOverflowLanes(packed)).toBe(true);
		expect(overflowCountAtCol(packed, 1)).toBe(2);
		expect(overflowCountAtCol(packed, 0)).toBe(0);
		expect(eventsAtCol(packed, 1)).toHaveLength(6);
	});

	it("clips events to month bounds for segments", () => {
		const grid = buildYearGrid(2026, "linear", 0, "2026-09-07");
		const segments = segmentsForMonth(grid, 8, [
			sampleEvent({ id: "a", start: "2026-08-20", end: "2026-09-10" }),
			sampleEvent({ id: "b", start: "2026-10-01", end: "2026-10-05" }),
		]);
		expect(segments).toHaveLength(1);
		expect(segments[0]?.startCol).toBe(0);
		expect(segments[0]?.endCol).toBe(9);
	});
});
