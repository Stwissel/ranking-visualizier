# Ranking Visualizer

Rank topics by drag and drop, keep dated snapshots of the order, and watch priorities shift
over time. A browser application: your data lives in the browser (PouchDB) and can be exported
as JSON or synced with your own CouchDB.

## What it does

- **Topics** have a title and a colour shared across all rankings, and a description that
  belongs to each ranking separately. The description given at creation goes into the newest
  ranking, or into the first ranking the topic enters; from then on each ranking keeps its
  own copy, and a new ranking carries the previous one's text forward.
- **Rankings** are named, dated snapshots of the topics' order. A new ranking starts as a copy
  of the newest one; reorder by dragging the handle or with the arrow buttons.
- **Compare** two or more rankings: a bump chart draws one line per topic in its colour, and a
  table lists each rank and the change from the previous snapshot.
  Export the chart as SVG or PNG, or the summary and table as Markdown.
- **Sessions** are independent sets of topics and rankings; switch between them in the header.
- **Export and import** any session or all of them as JSON.
- **Sync** with a CouchDB, live or on demand, configured in the app. Credentials stay in the
  browser and never replicate.
- **Appearance**: light, dark, or follow the system, from the header menu.

Removing a topic offers two choices: out of this ranking and every later one (earlier
rankings and the chart keep its history), or deleted completely.

## Running it

Requires Node 22.12.0 or later (Vite 8 needs it).

```sh
npm ci
npm run dev        # http://localhost:5173
npm run verify     # Biome, tsc, Vitest and a production build, as CI runs them
```

Vitest's browser project drives real Chromium through Playwright. Locally, point it at an
installed browser with `npx playwright install chromium` once, or set `PLAYWRIGHT_CHROMIUM` to
an existing executable.

## Deployment

Pushing to `main` builds and publishes `dist/` to GitHub Pages (`.github/workflows/pages.yml`).
Production builds use `/ranking-visualizier/` as the base path; routes are in the URL hash, so
no server-side fallback is needed. For a preview from the root path:

```sh
VITE_BASE=/ npx vite build && VITE_BASE=/ npx vite preview
```

## Syncing with CouchDB

Open the sync settings from the cloud button in the header. You need:

- the CouchDB origin, e.g. `https://couch.example.org`;
- a database name (default `ranking-visualizier`), created beforehand;
- a user with read and write access to it.

The browser talks to CouchDB directly, so CouchDB must allow CORS for the origin the app is
served from. In CouchDB's configuration:

```ini
[httpd]
enable_cors = true

[cors]
origins = https://<owner>.github.io
credentials = true
methods = GET, PUT, POST, HEAD, DELETE
headers = accept, authorization, content-type, origin, referer
```

"Live sync" keeps a two-way replication open while the app is open; "Sync now" runs one round
trip. The header shows the state (synced, syncing, error) and the settings dialog shows the
reason for an error.

## Export format

```json
{
  "format": "ranking-visualizier",
  "version": 1,
  "exportedAt": "2026-10-15T10:00:00.000Z",
  "sessions": [
    {
      "session": { "_id": "session:<sid>", "type": "session", "name": "Work", "createdAt": "…" },
      "topics": [{ "_id": "topic:<sid>:<tid>", "type": "topic", "sessionId": "<sid>", "title": "…", "colour": "#2a78d6" }],
      "rankings": [
        {
          "_id": "ranking:<sid>:<rid>", "type": "ranking", "sessionId": "<sid>",
          "name": "Q1", "date": "2026-01-15", "createdAt": "…",
          "items": [{ "topicId": "<tid>", "description": "…" }]
        }
      ]
    }
  ]
}
```

The order of `items` is the rank. Importing a session whose id already exists asks whether to
replace it, import it as a copy with new ids, or skip it.

## Project layout

```
src/data/     documents, store, export/import, sync (no browser dependency; tested in Node)
src/ui/       Lit components rendering into the light DOM, Web Awesome free build, D3 chart
test/data/    Vitest on pouchdb-core with the memory adapter
test/ui/      Vitest browser mode (Chromium via Playwright)
docs/adr/     architecture decision records
```

Built with [Lit](https://lit.dev), [Web Awesome](https://webawesome.com),
[PouchDB](https://pouchdb.com), [SortableJS](https://sortablejs.github.io/Sortable/) and
[D3](https://d3js.org). Licensed under Apache 2.0.
