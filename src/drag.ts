import { clampRange, eventDayCount, formatEventRange } from "./grid";

export interface DragState {
	dragging: boolean;
	dragStart: string | null;
	dragEnd: string | null;
}

const dragStates = new WeakMap<HTMLElement, DragState>();

export function getDragState(scope: HTMLElement): DragState {
	let state = dragStates.get(scope);
	if (!state) {
		state = { dragging: false, dragStart: null, dragEnd: null };
		dragStates.set(scope, state);
	}
	return state;
}

export function formatSelectionPreview(start: string, end: string): string {
	const range = clampRange(start, end);
	const days = eventDayCount(range.start, range.end);
	const dayLabel = days === 1 ? "1 day" : `${days} days`;
	return `${formatEventRange(range.start, range.end)} · ${dayLabel}`;
}

export function applySelection(
	scope: HTMLElement,
	start: string | null,
	end: string | null,
): void {
	const selected = start && end ? clampRange(start, end) : null;
	scope.querySelectorAll<HTMLElement>(".byc-cell").forEach((cell) => {
		const date = cell.dataset.date ?? "";
		cell.classList.toggle(
			"is-selected",
			Boolean(selected && date && date >= selected.start && date <= selected.end),
		);
	});
}

export function showDragPreview(
	scope: HTMLElement,
	start: string,
	end: string,
	clientX: number,
	clientY: number,
): void {
	const root = (scope.closest(".byc-root") as HTMLElement | null) ?? scope;
	let tip = root.querySelector<HTMLElement>(".byc-drag-preview");
	if (!tip) {
		tip = document.createElement("div");
		tip.className = "byc-drag-preview";
		root.appendChild(tip);
	}
	tip.textContent = formatSelectionPreview(start, end);
	tip.hidden = false;
	const pad = 14;
	const w = tip.offsetWidth || 160;
	const left = Math.min(clientX + pad, window.innerWidth - w - 8);
	const top = Math.min(clientY + pad, window.innerHeight - 36);
	tip.style.left = `${Math.max(8, left)}px`;
	tip.style.top = `${Math.max(8, top)}px`;
}

export function hideDragPreview(scope: HTMLElement): void {
	const root = (scope.closest(".byc-root") as HTMLElement | null) ?? scope;
	const tip = root.querySelector<HTMLElement>(".byc-drag-preview");
	if (tip) tip.hidden = true;
}

export type RangeSelectHandler = (start: string, end: string) => void;

export function wireCellDrag(
	cellEl: HTMLElement,
	date: string | undefined,
	scope: HTMLElement,
	onRangeSelect: RangeSelectHandler,
): void {
	if (!date) return;

	cellEl.addEventListener("pointerdown", (event) => {
		if ((event.target as HTMLElement).closest(".byc-event")) return;
		const state = getDragState(scope);
		state.dragging = true;
		state.dragStart = date;
		state.dragEnd = date;
		cellEl.setPointerCapture(event.pointerId);
		applySelection(scope, state.dragStart, state.dragEnd);
		showDragPreview(scope, state.dragStart, state.dragEnd, event.clientX, event.clientY);
	});
	cellEl.addEventListener("pointermove", (event) => {
		const state = getDragState(scope);
		if (!state.dragging) return;
		const hit = document.elementFromPoint(event.clientX, event.clientY);
		const hovered = hit?.closest(".byc-cell") as HTMLElement | null;
		const next = hovered?.dataset.date;
		if (next && next !== state.dragEnd) {
			state.dragEnd = next;
			applySelection(scope, state.dragStart, state.dragEnd);
		}
		if (state.dragStart && state.dragEnd) {
			showDragPreview(scope, state.dragStart, state.dragEnd, event.clientX, event.clientY);
		}
	});
	cellEl.addEventListener("pointerup", () => {
		const state = getDragState(scope);
		if (!state.dragging || !state.dragStart || !state.dragEnd) return;
		state.dragging = false;
		const range = clampRange(state.dragStart, state.dragEnd);
		state.dragStart = null;
		state.dragEnd = null;
		applySelection(scope, null, null);
		hideDragPreview(scope);
		onRangeSelect(range.start, range.end);
	});
}
