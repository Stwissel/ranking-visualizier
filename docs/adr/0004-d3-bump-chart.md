# 4. D3 modules draw the bump chart

Date: 2026-10-15

## Status

Accepted

## Context

Comparing two or more rankings is the point of the application. A bump chart (rank over
rankings, one line per topic) reads well for two or many snapshots. The owner chose D3 over a
hand-rolled SVG.

## Decision

Only the modules needed: `d3-scale`, `d3-shape`, `d3-selection`, `d3-transition`. Lit owns the
element and the detail panel; D3 owns scales, line generation, the data join and transitions
inside the SVG. Lines carry the topic's colour; rank numbers sit inside the points; direct
labels at line ends and a table under the chart carry identity without colour.

## Consequences

- Topic colours are user data. The defaults offered are eight hues validated with the dataviz
  palette checker for colour-vision-deficiency separation; a user may still pick clashing
  colours, which is why the labels and table exist.
- Each topic group is focusable; keyboard focus highlights it like hover and the detail panel
  is a live region.
- Bundle cost is about 60 kB minified for the four modules, acceptable for a tool used from a
  desk rather than a doorway.
