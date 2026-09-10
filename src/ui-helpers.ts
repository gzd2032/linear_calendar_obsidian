import { div, el, mount } from "./dom";

type CreateSvgFn = (tag: string) => SVGElement;

/** Build an SVG icon via Obsidian createSvg (or preview shim) — no createElementNS in src/. */
export function svgIcon(paths: string[], size = 16): SVGSVGElement {
	const win = window as unknown as {
		createSvg?: CreateSvgFn;
		activeWindow?: Window & { createSvg?: CreateSvgFn };
	};
	const createSvg = win.activeWindow?.createSvg ?? win.createSvg;
	if (typeof createSvg !== "function") {
		throw new Error("createSvg is required (Obsidian runtime or preview/obsidian-dom-shim)");
	}
	const svg = createSvg("svg") as SVGSVGElement;
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("width", String(size));
	svg.setAttribute("height", String(size));
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-width", "2");
	for (const d of paths) {
		const path = createSvg("path");
		path.setAttribute("d", d);
		svg.appendChild(path);
	}
	return svg;
}

export function iconButton(
	parent: HTMLElement,
	label: string,
	icon: SVGSVGElement,
): HTMLButtonElement {
	const button = mount(
		parent,
		el("button", { cls: "byc-icon-btn", type: "button", attr: { "aria-label": label, title: label } }),
	) as HTMLButtonElement;
	button.appendChild(icon);
	return button;
}

/** Footer-style button with icon + text label (no innerHTML). */
export function labeledIconButton(
	parent: HTMLElement,
	label: string,
	cls: string,
	icon: SVGSVGElement,
): HTMLButtonElement {
	const button = mount(
		parent,
		el("button", {
			cls,
			type: "button",
			attr: { "aria-label": label, title: label },
		}),
	) as HTMLButtonElement;
	button.appendChild(icon);
	button.appendChild(el("span", { text: label }));
	return button;
}

export function chevronLeft(): SVGSVGElement {
	return svgIcon(["M15 6l-6 6 6 6"]);
}

export function chevronRight(): SVGSVGElement {
	return svgIcon(["M9 6l6 6-6 6"]);
}

export function refreshIcon(): SVGSVGElement {
	return svgIcon(["M21 12a9 9 0 1 1-2.3-6", "M21 3v6h-6"]);
}

export function spinnerIcon(): SVGSVGElement {
	const svg = svgIcon(["M12 3a9 9 0 1 1-6.36 2.64"]);
	svg.classList.add("byc-spinner-icon");
	return svg;
}

export function expandIcon(): SVGSVGElement {
	return svgIcon([
		"M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5",
		"M3 3l7 7M21 3l-7 7M3 21l7-7M21 21l-7-7",
	]);
}

export function compressIcon(): SVGSVGElement {
	return svgIcon([
		"M3 8h5V3M16 3v5h5M3 16h5v5M16 21v-5h5",
		"M8 8L3 3M16 8l5-5M8 16l-5 5M16 16l5 5",
	]);
}

export function trashIcon(): SVGSVGElement {
	return svgIcon(["M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"], 14);
}

export function pencilIcon(): SVGSVGElement {
	return svgIcon(["M12 20h9", "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"], 14);
}

export function externalIcon(): SVGSVGElement {
	return svgIcon(
		["M14 4h6v6", "M10 14L20 4", "M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5"],
		14,
	);
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

export function toggleMenu(
	target: HTMLElement,
	other: HTMLElement,
	targetBtn?: HTMLButtonElement,
	otherBtn?: HTMLButtonElement,
): void {
	other.classList.add("is-hidden");
	otherBtn?.setAttribute("aria-expanded", "false");
	target.classList.toggle("is-hidden");
	const open = !target.classList.contains("is-hidden");
	targetBtn?.setAttribute("aria-expanded", open ? "true" : "false");
}

export function closeMenus(menus: HTMLElement[], buttons: HTMLButtonElement[]): void {
	for (const menu of menus) menu.classList.add("is-hidden");
	for (const button of buttons) button.setAttribute("aria-expanded", "false");
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
