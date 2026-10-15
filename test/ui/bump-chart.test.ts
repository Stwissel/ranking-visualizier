import '../../src/ui/styles/app.css'
import '../../src/ui/bump-chart.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { RankingDoc, TopicDoc } from '../../src/data/model.js'
import type { RvBumpChart } from '../../src/ui/bump-chart.js'
import { until } from './support/browser-store.js'

afterEach(() => {
  document.body.replaceChildren()
})

const topics = new Map<string, TopicDoc>([
  ['a', { _id: 'topic:s:a', type: 'topic', sessionId: 's', title: 'Alpha', colour: '#2a78d6' }],
  ['b', { _id: 'topic:s:b', type: 'topic', sessionId: 's', title: 'Beta', colour: '#eb6834' }],
  ['c', { _id: 'topic:s:c', type: 'topic', sessionId: 's', title: 'Gamma', colour: '#1baf7a' }],
])

function ranking(rid: string, date: string, order: string[]): RankingDoc {
  return {
    _id: `ranking:s:${rid}`,
    type: 'ranking',
    sessionId: 's',
    name: rid,
    date,
    createdAt: `${date}T00:00:00.000Z`,
    items: order.map((topicId) => ({ topicId, description: `${topicId} in ${rid}` })),
  }
}

async function mount(rankings: RankingDoc[]) {
  const chart = document.createElement('rv-bump-chart') as RvBumpChart
  chart.style.width = '800px'
  chart.rankings = rankings
  chart.topics = topics
  document.body.append(chart)
  await chart.updateComplete
  // The ResizeObserver reports the width asynchronously; the first draw follows it.
  await until(() => chart.querySelectorAll('path.topic-line').length > 0)
  return chart
}

describe('<rv-bump-chart>', () => {
  it('draws one line per topic, in chronological order, with rank numbers and end labels', async () => {
    const chart = await mount([
      ranking('later', '2026-04-01', ['b', 'a']),
      ranking('earlier', '2026-01-01', ['a', 'b', 'c']),
    ])
    expect(chart.querySelectorAll('path.topic-line')).toHaveLength(3)
    const ticks = [...chart.querySelectorAll('text.tick-name')].map((el) => el.textContent)
    expect(ticks).toEqual(['earlier', 'later'])
    const ranks = [...chart.querySelectorAll('text.topic-rank')].map((el) => el.textContent)
    expect(ranks.sort()).toEqual(['1', '1', '2', '2', '3'])
    const labels = [...chart.querySelectorAll('text.topic-label')].map((el) => el.textContent)
    expect(labels.sort()).toEqual(['Alpha', 'Beta', 'Gamma'])
    const lines = [...chart.querySelectorAll<SVGPathElement>('path.topic-line')].map((el) =>
      el.getAttribute('stroke'),
    )
    expect(lines.sort()).toEqual(['#1baf7a', '#2a78d6', '#eb6834'])
  })

  it('highlights a focused topic and describes it in the live region', async () => {
    const chart = await mount([
      ranking('r1', '2026-01-01', ['a', 'b']),
      ranking('r2', '2026-02-01', ['b', 'a']),
    ])
    const group = chart.querySelector<SVGGElement>('g.topic')!
    group.dispatchEvent(new FocusEvent('focus'))
    await chart.updateComplete
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(chart.querySelector('svg')?.hasAttribute('data-focus')).toBe(true)
    expect(chart.querySelector('g.topic[data-active]')).toBeTruthy()
    expect(chart.querySelector('.rv-chart-detail')?.textContent).toMatch(/rank \d in r2/)
  })
})
