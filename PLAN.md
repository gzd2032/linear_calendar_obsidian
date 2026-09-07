# Linear Year Calendar — Project Plan

## What this is

An **Obsidian plugin** that shows the whole year at a glance, inspired by [Birdseye](https://birdseyecal.com/): twelve month rows, pastel multi-day event bars, **Linear** / **Stacked** / **Column** / **Col-Stack** layouts, and a light Birdseye-style look.

Events live as Markdown notes (default folder `Calendar/`) with frontmatter (`start`, `end`, `color`, `calendar`). You can click or drag on the grid to create notes, open bars for a detail popover (edit/delete/open note), search and filter calendars, and import **Google Calendar via ICS** (all-day events only by default).

This workspace started empty. The plugin was built from scratch (not forked from another Obsidian calendar plugin), using Birdseye’s UI as the visual target and Obsidian’s plugin API for the host app.

## Architecture (maintainable modules)

Pure logic is separated from Obsidian UI so it stays testable:

| Module | Responsibility |
| --- | --- |
| `dates.ts` | ISO dates, ranges, leap years, weekday helpers |
| `format.ts` | Tooltips, day counts, filenames, calendar colors |
| `year-grid.ts` | Build Linear / Stacked / Column / Col-Stack grids |
| `segments.ts` | Clip events to months and pack lanes |
| `note-model.ts` | Frontmatter ↔ event mapping, note body / description |
| `ics.ts` | ICS parse + recurrence expansion |
| `notes.ts` | Vault I/O (create / update / ICS upsert) |
| `drag.ts` | Range selection + drag preview |
| `ui.ts` + `ui-helpers.ts` | Toolbar and board rendering |
| `popover.ts` / `modal.ts` / `view.ts` | Obsidian host integration |

`grid.ts` is a barrel that re-exports date/format/grid/segment helpers for callers.

## Testing

- **Vitest** with `@vitest/coverage-v8`
- Target: **≥80% lines** on pure modules (`dates`, `format`, `year-grid`, `segments`, `ics`, `note-model`)
- Commands: `npm test`, `npm run test:coverage`

## Prompts used

| # | Prompt (summary) | Outcome |
| --- | --- | --- |
| 1 | Create an Obsidian plugin like “this repo,” look like birdseyecal.com, and include install instructions | Clarifying questions first; then scaffold + Birdseye-style year grid, notes, ICS, README install steps |
| 2 | Design choices: native Birdseye layout; vault notes **and** Google; Linear **and** Stacked; Birdseye light theme; click/drag/create, year nav, filters, search | Locked v1 scope |
| 3 | Google via **ICS** URLs; import as vault notes; store creations in `Calendar/` | Connection and storage model |
| 4 | “Can I only import all day events?” | Setting **All-day events only** (default on); timed meetings skipped on ICS refresh |
| 5 | Event popover, today UX polish, month/header accents, Today focus button | Detail popover, drag preview, filters empty state, today markers |
| 6 | Unit tests (Vitest), refactor to SOLID / lower complexity, Bugbot review, update PLAN/README | Module split + coverage thresholds + docs |

Related earlier work (separate chat): a fullstack Birdseye-like **website** plan (Auth0, Google Calendar, Supabase, Vercel). This plugin is the Obsidian counterpart of that year-grid idea, not that web stack.

## How Cursor was used

1. **Clarify before coding** — Agent asked for reference behavior, data sources, layouts, theming, and interactions so the empty repo didn’t get the wrong product.
2. **Research in context** — Browser review of birdseyecal.com (Linear vs Stacked), Obsidian sample-plugin structure, and existing linear-calendar plugins as reference only.
3. **Scaffold + implement** — TypeScript Obsidian plugin (`manifest.json`, esbuild, `main.js`), year grid UI, note create/read, ICS parse/import, settings, and `README.md` install docs.
4. **Preview loop** — Local HTML preview of the same grid CSS/UI to compare with Birdseye without loading a vault every change.
5. **Iterate** — All-day-only import, popover UX, today/month styling, focus-today navigation.
6. **Test + refactor** — Vitest coverage on pure logic; split large modules; Bugbot-style review of the change set.
7. **Install path** — Manual vault install: build → copy `manifest.json`, `main.js`, `styles.css` into `.obsidian/plugins/linear-year-calendar/` → enable in Community plugins.

## Stack (short)

Obsidian Plugin API · TypeScript · esbuild · Vitest · vault Markdown notes · ICS (`requestUrl`) · optional browser preview under `preview/`

## Install reminder

```bash
npm install && npm run build
# copy manifest.json, main.js, styles.css → vault/.obsidian/plugins/linear-year-calendar/
```

See [README.md](README.md) for full use and Google ICS steps.
