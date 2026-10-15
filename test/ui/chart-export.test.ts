import '../../src/ui/styles/app.css'
import '../../src/ui/bump-chart.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { RankingDoc, TopicDoc } from '../../src/data/model.js'
import type { RvBumpChart } from '../../src/ui/bump-chart.js'
import { rasterise, serialiseChart } from '../../src/ui/chart-export.js'
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

async function mountChart(): Promise<SVGSVGElement> {
  const chart = document.createElement('rv-bump-chart') as RvBumpChart
  chart.style.width = '800px'
  chart.rankings = [
    ranking('r1', '2026-01-01', ['a', 'b']),
    ranking('r2', '2026-02-01', ['b', 'a']),
  ]
  chart.topics = topics
  document.body.append(chart)
  await until(() => {
    const paths = [...chart.querySelectorAll('path.topic-line')]
    return paths.length === 2 && paths.every((path) => path.hasAttribute('d'))
  })
  return chart.querySelector<SVGSVGElement>('svg.rv-chart')!
}

describe('chart export', () => {
  it('serialises a standalone SVG with resolved colours and no hit targets', async () => {
    const text = serialiseChart(await mountChart())
    expect(text.startsWith('<?xml')).toBe(true)
    expect(text).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(text).not.toContain('var(')
    expect(text).not.toContain('topic-hit')
    expect(text).not.toContain('class=')
    expect(text).toContain('stroke="rgb(42, 120, 214)"')
    expect(text).toMatch(/width="\d+"/)
    // The on-screen chart is untouched and the staging container is gone.
    expect(document.querySelector('.rv-chart-export-stage')).toBeNull()
    expect(document.querySelectorAll('.topic-hit').length).toBe(4)
  })

  it('rasterises to a PNG at the requested scale', async () => {
    const svg = await mountChart()
    const blob = await rasterise(serialiseChart(svg), 2)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(1000)
    const bitmap = await createImageBitmap(blob)
    const width = Number(svg.getAttribute('viewBox')?.split(' ')[2])
    expect(bitmap.width).toBe(Math.round(width * 2))
  })
})
