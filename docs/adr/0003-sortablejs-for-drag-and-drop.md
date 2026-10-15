# 3. SortableJS for drag and drop, keyboard reorder beside it

Date: 2026-10-15

## Status

Accepted

## Context

Ranking is done by dragging. Native HTML5 drag and drop has poor touch support on Android; a
hand-written pointer implementation is a few hundred lines to get right.

## Decision

SortableJS (MIT, no dependencies) on the ranking list, restricted to a handle. Up and down
buttons on each row do the same move for keyboard and switch users, and a live region
announces the result.

## Consequences

- Lit's `repeat` directive brackets each item with comment markers that SortableJS does not
  move. On `onEnd` the editor puts the dragged node back before the sibling it had at
  `onStart`, then writes the new order; Lit performs the move from the new data with its own
  picture of the list intact. Skipping that revert produces a list whose numbers and titles
  disagree.
- Reordering is a single document write (`reorderRanking`), validated as a permutation of the
  ranking's topics, so a stale view cannot silently drop a topic.
