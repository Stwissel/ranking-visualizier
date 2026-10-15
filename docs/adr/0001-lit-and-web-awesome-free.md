# 1. Lit and the Web Awesome free build, no SPA framework

Date: 2026-10-15

## Status

Accepted

## Context

The application is a small single-page app maintained by one person over a long time. React and
similar frameworks were excluded by the owner. The owner's other project (matter-manager) uses
Lit with Web Awesome Pro and the same conventions are wanted here, but a Pro licence token is a
secret that forks and casual contributors do not have.

## Decision

Lit 3 web components with the **free** Web Awesome build from public npm, bundled by Vite.
Components render into the light DOM so that `<wa-page>` slots and the `wa-*` utility classes
reach them; the application stylesheet is global and written against `--wa-*` tokens.

## Consequences

- Anyone can `npm ci` and build; CI needs no secret.
- Pro-only components are unavailable. None was essential: `wa-input type="date"` covers the
  ranking date, `wa-color-picker` is free, and a plain `<input type="file">` replaces
  `wa-file-input`.
- The free build ships no `wa-mobile-only`/`wa-desktop-only` rules; `app.css` defines them,
  scoped to `wa-page[view]`.
- Icons come from Font Awesome Free files bundled at build time (`src/ui/icons.ts`), not from
  the Font Awesome CDN the default library would call. The app therefore works offline and
  tells no third party about its visitors.
