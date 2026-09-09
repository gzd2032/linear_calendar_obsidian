import { Notice, TFile, type App } from "obsidian";
import { googleCalendarDayUrl, isGoogleEvent, sanitizeCalendarName } from "./calendar-paths";
import { ConfirmModal } from "./confirm-modal";
import { div, el, mount } from "./dom";
import { endOnOrAfterStart, eventDayCount, formatShortDate } from "./grid";
import type { CalendarEvent } from "./types";
import { EventCreateModal, type EventDraft } from "./modal";
import { readNoteDescription, updateEventNote } from "./notes";
import { externalIcon, labeledIconButton, pencilIcon, trashIcon } from "./ui-helpers";

const DESC_PREVIEW_LEN = 120;

export class EventDetailPopover {
	private root: HTMLElement | null = null;
	private openEventId: string | null = null;
	private openToken = 0;
	private activeEvent: CalendarEvent | null = null;
	private onDocPointer: ((ev: PointerEvent) => void) | null = null;
	private onKeyDown: ((ev: KeyboardEvent) => void) | null = null;

	constructor(
		private app: App,
		private onChanged: () => void,
		private getLocalCalendars: () => string[] = () => [],
		private getEventsFolder: () => string = () => "Calendar",
	) {}

	/** True when the popover is showing this event. */
	isOpenFor(eventId: string): boolean {
		return this.root !== null && this.openEventId === eventId;
	}

	open(event: CalendarEvent, anchor: HTMLElement): void {
		if (this.isOpenFor(event.id)) {
			this.close();
			return;
		}

		this.close();
		this.openEventId = event.id;
		this.activeEvent = event;
		const token = ++this.openToken;
		const google = isGoogleEvent(event, this.getEventsFolder());

		const pop = mount(document.body, div("byc-popover"));
		this.root = pop;

		const header = mount(pop, div("byc-popover-header"));
		const swatch = mount(header, div("byc-popover-swatch"));
		swatch.style.background = event.color;

		const title = mount(
			header,
			el("button", {
				cls: "byc-popover-title",
				type: "button",
				text: event.title,
				attr: {
					title: event.path ? `${event.title} — Open note` : event.title,
				},
			}),
		) as HTMLButtonElement;
		if (event.path) {
			title.addEventListener("click", () => {
				this.openNote(event);
				this.close();
			});
		} else {
			title.disabled = true;
		}

		const closeBtn = mount(
			header,
			el("button", {
				cls: "byc-popover-close",
				attr: { "aria-label": "Close", type: "button", title: "Close" },
				text: "×",
			}),
		);
		closeBtn.addEventListener("click", () => this.close());

		const body = mount(pop, div("byc-popover-body"));
		const dates = mount(body, div("byc-popover-dates"));
		const startCol = mount(dates, div("byc-popover-date"));
		mount(startCol, div("byc-popover-date-label", "Start"));
		mount(startCol, div("byc-popover-date-value", formatShortDate(event.start)));
		const endCol = mount(dates, div("byc-popover-date"));
		mount(endCol, div("byc-popover-date-label", "End"));
		mount(endCol, div("byc-popover-date-value", formatShortDate(event.end)));
		const days = eventDayCount(event.start, event.end);
		const daysCol = mount(dates, div("byc-popover-date"));
		mount(daysCol, div("byc-popover-date-label", "Duration"));
		mount(daysCol, div("byc-popover-date-value", days === 1 ? "1 day" : `${days} days`));

		const calendarName = event.calendar.trim() || "Personal";
		mount(
			body,
			div("byc-popover-source", google ? `${calendarName} · read-only` : calendarName),
		);

		const descEl = mount(body, div("byc-popover-desc"));
		descEl.hidden = true;

		const footer = mount(pop, div("byc-popover-footer"));

		if (google) {
			const openGoogle = labeledIconButton(
				footer,
				"Google",
				"byc-popover-edit",
				externalIcon(),
			);
			openGoogle.setAttribute("aria-label", "Open day in Google Calendar");
			openGoogle.title = "Open day in Google Calendar";
			openGoogle.addEventListener("click", () => {
				this.openGoogleDay(event);
			});
		} else {
			const del = labeledIconButton(footer, "Delete", "byc-popover-delete", trashIcon());
			del.setAttribute("aria-label", "Delete event");
			del.title = "Delete event";
			del.addEventListener("click", () => {
				void this.deleteEvent(event);
			});

			const edit = labeledIconButton(footer, "Edit", "byc-popover-edit", pencilIcon());
			edit.setAttribute("aria-label", "Edit event");
			edit.title = "Edit event (E)";
			edit.addEventListener("click", () => {
				void this.openEdit(event);
			});
		}

		this.position(pop, anchor);
		window.requestAnimationFrame(() => pop.classList.add("is-open"));

		this.onDocPointer = (ev: PointerEvent) => {
			if (!this.root) return;
			const target = ev.target as Node | null;
			if (this.root.contains(target) || anchor.contains(target)) return;
			this.close();
		};
		this.onKeyDown = (ev: KeyboardEvent) => {
			if (!this.root || !this.activeEvent) return;
			const tag = (ev.target as HTMLElement | null)?.tagName;
			if (tag === "INPUT" || tag === "TEXTAREA") return;

			if (ev.key === "Escape") {
				ev.preventDefault();
				this.close();
				return;
			}
			if (isGoogleEvent(this.activeEvent, this.getEventsFolder())) return;
			if (ev.key === "e" || ev.key === "E") {
				ev.preventDefault();
				void this.openEdit(this.activeEvent);
				return;
			}
			if (ev.key === "Delete" || ev.key === "Backspace") {
				ev.preventDefault();
				void this.deleteEvent(this.activeEvent);
			}
		};
		window.setTimeout(() => {
			if (this.onDocPointer) document.addEventListener("pointerdown", this.onDocPointer);
			if (this.onKeyDown) document.addEventListener("keydown", this.onKeyDown);
		}, 0);

		if (event.path) {
			void readNoteDescription(this.app, event.path).then((description) => {
				if (token !== this.openToken || !this.root) return;
				const preview = shortenDescription(description);
				if (!preview) return;
				descEl.textContent = preview;
				descEl.hidden = false;
				this.position(pop, anchor);
			});
		}
	}

	close(): void {
		if (this.onDocPointer) {
			document.removeEventListener("pointerdown", this.onDocPointer);
			this.onDocPointer = null;
		}
		if (this.onKeyDown) {
			document.removeEventListener("keydown", this.onKeyDown);
			this.onKeyDown = null;
		}
		this.root?.remove();
		this.root = null;
		this.openEventId = null;
		this.activeEvent = null;
	}

	private openNote(event: CalendarEvent): void {
		if (!event.path) return;
		const file = this.app.vault.getAbstractFileByPath(event.path);
		if (!(file instanceof TFile)) {
			new Notice("Event note not found");
			return;
		}
		void this.app.workspace.getLeaf(false).openFile(file);
	}

	private openGoogleDay(event: CalendarEvent): void {
		const url = googleCalendarDayUrl(event.start);
		if (!url) {
			new Notice("Could not open Google Calendar for this date.");
			return;
		}
		window.open(url, "_blank");
	}

	private position(pop: HTMLElement, anchor: HTMLElement): void {
		const rect = anchor.getBoundingClientRect();
		const popW = 280;
		let left = rect.left;
		let top = rect.bottom + 8;

		left = Math.max(12, Math.min(left, window.innerWidth - popW - 12));
		pop.style.left = `${left}px`;
		pop.style.top = `${top}px`;
		pop.style.width = `${popW}px`;

		window.requestAnimationFrame(() => {
			const h = pop.offsetHeight;
			if (top + h > window.innerHeight - 12) {
				const above = rect.top - h - 8;
				if (above > 12) pop.style.top = `${above}px`;
			}
		});
	}

	private async openEdit(event: CalendarEvent): Promise<void> {
		if (isGoogleEvent(event, this.getEventsFolder())) return;
		this.close();
		const description = event.path ? await readNoteDescription(this.app, event.path) : "";
		const calendars = this.calendarsFor(event);
		new EventCreateModal(
			this.app,
			{
				title: event.title,
				start: event.start,
				end: event.end,
				color: event.color,
				calendar: event.calendar,
				description,
			},
			calendars,
			(draft: EventDraft) => {
				void (async () => {
					if (!event.path) return;
					try {
						await updateEventNote(
							this.app,
							event.path,
							{
								title: draft.title.trim() || "Untitled",
								start: draft.start,
								end: endOnOrAfterStart(draft.start, draft.end),
								color: draft.color,
								calendar: sanitizeCalendarName(draft.calendar || event.calendar),
								description: draft.description,
							},
							this.getEventsFolder(),
						);
						new Notice("Event updated");
						this.onChanged();
					} catch (error) {
						console.error(error);
						new Notice("Could not update event");
					}
				})();
			},
			"Edit event",
		).open();
	}

	private calendarsFor(event: CalendarEvent): string[] {
		const names = this.getLocalCalendars();
		if (names.includes(event.calendar)) return names;
		return [sanitizeCalendarName(event.calendar), ...names];
	}

	private async deleteEvent(event: CalendarEvent): Promise<void> {
		if (isGoogleEvent(event, this.getEventsFolder())) return;
		if (!event.path) return;
		const file = this.app.vault.getAbstractFileByPath(event.path);
		if (!(file instanceof TFile)) {
			new Notice("Event note not found");
			return;
		}
		new ConfirmModal(this.app, `Delete “${event.title}”?`, async () => {
			try {
				await this.app.fileManager.trashFile(file);
				new Notice("Event deleted");
				this.close();
				this.onChanged();
			} catch (error) {
				console.error(error);
				new Notice("Could not delete event");
			}
		}).open();
	}
}

function shortenDescription(text: string): string {
	const compact = text.replace(/\s+/g, " ").trim();
	if (!compact) return "";
	if (compact.length <= DESC_PREVIEW_LEN) return compact;
	return `${compact.slice(0, DESC_PREVIEW_LEN - 1).trimEnd()}…`;
}
