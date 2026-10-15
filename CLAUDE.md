# Ranking Visualizer — instructions for Claude

## Always load the Web Awesome skills for UI work

Before writing, changing or reviewing anything in `src/ui/`, invoke both skills, and tell any
subagent doing UI work to do the same:

1. `webawesome-design`: layout (`<wa-page>`), theming (`--wa-*` tokens), composition.
2. `webawesome`: component APIs.

Before touching `src/ui/bump-chart.ts` or `src/ui/compare-view.ts`, also load `dataviz`.

## Conventions

- Lit 3 + Web Awesome **free** build (`@awesome.me/webawesome`, public npm). No React or similar.
- Every component renders into the light DOM (`createRenderRoot() { return this }`) so that
  `<wa-page>` slots and the `wa-*` utility classes reach it. Styles live in
  `src/ui/styles/app.css` and use `--wa-*` tokens; no raw colours or pixel values except topic
  colours, which are data.
- `src/data/` never imports `pouchdb-browser`; it takes a database instance. Tests run it on
  `pouchdb-core` with the memory adapter (`test/data/support/memory-database.ts`).
- Decisions are recorded in `docs/adr/`. Add one when you change an architectural choice.
- `npm run verify` is what CI runs: Biome, `tsc`, Vitest, Vite build.
