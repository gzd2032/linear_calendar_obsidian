# Linear Year Calendar

An Obsidian plugin that shows your whole year at a glance, in the style of [Birdseye](https://birdseyecal.com/): 12 month rows, pastel event bars, Linear / Stacked / Column / Col-Stack layouts, click/drag to create notes, event detail popover, and Google Calendar import via ICS.

## Install in Obsidian

This plugin is not in the Community Plugin directory yet. Install it manually:

### 1. Build the plugin (once)

In this folder:

```bash
npm install
npm run build
```

That produces `main.js` next to `manifest.json` and `styles.css`. Those three files are the plugin.

### 2. Copy it into your vault

1. Open your vault in Finder (macOS) or Explorer (Windows).
2. Go to `.obsidian/plugins/`. If `plugins` does not exist, create it.
3. Create a folder named `linear-year-calendar`.
4. Copy these files into that folder:
   - `manifest.json`
   - `main.js`
   - `styles.css`

Example on macOS:

```bash
VAULT="$HOME/path/to/your/vault"
mkdir -p "$VAULT/.obsidian/plugins/linear-year-calendar"
cp manifest.json main.js styles.css "$VAULT/.obsidian/plugins/linear-year-calendar/"
```

### 3. Enable it

1. Open Obsidian.
2. Settings → Community plugins.
3. Turn **Restricted mode** off if it is on.
4. Find **Linear Year Calendar** and enable it.

### 4. Open the view

- Click the calendar icon in the left ribbon, or
- Command palette (`Cmd/Ctrl + P`) → **Open Linear Year Calendar**

### Reload after code changes

If you rebuild `main.js`, run **Reload app without saving** from the command palette, or toggle the plugin off and on.

---

## Use it

Events are Markdown notes in a folder (default: `Calendar/`). Create them from the grid, or write them yourself:

```yaml
---
start: 2026-09-07
end: 2026-09-15
color: "#E7A989"
calendar: Personal
---
# Home Office Makeover

Optional description lives in the note body.
```

| Action | What happens |
| --- | --- |
| Click a day | Create a one-day event note |
| Drag across days | Create a multi-day event note (live range preview) |
| Click an event bar | Detail popover (open note / edit / delete) |
| Hover an event bar | Tooltip with title, dates, day count |
| **Today** (next to year arrows) | Jump to the current year and center on today |
| Display | Switch Stacked / Linear / Column / Col-Stack |
| Filters | Show or hide calendars; **Show all** when some are hidden |
| Search | Filter bars by title |
| Year arrows | Move year |

### Google Calendar via ICS

1. In Google Calendar, open **Settings**.
2. Under **Settings for my calendars**, select a calendar.
3. Open **Integrate calendar**.
4. Copy **Secret address in iCal format**.
5. In Obsidian: Settings → Linear Year Calendar → **Add ICS calendar**.
6. Paste the URL, set a name and color.
7. On the year view, click the refresh icon (or command **Refresh ICS calendars**).

**All-day events only** is on by default. Timed meetings are skipped; only Google all-day events are written as notes. Turn that setting off if you also want timed events (they still render as a one-day bar).

Imported events are written as notes under `Calendar/<calendar-name>/`, keyed by `ics-uid` + start date so refreshes update instead of duplicating.

Public ICS URLs work too (webcal/https). `webcal://` links should be pasted as `https://`.

---

## Develop

```bash
npm install
npm run dev          # watch-build plugin
npm run preview      # build browser preview
npm test             # Vitest unit tests
npm run test:coverage
```

`npm run preview` builds `preview/preview.js`. Open `preview/index.html` in a browser to check the grid without Obsidian.

### Project layout (src)

Pure logic (`dates`, `format`, `year-grid`, `segments`, `note-model`, `ics`) is covered by Vitest (≥80% lines). Obsidian-facing code lives in `notes`, `view`, `ui`, `popover`, and `modal`.

See [PLAN.md](PLAN.md) for architecture notes and prompt history.

## Layouts

- **Linear** — day 1 of every month is in the first column.
- **Stacked** — months are offset so Sundays (or Mondays) stack in the same columns, matching Birdseye’s weekend alignment.
- **Column** — months sit side by side with days top to bottom; events appear inside each month on their days.
- **Col-Stack** — like Column, but months are weekday-aligned so weekends line up horizontally across the year.
