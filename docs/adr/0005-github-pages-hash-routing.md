# 5. GitHub Pages deployment with hash routing

Date: 2026-10-15

## Status

Accepted

## Context

The application is static. GitHub Pages serves a project site under
`/ranking-visualizier/` and has no fallback for client-side routes.

## Decision

A workflow builds on push to `main` and publishes `dist/`. Vite's `base` is the project path
in production builds. Routes live in the URL hash (`#/ranking/<id>`, `#/compare/<a>,<b>`,
`#/topics`), so any deep link resolves to `index.html`.

## Consequences

- Local previews build with `VITE_BASE=/`.
- The CouchDB the user syncs with must allow CORS for the Pages origin (documented in the
  README).
- Moving to another static host needs only a different `base`.
