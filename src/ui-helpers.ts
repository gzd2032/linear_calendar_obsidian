import { div, el, mount } from "./dom";

export function iconButton(parent: HTMLElement, label: string, svg: string): HTMLButtonElement {
	const button = mount(
		parent,
		el("button", { cls: "byc-icon-btn", attr: { "aria-label": label, title: label } }),
	) as HTMLButtonElement;
	button.innerHTML = svg;
	return button;
}

export function chevronLeft(): string {
	return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>`;
}

export function chevronRight(): string {
	return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6"/></svg>`;
}

export function refreshIcon(): string {
	return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.3-6"/><path d="M21 3v6h-6"/></svg>`;
}

export function expandIcon(): string {
	return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><path d="M3 3l7 7M21 3l-7 7M3 21l7-7M21 21l-7-7"/></svg>`;
}

export function compressIcon(): string {
	return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h5V3M16 3v5h5M3 16h5v5M16 21v-5h5"/><path d="M8 8L3 3M16 8l5-5M8 16l-5 5M16 16l5 5"/></svg>`;
}

export function viewLabel(mode: string): string {
	if (mode === "linear") return "Linear";
	if (mode === "column") return "Column";
	if (mode === "col-stack") return "Col-Stack";
	return "Stacked";
}

export function uniqueCalendars(events: { calendar: string }[]): string[] {
	return [...new Set(events.map((event) => event.calendar))].sort();
}

export function toggleMenu(target: HTMLElement, other: HTMLElement): void {
	other.classList.add("is-hidden");
	target.classList.toggle("is-hidden");
}

export function padDay(day: number): string {
	return day.toString().padStart(2, "0");
}

export function emptyState(
	board: HTMLElement,
	opts: {
		query: boolean;
		hiddenCount: number;
		onShowAll?: () => void;
	},
): void {
	const empty = mount(board, div("byc-empty"));
	mount(
		empty,
		div(
			"byc-empty-title",
			opts.query ? "No events match this search" : "All calendars are hidden",
		),
	);
	mount(
		empty,
		div(
			"byc-empty-copy",
			opts.query
				? "Try a different query, or clear search."
				: "Turn calendars back on in Filters, or show everything.",
		),
	);
	if (opts.hiddenCount > 0 && opts.onShowAll) {
		const btn = mount(
			empty,
			el("button", { cls: "byc-btn byc-btn-accent", type: "button", text: "Show all" }),
		);
		btn.addEventListener("click", () => opts.onShowAll?.());
	}
}
