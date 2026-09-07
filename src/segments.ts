import { daysInMonth, pad2, rangesOverlap } from "./dates";
import type { CalendarEvent, EventSegment, YearGrid } from "./types";

export function segmentsForMonth(
	grid: YearGrid,
	monthIndex: number,
	events: CalendarEvent[],
): EventSegment[] {
	const month = grid.months[monthIndex];
	if (!month) return [];
	const monthStart = `${grid.year}-${pad2(monthIndex + 1)}-01`;
	const monthEnd = `${grid.year}-${pad2(monthIndex + 1)}-${pad2(daysInMonth(grid.year, monthIndex))}`;
	const raw: Omit<EventSegment, "lane">[] = [];

	for (const event of events) {
		if (!rangesOverlap(event.start, event.end, monthStart, monthEnd)) continue;
		const startIso = event.start < monthStart ? monthStart : event.start;
		const endIso = event.end > monthEnd ? monthEnd : event.end;
		const startCell = month.cells.find((cell) => cell.date === startIso);
		const endCell = month.cells.find((cell) => cell.date === endIso);
		if (!startCell || !endCell) continue;
		raw.push({
			event,
			startCol: startCell.col,
			endCol: endCell.col,
		});
	}

	return packLanes(raw);
}

export function packLanes(segments: Omit<EventSegment, "lane">[]): EventSegment[] {
	const sorted = [...segments].sort((a, b) => {
		if (a.startCol !== b.startCol) return a.startCol - b.startCol;
		return b.endCol - b.startCol - (a.endCol - a.startCol);
	});
	const laneEnds: number[] = [];
	const packed: EventSegment[] = [];
	for (const segment of sorted) {
		let lane = laneEnds.findIndex((end) => end < segment.startCol);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(segment.endCol);
		} else {
			laneEnds[lane] = segment.endCol;
		}
		packed.push({ ...segment, lane });
	}
	return packed;
}

export function maxLanes(segments: EventSegment[]): number {
	if (segments.length === 0) return 1;
	return Math.max(...segments.map((segment) => segment.lane)) + 1;
}
