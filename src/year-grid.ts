import {
	daysInMonth,
	monthLabel,
	pad2,
	weekdayIndex,
	weekdayLabel,
	yearLength,
} from "./dates";
import { MONTHS, type DayCell, type MonthGrid, type ViewMode, type YearGrid } from "./types";

export function buildYearGrid(
	year: number,
	mode: ViewMode,
	weekStartsOn: number,
	todayIso: string,
): YearGrid {
	const weekStart = ((weekStartsOn % 7) + 7) % 7;
	if (mode === "linear") return buildLinearGrid(year, todayIso);
	if (mode === "column") return buildColumnGrid(year, todayIso);
	if (mode === "col-stack") return buildColStackGrid(year, weekStart, todayIso);
	return buildStackedGrid(year, weekStart, todayIso);
}

function makeDayCell(partial: Omit<DayCell, "isWeekend" | "isToday"> & { todayIso: string }): DayCell {
	const { todayIso, ...rest } = partial;
	return {
		...rest,
		isWeekend: rest.weekday === 0 || rest.weekday === 6,
		isToday: rest.date === todayIso,
	};
}

function buildLinearGrid(year: number, todayIso: string): YearGrid {
	const colCount = 31;
	const headers = Array.from({ length: colCount }, (_, i) => String(i + 1));
	const months: MonthGrid[] = [];
	for (let month = 0; month < 12; month++) {
		const count = daysInMonth(year, month);
		const cells: DayCell[] = [];
		for (let day = 1; day <= colCount; day++) {
			const inMonth = day <= count;
			const date = inMonth ? `${year}-${pad2(month + 1)}-${pad2(day)}` : "";
			const weekday = inMonth ? weekdayIndex(year, month, day) : -1;
			cells.push(
				makeDayCell({
					col: day - 1,
					day: inMonth ? day : 0,
					date,
					weekday,
					inMonth,
					todayIso,
				}),
			);
		}
		months.push({ month, label: monthLabel(month), startCol: 0, cells });
	}
	return { year, mode: "linear", colCount, headers, months };
}

function buildStackedGrid(year: number, weekStart: number, todayIso: string): YearGrid {
	let colCount = 0;
	const offsets: number[] = [];
	for (let month = 0; month < 12; month++) {
		const offset = (weekdayIndex(year, month, 1) - weekStart + 7) % 7;
		offsets.push(offset);
		colCount = Math.max(colCount, offset + daysInMonth(year, month));
	}

	const headers = Array.from({ length: colCount }, (_, col) => weekdayLabel(weekStart + col));
	const months: MonthGrid[] = [];
	for (let month = 0; month < 12; month++) {
		const offset = offsets[month] ?? 0;
		const count = daysInMonth(year, month);
		const cells: DayCell[] = [];
		for (let col = 0; col < colCount; col++) {
			const day = col - offset + 1;
			const inMonth = day >= 1 && day <= count;
			const date = inMonth ? `${year}-${pad2(month + 1)}-${pad2(day)}` : "";
			const weekday = (weekStart + col) % 7;
			cells.push(
				makeDayCell({
					col,
					day: inMonth ? day : 0,
					date,
					weekday,
					inMonth,
					todayIso,
				}),
			);
		}
		months.push({ month, label: monthLabel(month), startCol: offset, cells });
	}
	return { year, mode: "stacked", colCount, headers, months };
}

function buildColumnGrid(year: number, todayIso: string): YearGrid {
	const length = yearLength(year);
	const headers = MONTHS.map((label) => label);
	const months: MonthGrid[] = [];
	let offset = 0;
	for (let month = 0; month < 12; month++) {
		const count = daysInMonth(year, month);
		const cells: DayCell[] = [];
		for (let day = 1; day <= count; day++) {
			const date = `${year}-${pad2(month + 1)}-${pad2(day)}`;
			const weekday = weekdayIndex(year, month, day);
			cells.push(
				makeDayCell({
					col: day - 1,
					day,
					date,
					weekday,
					inMonth: true,
					yearDay: offset + day - 1,
					todayIso,
				}),
			);
		}
		months.push({
			month,
			label: monthLabel(month),
			startCol: offset,
			yearDayOffset: offset,
			cells,
		});
		offset += count;
	}
	return { year, mode: "column", colCount: 12, headers, months, yearLength: length };
}

function buildColStackGrid(year: number, weekStart: number, todayIso: string): YearGrid {
	const offsets: number[] = [];
	let rowCount = 0;
	for (let month = 0; month < 12; month++) {
		const offset = (weekdayIndex(year, month, 1) - weekStart + 7) % 7;
		offsets.push(offset);
		rowCount = Math.max(rowCount, offset + daysInMonth(year, month));
	}

	const headers = MONTHS.map((label) => label);
	const months: MonthGrid[] = [];
	for (let month = 0; month < 12; month++) {
		const offset = offsets[month] ?? 0;
		const count = daysInMonth(year, month);
		const cells: DayCell[] = [];
		for (let row = 0; row < rowCount; row++) {
			const day = row - offset + 1;
			const inMonth = day >= 1 && day <= count;
			const date = inMonth ? `${year}-${pad2(month + 1)}-${pad2(day)}` : "";
			const weekday = (weekStart + row) % 7;
			cells.push(
				makeDayCell({
					col: row,
					day: inMonth ? day : 0,
					date,
					weekday,
					inMonth,
					todayIso,
				}),
			);
		}
		months.push({ month, label: monthLabel(month), startCol: offset, cells });
	}
	return { year, mode: "col-stack", colCount: 12, headers, months };
}
