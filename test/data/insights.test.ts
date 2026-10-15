import { describe, expect, it } from 'vitest'
import {
  changesBetween,
  compareRows,
  describeChange,
  describeStats,
  statsOf,
  trendOf,
} from '../../src/data/insights.js'
import type { RankingDoc, TopicDoc } from '../../src/data/model.js'

function ranking(rid: string, date: string, order: string[]): RankingDoc {
  return {
    _id: `ranking:s:${rid}`,
    type: 'ranking',
    sessionId: 's',
    name: rid,
    date,
    createdAt: `${date}T00:00:00.000Z`,
    items: order.map((topicId) => ({ topicId, description: '' })),
  }
}

describe('changesBetween', () => {
  it('reports moves, arrivals, departures and the unchanged, biggest moves first', () => {
    const before = ranking('r1', '2026-01-01', ['a', 'b', 'c', 'd'])
    const after = ranking('r2', '2026-02-01', ['d', 'a', 'e', 'b'])
    const changes = changesBetween(before, after)
    expect(changes.map((c) => [c.topicId, c.kind, c.delta])).toEqual([
      ['d', 'up', 3],
      ['b', 'down', -2],
      ['a', 'down', -1],
      ['e', 'new', 0],
      ['c', 'gone', 0],
    ])
    expect(changes[0]).toMatchObject({ from: 4, to: 1 })
    expect(changes[3]).toMatchObject({ to: 3 })
    expect(changes[4]).toMatchObject({ from: 3 })
  })

  it('lists unchanged topics last and describes each kind', () => {
    const before = ranking('r1', '2026-01-01', ['a', 'b'])
    const after = ranking('r2', '2026-02-01', ['a', 'b'])
    const changes = changesBetween(before, after)
    expect(changes.every((c) => c.kind === 'same')).toBe(true)
    expect(describeChange({ topicId: 'x', from: 4, to: 1, delta: 3, kind: 'up' }, 'X')).toBe(
      'X up 3 to #1',
    )
    expect(describeChange({ topicId: 'x', from: 1, to: 3, delta: -2, kind: 'down' }, 'X')).toBe(
      'X down 2 to #3',
    )
    expect(describeChange({ topicId: 'x', to: 5, delta: 0, kind: 'new' }, 'X')).toBe('X new at #5')
    expect(describeChange({ topicId: 'x', from: 2, delta: 0, kind: 'gone' }, 'X')).toBe(
      'X left the ranking (was #2)',
    )
    expect(describeChange({ topicId: 'x', from: 2, to: 2, delta: 0, kind: 'same' }, 'X')).toBe(
      'X unchanged at #2',
    )
  })
})

describe('trendOf', () => {
  const rankings = [
    ranking('r1', '2026-01-01', ['a', 'b', 'c', 'd', 'e']),
    ranking('r2', '2026-02-01', ['b', 'a', 'd', 'c', 'e']),
    ranking('r3', '2026-03-01', ['b', 'd', 'a', 'c', 'e']),
    ranking('r4', '2026-04-01', ['d', 'b', 'c', 'a', 'e']),
  ]

  it('needs three appearances', () => {
    expect(trendOf('a', rankings.slice(0, 2))).toBeUndefined()
    expect(trendOf('zzz', rankings)).toBeUndefined()
  })

  it('names rising, sliding and steady over the last three appearances', () => {
    expect(trendOf('d', rankings)).toBe('rising') // 3 → 2 → 1
    expect(trendOf('a', rankings)).toBe('sliding') // 2 → 3 → 4
    expect(trendOf('e', rankings)).toBe('steady') // 5 → 5 → 5
    expect(trendOf('b', rankings)).toBeUndefined() // 1 → 1 → 2: mixed
    expect(trendOf('c', rankings)).toBeUndefined() // 4 → 4 → 3: mixed
  })

  it('skips rankings the topic is absent from rather than counting them as a step', () => {
    const gappy = [
      ranking('r1', '2026-01-01', ['a', 'b', 'c']),
      ranking('r2', '2026-02-01', ['b', 'c']),
      ranking('r3', '2026-03-01', ['b', 'a', 'c']),
      ranking('r4', '2026-04-01', ['b', 'c', 'a']),
    ]
    expect(trendOf('a', gappy)).toBe('sliding') // 1 → 2 → 3 across r1, r3, r4
  })
})

describe('statsOf', () => {
  const rankings = [
    ranking('r1', '2026-01-01', ['a', 'b', 'c']),
    ranking('r2', '2026-02-01', ['b', 'a', 'c']),
    ranking('r3', '2026-03-01', ['b', 'a', 'c']),
    ranking('r4', '2026-04-01', ['c', 'b', 'a']),
  ]

  it('sums movement, counts top-three appearances and the longest streak', () => {
    expect(statsOf('a', rankings)).toEqual({
      appearances: 4,
      totalMovement: 2,
      topThree: 4,
      longestStreak: 2,
      best: 1,
      worst: 3,
    })
    expect(statsOf('c', rankings)).toMatchObject({
      totalMovement: 2,
      longestStreak: 3,
      best: 1,
      worst: 3,
    })
    expect(statsOf('nope', rankings)).toEqual({
      appearances: 0,
      totalMovement: 0,
      topThree: 0,
      longestStreak: 0,
    })
  })

  it('describes itself briefly', () => {
    expect(describeStats(statsOf('a', rankings))).toBe(
      'moved 2 ranks over 4 rankings · top 3 in 4 · held a rank 2 in a row',
    )
    expect(describeStats(statsOf('a', rankings.slice(0, 1)))).toBe('Ranked once')
    expect(describeStats(statsOf('nope', rankings))).toBe('Never ranked')
  })
})

describe('compareRows', () => {
  it('orders by the latest rank with absent topics last, then by title', () => {
    const topics = new Map<string, TopicDoc>([
      ['a', { _id: 'topic:s:a', type: 'topic', sessionId: 's', title: 'Alpha', colour: '#111111' }],
      ['b', { _id: 'topic:s:b', type: 'topic', sessionId: 's', title: 'Beta', colour: '#222222' }],
    ])
    const rows = compareRows(
      [ranking('r1', '2026-01-01', ['a', 'b', 'c']), ranking('r2', '2026-02-01', ['b', 'a'])],
      topics,
    )
    expect(rows.map((row) => [row.title, row.ranks])).toEqual([
      ['Beta', [2, 1]],
      ['Alpha', [1, 2]],
      ['Unknown topic', [3, undefined]],
    ])
    expect(rows[2]?.colour).toBeUndefined()
    expect(rows[0]?.tiers).toEqual([undefined, undefined])
  })

  it('carries the tier name per ranking', () => {
    const r1 = ranking('r1', '2026-01-01', ['a', 'b'])
    r1.tiers = [
      { id: 't1', name: 'Must' },
      { id: 't2', name: 'Later' },
    ]
    r1.items[0]!.tierId = 't1'
    r1.items[1]!.tierId = 't2'
    const rows = compareRows([r1, ranking('r2', '2026-02-01', ['b', 'a'])], new Map())
    expect(rows.map((row) => row.tiers)).toEqual([
      ['Later', undefined],
      ['Must', undefined],
    ])
  })
})
