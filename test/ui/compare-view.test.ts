import '../../src/ui/styles/app.css'
import '@awesome.me/webawesome/dist/components/button/button.js'
import '../../src/ui/compare-view.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { RankingDoc, TopicDoc } from '../../src/data/model.js'
import type { RvCompareView } from '../../src/ui/compare-view.js'
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

async function mount(): Promise<RvCompareView> {
  const view = document.createElement('rv-compare-view') as RvCompareView
  view.style.width = '800px'
  view.rankings = [ranking('r2', '2026-02-01', ['b', 'a']), ranking('r1', '2026-01-01', ['a', 'b'])]
  view.topics = topics
  document.body.append(view)
  await until(() => view.querySelectorAll('path.topic-line[d]').length === 2)
  return view
}

const selectedRow = (view: Element) =>
  view.querySelector('tr[data-selected]')?.getAttribute('data-topic-id') ?? null
const selectedLine = (view: Element) =>
  view.querySelector('g.topic[data-selected]')?.getAttribute('data-topic-id') ?? null

describe('<rv-compare-view>', () => {
  it('aligns the ranking headings with their numbers', async () => {
    const view = await mount()
    const heading = view.querySelectorAll('th[scope="col"]')[1] as HTMLElement
    const cell = view.querySelector('td.rv-rank-cell') as HTMLElement
    expect(getComputedStyle(heading).textAlign).toBe(getComputedStyle(cell).textAlign)
  })

  it('pins a topic from the table onto the chart, and from the chart onto the table', async () => {
    const view = await mount()
    const pickBeta = view.querySelector<HTMLElement>('#rv-row-b')!
    pickBeta.click()
    await until(() => selectedLine(view) === 'b')
    expect(selectedRow(view)).toBe('b')
    expect(pickBeta.getAttribute('aria-pressed')).toBe('true')
    expect(view.querySelector('svg.rv-chart')?.hasAttribute('data-focus')).toBe(true)

    view
      .querySelector('g.topic[data-topic-id="a"]')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await until(() => selectedRow(view) === 'a')
    expect(selectedLine(view)).toBe('a')

    pickBeta.click()
    await until(() => selectedRow(view) === 'b')
    pickBeta.click()
    await until(() => selectedRow(view) === null)
    expect(selectedLine(view)).toBeNull()
  })

  it('drops the pin when the compared rankings no longer contain its topic', async () => {
    const view = await mount()
    view.querySelector<HTMLElement>('#rv-row-b')!.click()
    await until(() => selectedRow(view) === 'b')
    // Alpha stays, Beta is gone from both rankings.
    view.rankings = [ranking('r2', '2026-02-01', ['a']), ranking('r1', '2026-01-01', ['a'])]
    await until(() => view.querySelectorAll('tbody tr').length === 1)
    expect(view.selected).toBeUndefined()
    expect(view.querySelector('svg.rv-chart')?.hasAttribute('data-focus')).toBe(false)
    // A pin whose topic survives the change stays.
    view.querySelector<HTMLElement>('#rv-row-a')!.click()
    await until(() => selectedRow(view) === 'a')
    view.rankings = [ranking('r2', '2026-02-01', ['a', 'b']), ranking('r1', '2026-01-01', ['a'])]
    await until(() => view.querySelectorAll('tbody tr').length === 2)
    expect(selectedRow(view)).toBe('a')
  })
})
