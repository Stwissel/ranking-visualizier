# 6. Tiers as dividers in one ordered list

Date: 2026-10-15

## Status

Accepted

## Context

Rank order is precise, but the decision people make is often "which band": do now, do next,
park. A ranking should carry both, and the comparison should show a topic crossing a band.
Two shapes were possible: one list per tier, or one list with dividers.

## Decision

One list with dividers. A ranking has an ordered `tiers` array and every item carries the id
of its tier; the store keeps each tier's items contiguous in tier order (`groupByTier`), so
rank and tier can never contradict. The first tier takes every item, later tiers start empty,
removing a tier hands its items to its neighbour, and a new ranking copies the tiers.

## Consequences

- Nothing changes for a ranking without tiers: `tiers` is absent and items carry no tier id.
- Drag and drop reads the dropped position relative to the dividers; the arrow keys hand an
  item the tier of the item it displaces, so a press at a tier's edge crosses into the next.
- Tier identity across rankings is by name, since ids are per ranking; the table marks a topic
  whose tier name differs from the previous ranking.
- The chart draws the latest ranking's tiers as bands behind the lines; earlier rankings' tiers
  are not drawn, which keeps the chart readable but hides past band boundaries.
