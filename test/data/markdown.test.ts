import { describe, expect, it } from 'vitest'
import { compareToMarkdown } from '../../src/data/markdown.js'
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

const topics = new Map<string, TopicDoc>([
  ['a', { _id: 'topic:s:a', type: 'topic', sessionId: 's', title: 'Alpha', colour: '#111111' }],
  [
    'b',
    { _id: 'topic:s:b', type: 'topic', sessionId: 's', title: 'Beta | pipe', colour: '#222222' },
  ],
  ['c', { _id: 'topic:s:c', type: 'topic', sessionId: 's', title: 'Gamma', colour: '#333333' }],
])

describe('compareToMarkdown', () => {
  it('writes a changes section per step and a rank table with deltas', () => {
    const text = compareToMarkdown(
      [ranking('Q1', '2026-01-01', ['a', 'b', 'c']), ranking('Q2', '2026-02-01', ['c', 'a'])],
      topics,
      { title: 'Work' },
    )
    expect(text).toBe(
      [
        '# Work: 2 rankings compared',
        '',
        '2026-01-01 to 2026-02-01.',
        '',
        '## Q1 → Q2',
        '',
        '- Gamma up 2 to #1',
        '- Alpha down 1 to #2',
        '- Beta | pipe left the ranking (was #2)',
        '',
        '## Ranks',
        '',
        '| Topic | Q1 (2026-01-01) | Q2 (2026-02-01) |',
        '|---|---:|---:|',
        '| Gamma | 3 | 1 (↑2) |',
        '| Alpha | 1 | 2 (↓1) |',
        '| Beta \\| pipe | 2 | — |',
        '',
      ].join('\n'),
    )
  })

  it('says when nothing moved and counts the unchanged', () => {
    const text = compareToMarkdown(
      [
        ranking('Q1', '2026-01-01', ['a', 'b']),
        ranking('Q2', '2026-02-01', ['a', 'b']),
        ranking('Q3', '2026-03-01', ['b', 'a']),
      ],
      topics,
    )
    expect(text).toContain('## Q1 → Q2\n\nNothing moved.')
    expect(text).toContain('## Q2 → Q3\n\n- Beta | pipe up 1 to #1\n- Alpha down 1 to #2\n')
    expect(text).not.toContain('unchanged')
  })
})
