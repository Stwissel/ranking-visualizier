/**
 * What the rankings say when read together: what moved between two snapshots, how a topic has
 * been trending, and how stable it has been. Pure functions over documents; nothing here
 * touches the database, so the UI and the exports can share them and Node can test them.
 *
 * Every function takes rankings in chronological order (see `compareRankings`).
 *
 * @module
 */
import { type RankingDoc, type TopicDoc, tierNameOf } from './model.js'

export type ChangeKind = 'up' | 'down' | 'same' | 'new' | 'gone'

export interface Change {
  topicId: string
  /** 1-based rank in the earlier ranking; absent when the topic was not in it. */
  from?: number
  /** 1-based rank in the later ranking; absent when the topic left. */
  to?: number
  /** Positive when the topic moved up (towards 1). Zero for `same`, `new` and `gone`. */
  delta: number
  kind: ChangeKind
}

function rankMap(ranking: RankingDoc): Map<string, number> {
  return new Map(ranking.items.map((item, index) => [item.topicId, index + 1]))
}

/**
 * Every topic in either ranking, with where it went. Ordered for reading aloud: biggest moves
 * first, then arrivals, then departures, then the unchanged.
 */
export function changesBetween(previous: RankingDoc, current: RankingDoc): Change[] {
  const before = rankMap(previous)
  const after = rankMap(current)
  const changes: Change[] = []
  for (const [topicId, to] of after) {
    const from = before.get(topicId)
    if (from === undefined) changes.push({ topicId, to, delta: 0, kind: 'new' })
    else {
      const delta = from - to
      changes.push({
        topicId,
        from,
        to,
        delta,
        kind: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
      })
    }
  }
  for (const [topicId, from] of before) {
    if (!after.has(topicId)) changes.push({ topicId, from, delta: 0, kind: 'gone' })
  }
  const order: Record<ChangeKind, number> = { up: 0, down: 0, new: 1, gone: 2, same: 3 }
  return changes.sort(
    (a, b) =>
      order[a.kind] - order[b.kind] ||
      Math.abs(b.delta) - Math.abs(a.delta) ||
      (a.to ?? a.from ?? 0) - (b.to ?? b.from ?? 0),
  )
}

/** One line per change, e.g. "Platform reliability up 3 to #2". */
export function describeChange(change: Change, title: string): string {
  switch (change.kind) {
    case 'up':
      return `${title} up ${change.delta} to #${change.to}`
    case 'down':
      return `${title} down ${-change.delta} to #${change.to}`
    case 'new':
      return `${title} new at #${change.to}`
    case 'gone':
      return `${title} left the ranking (was #${change.from})`
    case 'same':
      return `${title} unchanged at #${change.to}`
  }
}

export type Trend = 'rising' | 'sliding' | 'steady'

/** How many consecutive appearances a trend needs before it is called one. */
export const TREND_WINDOW = 3

/**
 * The direction of a topic over its last `TREND_WINDOW` appearances: `rising` when every step
 * moved it up, `sliding` when every step moved it down, `steady` when it never moved, and
 * nothing when the record is shorter or mixed. Rankings that do not contain the topic are
 * skipped, not counted as a step.
 */
export function trendOf(topicId: string, rankings: readonly RankingDoc[]): Trend | undefined {
  const ranks = ranksOf(topicId, rankings).slice(-TREND_WINDOW)
  if (ranks.length < TREND_WINDOW) return undefined
  const steps = ranks.slice(1).map((rank, index) => ranks[index]! - rank)
  if (steps.every((step) => step > 0)) return 'rising'
  if (steps.every((step) => step < 0)) return 'sliding'
  if (steps.every((step) => step === 0)) return 'steady'
  return undefined
}

export interface TopicStats {
  /** Rankings the topic appears in. */
  appearances: number
  /** Sum of absolute rank changes between consecutive appearances. */
  totalMovement: number
  /** Appearances at rank 1 to 3. */
  topThree: number
  /** The most consecutive appearances at one unchanged rank (1 when it never repeated). */
  longestStreak: number
  best?: number
  worst?: number
}

export function statsOf(topicId: string, rankings: readonly RankingDoc[]): TopicStats {
  const ranks = ranksOf(topicId, rankings)
  let totalMovement = 0
  let longestStreak = ranks.length > 0 ? 1 : 0
  let streak = 1
  ranks.forEach((rank, index) => {
    if (index === 0) return
    const previous = ranks[index - 1]!
    totalMovement += Math.abs(rank - previous)
    streak = rank === previous ? streak + 1 : 1
    longestStreak = Math.max(longestStreak, streak)
  })
  return {
    appearances: ranks.length,
    totalMovement,
    topThree: ranks.filter((rank) => rank <= 3).length,
    longestStreak,
    best: ranks.length ? Math.min(...ranks) : undefined,
    worst: ranks.length ? Math.max(...ranks) : undefined,
  }
}

/** A short sentence of the stats for a caption or tooltip. */
export function describeStats(stats: TopicStats): string {
  if (stats.appearances < 2) return stats.appearances === 1 ? 'Ranked once' : 'Never ranked'
  const parts = [
    `moved ${stats.totalMovement} rank${stats.totalMovement === 1 ? '' : 's'} over ${stats.appearances} rankings`,
    `top 3 in ${stats.topThree}`,
  ]
  if (stats.longestStreak > 1) parts.push(`held a rank ${stats.longestStreak} in a row`)
  return parts.join(' · ')
}

/** The topic's 1-based rank in each ranking it appears in, in order. */
function ranksOf(topicId: string, rankings: readonly RankingDoc[]): number[] {
  const ranks: number[] = []
  for (const ranking of rankings) {
    const index = ranking.items.findIndex((item) => item.topicId === topicId)
    if (index !== -1) ranks.push(index + 1)
  }
  return ranks
}

export interface CompareRow {
  topicId: string
  title: string
  colour: string | undefined
  /** One entry per ranking, undefined where the topic is absent. */
  ranks: (number | undefined)[]
  /** The tier's name per ranking, undefined where absent or the ranking has no tiers. */
  tiers: (string | undefined)[]
}

/**
 * The comparison table's rows: every topic in any of the rankings, ordered by rank in the
 * latest ranking with absent topics last, then by title.
 */
export function compareRows(
  ordered: readonly RankingDoc[],
  topics: ReadonlyMap<string, TopicDoc>,
): CompareRow[] {
  const topicIds = new Set<string>()
  for (const ranking of ordered) for (const item of ranking.items) topicIds.add(item.topicId)
  const rows = [...topicIds].map((topicId) => {
    const topic = topics.get(topicId)
    const ranks = ordered.map((ranking) => {
      const index = ranking.items.findIndex((item) => item.topicId === topicId)
      return index === -1 ? undefined : index + 1
    })
    const tiers = ordered.map((ranking) => tierNameOf(ranking, topicId))
    return { topicId, title: topic?.title ?? 'Unknown topic', colour: topic?.colour, ranks, tiers }
  })
  return rows.sort((a, b) => {
    const lastA = a.ranks[a.ranks.length - 1] ?? Number.POSITIVE_INFINITY
    const lastB = b.ranks[b.ranks.length - 1] ?? Number.POSITIVE_INFINITY
    return lastA - lastB || a.title.localeCompare(b.title)
  })
}
