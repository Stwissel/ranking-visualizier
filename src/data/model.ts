/**
 * Document shapes stored in PouchDB.
 *
 * One database holds every session; every document carries `sessionId`, and `_id` prefixes
 * make range queries over `allDocs` sufficient, so no Mango index is ever built.
 *
 * @module
 */

export type SessionId = string
export type TopicId = string
export type RankingId = string

/** A named set of topics and rankings, independent of every other session. */
export interface SessionDoc {
  _id: string
  _rev?: string
  type: 'session'
  name: string
  createdAt: string
}

/** Title and colour are shared by every ranking of the session; the description is not. */
export interface TopicDoc {
  _id: string
  _rev?: string
  type: 'topic'
  sessionId: SessionId
  title: string
  /** `#rrggbb` */
  colour: string
  /**
   * The text a topic enters its first ranking with. Each ranking keeps its own copy from then
   * on, so editing this later changes nothing already ranked.
   */
  description?: string
}

/** One topic's place in one ranking. Position in `RankingDoc.items` is the rank. */
export interface RankingItem {
  topicId: TopicId
  description: string
}

export interface RankingDoc {
  _id: string
  _rev?: string
  type: 'ranking'
  sessionId: SessionId
  name: string
  /** ISO calendar date `YYYY-MM-DD`; sorts lexically. */
  date: string
  createdAt: string
  items: RankingItem[]
}

export type AnyDoc = SessionDoc | TopicDoc | RankingDoc

export const ids = {
  session: (sid: SessionId) => `session:${sid}`,
  topic: (sid: SessionId, tid: TopicId) => `topic:${sid}:${tid}`,
  ranking: (sid: SessionId, rid: RankingId) => `ranking:${sid}:${rid}`,
  /** `allDocs` range covering every document of one kind in one session. */
  range: (kind: 'topic' | 'ranking', sid: SessionId) => ({
    startkey: `${kind}:${sid}:`,
    endkey: `${kind}:${sid}:￰`,
  }),
} as const

/** The last `:`-separated part of an `_id`: the topic or ranking id. */
export function shortId(docId: string): string {
  const index = docId.lastIndexOf(':')
  return index === -1 ? docId : docId.slice(index + 1)
}

export function newId(): string {
  return crypto.randomUUID()
}

/** Today's date as `YYYY-MM-DD` in the local time zone. */
export function today(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const HEX_COLOUR = /^#[0-9a-f]{6}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOUR.test(value)
}

/**
 * `YYYY-MM-DD` naming a day that exists. `Date.parse` alone is not enough: V8 rolls
 * `2026-02-30` into March rather than rejecting it, so the parsed date is compared back.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const time = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value
}

/**
 * Chronological order of rankings: by date, then by creation time, then by id so the order is
 * total. "Later rankings" everywhere in the application means later in this order.
 */
export function compareRankings(a: RankingDoc, b: RankingDoc): number {
  return (
    a.date.localeCompare(b.date) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a._id.localeCompare(b._id)
  )
}

/**
 * Defaults offered when a topic is created, in this order. Eight hues whose adjacent pairs
 * clear the colour-vision-deficiency separation checks of the dataviz palette validator; the
 * user may still pick anything. Direct labels and the comparison table carry identity too.
 */
export const DEFAULT_COLOURS: readonly string[] = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#6250d6',
  '#e34948',
]
