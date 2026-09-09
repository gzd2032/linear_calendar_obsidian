# Linear Year Calendar

An Obsidian plugin that shows your whole year at a glance: 12-month rows, pastel event bars, Linear / Stacked / Column / Col-Stack layouts, click/drag to create notes, event detail popover, and Google Calendar import via ICS.

![screenshot](./linear_calendar_screenshot.jpg)
---

## Install

### Community plugins (once listed)

1. Open Obsidian → Settings → Community plugins.
2. Turn **Restricted mode** off if it is on.
3. Browse → search **Linear Year Calendar** → Install → Enable.

### Manual install (from a GitHub release)

1. Create `VaultFolder/.obsidian/plugins/linear-year-calendar/`.
2. From the [latest release](https://github.com/gzd2032/linear_calendar_obsidian/releases/latest), download these three assets into that folder:
   - `manifest.json`
   - `main.js`
   - `styles.css`
3. Enable **Linear Year Calendar** under Community plugins.

(Ignore GitHub’s auto-generated **Source code** zip/tar — that is the whole repository, not the plugin install package. Obsidian only uses the three files above.)

### Build from source

```bash
npm install
npm run build
```

That produces `main.js` next to `manifest.json` and `styles.css`.

```bash
VAULT="$HOME/path/to/your/vault"
mkdir -p "$VAULT/.obsidian/plugins/linear-year-calendar"
cp manifest.json main.js styles.css "$VAULT/.obsidian/plugins/linear-year-calendar/"
```

Enable the plugin, then open it from the calendar ribbon icon or **Open Linear Year Calendar** in the command palette.

### Reload after code changes

If you rebuild `main.js`, run **Reload app without saving** from the command palette, or toggle the plugin off and on.

---

## Use it

**Google Calendar is the source of truth** for imported events. **Obsidian is for local planning.**

| Kind | Folder | In Obsidian |
| --- | --- | --- |
| Local planning | `Calendar/<CalendarName>/` | Create, edit, delete |
| Google ICS | `Calendar/google/<CalendarName>/` | View only; open the day in Google Calendar |

Click/drag creates notes in the **Default calendar name** folder (settings). In the create/edit modal, pick a **local** calendar from the dropdown, or choose **Other…** to name a new one (Google calendars are not listed). Changing calendar on edit moves the note into that folder. Filters group **Local** vs **Google**.

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
| Click a day | Create a one-day local event note |
| Drag across days | Create a multi-day local event note (live range preview) |
| Click a local event bar | Detail popover (open note / edit / delete) |
| Click a Google event bar | Read-only popover; **Google** opens that day in Google Calendar |
| Hover an event bar | Tooltip with title, dates, day count |
| **Today** (next to year arrows) | Jump to the current year and center on today |
| Display | Switch Stacked / Linear / Column / Col-Stack |
| Filters | Local and Google sections; **Show all** when some are hidden |
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

Imported events are written under `Calendar/google/<calendar-name>/`, keyed by `ics-uid` + start date so refreshes update instead of duplicating. Do not edit those notes in Obsidian — change them in Google and refresh.

Public ICS URLs work too (webcal/https). `webcal://` is rewritten to `https://` automatically.

If you previously imported into `Calendar/<name>/` (without `google/`), refresh will write to the new path; you can delete the old ICS notes manually.

---

## Develop

```bash
npm install
npm run dev          # watch-build plugin
npm run build        # production main.js
npm run package      # build + dist/linear-year-calendar.zip
npm run preview      # build browser preview
npm test             # Vitest unit tests
npm run test:coverage
```

`npm run preview` builds `preview/preview.js`. Open `preview/index.html` in a browser to check the grid without Obsidian.

### Project layout (src)

Pure logic (`dates`, `format`, `year-grid`, `segments`, `note-model`, `ics`) is covered by Vitest (≥80% lines). Obsidian-facing code lives in `notes`, `view`, `ui`, `popover`, and `modal`.

See [PLAN.md](PLAN.md) for architecture notes and prompt history.

### Release (community plugin format)

Obsidian installs from a GitHub release whose **tag matches `manifest.json` version exactly** (bare semver, no `v` prefix). The workflow attaches **only** the three Obsidian install assets:

- `main.js`
- `manifest.json`
- `styles.css`

It does not attach a custom plugin zip (Obsidian ignores those and the release scanner flags them). GitHub still shows automatic **Source code** archives on the release page; use the three files above for installs.

Publish a release:

1. Update `minAppVersion` in `manifest.json` if needed.
2. Bump version (updates `package.json`, `manifest.json`, and `versions.json`):

```bash
npm version patch   # or minor / major
git push && git push --tags
```

3. Pushing a bare tag such as `1.0.1` runs [.github/workflows/release.yml](.github/workflows/release.yml), which runs `npm ci` on Node 24, builds from the tagged commit, and uploads `main.js`, `manifest.json`, and `styles.css`.

**Do not** replace those release assets by hand after CI publishes them (no local `gh release upload` / drag-and-drop). Obsidian’s release scanner rebuilds from source and expects the uploaded `main.js` to match CI output byte-for-byte.

Local packaging (optional zip for your own use, not uploaded by CI):

```bash
npm run package
# → dist/linear-year-calendar/{manifest.json,main.js,styles.css}
# → dist/linear-year-calendar.zip
```

### Submit to the Community Plugin directory

After the first GitHub release (`1.0.0`) is published:

1. Confirm [plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines).
2. Open a PR to [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases) adding this plugin to `community-plugins.json`.

## Layouts

- **Linear** — day 1 of every month is in the first column.
- **Stacked** — months are offset so Sundays (or Mondays) stack in the same columns.
- **Column** — months sit side by side with days top to bottom; events appear inside each month on their days.
- **Col-Stack** — like Column, but months are weekday-aligned so weekends line up horizontally across the year.
