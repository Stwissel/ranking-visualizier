# 2. One PouchDB, every document carries its session id

Date: 2026-10-15

## Status

Accepted

## Context

Sessions are independent sets of topics and rankings. They could each be their own database
(as matter-manager does per project), or share one database with a `sessionId` on every
document. The sync target is a single CouchDB database the user configures.

## Decision

One local database, `ranking-visualizier`, and one remote database. Documents are keyed with
prefixes (`session:<sid>`, `topic:<sid>:<tid>`, `ranking:<sid>:<rid>`) so `allDocs` range
queries select a session's documents; no Mango index is built.

## Consequences

- One replication covers everything; the settings dialog has one URL and one database name.
- Every device that syncs gets every session. Deleting a session is a bulk delete of its
  documents, which replicates like any other write.
- Ids are generated client side (`crypto.randomUUID()`), so an import under fresh ids and a
  copy of a session are the same operation (`duplicateSession` in `transfer.ts`).
- Conflicts are resolved by CouchDB's deterministic winner; the data is small and single-user,
  so no merge strategy is implemented. A ranking is one document, so reordering on two devices
  at once loses one of the two orders rather than interleaving them.
