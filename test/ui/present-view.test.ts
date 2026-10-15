import '../../src/ui/styles/app.css'
import '../../src/ui/present-view.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { RankingDoc, TopicDoc } from '../../src/data/model.js'
import type { RvPresentView } from '../../src/ui/present-view.js'
import { until } from './support/browser-store.js'

afterEach(() => {
  document.body.replaceChildren()
})

const topics = new Map<string, TopicDoc>([
  ['a', { _id: 'topic:s:a', type: 'topic', sessionId: 's', title: 'Alpha', colour: '#2a78d6' }],
  ['b', { _id: 'topic:s:b', type: 'topic', sessionId: 's', title: 'Beta', colour: '#eb6834' }],
])

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

async function mount(): Promise<RvPresentView> {
  const view = document.createElement('rv-present-view') as RvPresentView
  view.rankings = [
    ranking('r3', '2026-03-01', ['a', 'b']),
    ranking('r1', '2026-01-01', ['a', 'b']),
    ranking('r2', '2026-02-01', ['b', 'a']),
  ]
  view.topics = topics
  document.body.append(view)
  await until(() => view.querySelectorAll('path.topic-line[d]').length === 2)
  return view
}

const ticks = (view: Element) =>
  [...view.querySelectorAll('text.tick-name')].map((el) => el.textContent)
const alphaStart = (view: Element) =>
  view.querySelector('g.topic[data-topic-id="a"] g.point')?.getAttribute('transform')

describe('<rv-present-view>', () => {
  it('starts with the oldest ranking alone and steps forward with the keyboard', async () => {
    const view = await mount()
    expect(ticks(view)).toEqual(['r1'])
    expect(view.textContent).toContain('1 of 3')
    const start = alphaStart(view)
    view.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await until(() => ticks(view).length === 2)
    expect(ticks(view)).toEqual(['r1', 'r2'])
    // Alpha's first mark stayed where it was: the frame fixes the column and row positions.
    expect(alphaStart(view)).toBe(start)
    view.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await until(() => ticks(view).length === 3)
    expect(view.textContent).toContain('3 of 3')
    expect(view.querySelector('rv-change-summary')).toBeTruthy()
    view.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await until(() => ticks(view).length === 1)
    expect(view.querySelector('rv-change-summary')).toBeNull()
  })

  it('draws at the large size', async () => {
    const view = await mount()
    expect(view.querySelector('svg.rv-chart')?.getAttribute('size')).toBe('large')
  })
})
