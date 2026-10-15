/**
 * `<rv-bump-chart>`: rank over rankings, one line per topic in the topic's own colour.
 *
 * D3 does scales, line generation and the data join; Lit owns the element and the detail
 * panel. The SVG is redrawn in `updated()` and on resize, with short transitions so a changed
 * selection reads as movement rather than a new picture.
 */

import { scaleLinear, scalePoint } from 'd3-scale'
import { select } from 'd3-selection'
import { curveMonotoneX, line } from 'd3-shape'
import { html, LitElement, nothing } from 'lit'
import 'd3-transition'
import { compareRankings, type RankingDoc, type TopicDoc } from '../data/model.js'
import { formatDate } from './format.js'

interface Point {
  rankingIndex: number
  rank: number
  description: string
}

interface Series {
  topicId: string
  title: string
  colour: string
  points: Point[]
}

const MARGIN = { top: 16, right: 150, bottom: 40, left: 36 }
const ROW_HEIGHT = 34
const MIN_HEIGHT = 180
const POINT_RADIUS = 11
const DURATION = 300

/** Black or white, whichever reads better on `hex`. */
function inkOn(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const luminance =
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  return luminance > 0.4 ? '#111111' : '#ffffff'
}

export class RvBumpChart extends LitElement {
  static override properties = {
    rankings: { attribute: false },
    topics: { attribute: false },
    highlighted: { state: true },
    hover: { state: true },
    width: { state: true },
  }

  /** The rankings to show, in any order; the chart sorts them chronologically. */
  rankings: RankingDoc[] = []
  topics: ReadonlyMap<string, TopicDoc> = new Map()
  /** Topic id highlighted by hover or keyboard focus. */
  highlighted: string | undefined
  /** The hovered point, for the detail panel. */
  hover: { topicId: string; rankingIndex: number } | undefined
  width = 0

  private observer: ResizeObserver | undefined

  protected override createRenderRoot(): HTMLElement {
    return this
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) this.width = Math.floor(entry.contentRect.width)
    })
    this.observer.observe(this)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.observer?.disconnect()
  }

  private get ordered(): RankingDoc[] {
    return [...this.rankings].sort(compareRankings)
  }

  private get series(): Series[] {
    const ordered = this.ordered
    const byTopic = new Map<string, Series>()
    ordered.forEach((ranking, rankingIndex) => {
      ranking.items.forEach((item, index) => {
        const topic = this.topics.get(item.topicId)
        let entry = byTopic.get(item.topicId)
        if (!entry) {
          entry = {
            topicId: item.topicId,
            title: topic?.title ?? 'Unknown topic',
            colour: topic?.colour ?? '#888888',
            points: [],
          }
          byTopic.set(item.topicId, entry)
        }
        entry.points.push({ rankingIndex, rank: index + 1, description: item.description })
      })
    })
    // Stable order: by rank in the last ranking they appear in, then title.
    return [...byTopic.values()].sort((a, b) => {
      const lastA = a.points[a.points.length - 1]!
      const lastB = b.points[b.points.length - 1]!
      return (
        lastB.rankingIndex - lastA.rankingIndex ||
        lastA.rank - lastB.rank ||
        a.title.localeCompare(b.title)
      )
    })
  }

  private get maxRank(): number {
    return Math.max(1, ...this.rankings.map((ranking) => ranking.items.length))
  }

  private get height(): number {
    return Math.max(MIN_HEIGHT, MARGIN.top + MARGIN.bottom + this.maxRank * ROW_HEIGHT)
  }

  protected override updated(): void {
    this.draw()
  }

  private draw(): void {
    const svg = this.querySelector<SVGSVGElement>('svg.rv-chart')
    if (!svg || this.width === 0) return
    const ordered = this.ordered
    const series = this.series
    const width = this.width
    const height = this.height
    const rightMargin = width < 520 ? 24 : MARGIN.right
    const x = scalePoint<number>()
      .domain(ordered.map((_, index) => index))
      .range([MARGIN.left, width - rightMargin])
      .padding(0.3)
    const y = scaleLinear()
      .domain([1, this.maxRank])
      .range([MARGIN.top + ROW_HEIGHT / 2, height - MARGIN.bottom - ROW_HEIGHT / 2])
    const path = line<Point>()
      .x((point) => x(point.rankingIndex) ?? 0)
      .y((point) => y(point.rank))
      .curve(curveMonotoneX)

    const root = select(svg).attr('viewBox', `0 0 ${width} ${height}`).attr('height', height)

    // Rank gridlines and labels.
    const ranks = Array.from({ length: this.maxRank }, (_, index) => index + 1)
    root
      .select<SVGGElement>('g.grid')
      .selectAll<SVGLineElement, number>('line')
      .data(ranks)
      .join(
        (enter) =>
          enter
            .append('line')
            .attr('x1', MARGIN.left)
            .attr('x2', width - rightMargin),
        (update) => update,
        (exit) => exit.remove(),
      )
      .transition()
      .duration(DURATION)
      .attr('x1', MARGIN.left)
      .attr('x2', width - rightMargin)
      .attr('y1', (rank) => y(rank))
      .attr('y2', (rank) => y(rank))
    root
      .select<SVGGElement>('g.rank-axis')
      .selectAll<SVGTextElement, number>('text')
      .data(ranks)
      .join('text')
      .attr('x', MARGIN.left - 12)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .text((rank) => String(rank))
      .transition()
      .duration(DURATION)
      .attr('y', (rank) => y(rank))

    // Ranking (x) axis: name and date, stacked.
    const axis = root
      .select<SVGGElement>('g.axis')
      .selectAll<SVGGElement, RankingDoc>('g.tick')
      .data(ordered, (ranking) => ranking._id)
      .join((enter) => {
        const tick = enter.append('g').attr('class', 'tick')
        tick
          .append('line')
          .attr('y1', MARGIN.top)
          .attr('y2', height - MARGIN.bottom)
        tick.append('text').attr('class', 'tick-name').attr('text-anchor', 'middle')
        tick.append('text').attr('class', 'tick-date').attr('text-anchor', 'middle')
        return tick
      })
    axis
      .select('line')
      .transition()
      .duration(DURATION)
      .attr('x1', (_, i) => x(i) ?? 0)
      .attr('x2', (_, i) => x(i) ?? 0)
      .attr('y2', height - MARGIN.bottom)
    axis
      .select<SVGTextElement>('text.tick-name')
      .text((ranking) => ranking.name)
      .transition()
      .duration(DURATION)
      .attr('x', (_, i) => x(i) ?? 0)
      .attr('y', height - MARGIN.bottom + 16)
    axis
      .select<SVGTextElement>('text.tick-date')
      .attr('class', 'tick-date')
      .text((ranking) => formatDate(ranking.date))
      .transition()
      .duration(DURATION)
      .attr('x', (_, i) => x(i) ?? 0)
      .attr('y', height - MARGIN.bottom + 32)

    // One group per topic: line, points with rank numbers, end label.
    const topicGroups = root
      .select<SVGGElement>('g.topics')
      .selectAll<SVGGElement, Series>('g.topic')
      .data(series, (entry) => entry.topicId)
      .join((enter) => {
        const group = enter
          .append('g')
          .attr('class', 'topic')
          .attr('tabindex', 0)
          .attr('role', 'img')
        group.append('title')
        group.append('path').attr('class', 'topic-line')
        group.append('g').attr('class', 'points')
        group.append('text').attr('class', 'topic-label').attr('dominant-baseline', 'middle')
        return group
      })
      .attr('data-active', (entry) => (entry.topicId === this.highlighted ? '' : null))
      .attr(
        'aria-label',
        (entry) =>
          `${entry.title}: ${entry.points.map((p) => `rank ${p.rank} in ${ordered[p.rankingIndex]?.name ?? ''}`).join(', ')}`,
      )
      .on('pointerenter', (_, entry) => {
        this.highlighted = entry.topicId
      })
      .on('pointerleave', () => {
        this.highlighted = undefined
        this.hover = undefined
      })
      .on('focus', (_, entry) => {
        this.highlighted = entry.topicId
        this.hover = {
          topicId: entry.topicId,
          rankingIndex: entry.points[entry.points.length - 1]!.rankingIndex,
        }
      })
      .on('blur', () => {
        this.highlighted = undefined
        this.hover = undefined
      })
    topicGroups.select('title').text((entry) => entry.title)
    topicGroups
      .select<SVGPathElement>('path.topic-line')
      .attr('stroke', (entry) => entry.colour)
      .transition()
      .duration(DURATION)
      .attr('d', (entry) => path(entry.points) ?? '')

    const points = topicGroups
      .select<SVGGElement>('g.points')
      .selectAll<SVGGElement, Point>('g.point')
      .data(
        (entry) =>
          entry.points.map((point) => ({ ...point, topicId: entry.topicId, colour: entry.colour })),
        (point) => String(point.rankingIndex),
      )
      .join((enter) => {
        const point = enter.append('g').attr('class', 'point')
        // The hit target is wider than the mark.
        point.append('circle').attr('class', 'topic-hit').attr('r', 16).attr('fill', 'transparent')
        point.append('circle').attr('class', 'topic-point').attr('r', POINT_RADIUS)
        point
          .append('text')
          .attr('class', 'topic-rank')
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
        return point
      })
      .on('pointerenter', (_, point) => {
        this.hover = { topicId: point.topicId, rankingIndex: point.rankingIndex }
      })
    points.select<SVGCircleElement>('circle.topic-point').attr('fill', (point) => point.colour)
    points
      .select<SVGTextElement>('text.topic-rank')
      .attr('fill', (point) => inkOn(point.colour))
      .text((point) => String(point.rank))
    points
      .transition()
      .duration(DURATION)
      .attr('transform', (point) => `translate(${x(point.rankingIndex) ?? 0}, ${y(point.rank)})`)

    topicGroups
      .select<SVGTextElement>('text.topic-label')
      .text((entry) => (rightMargin > 24 ? entry.title : ''))
      .transition()
      .duration(DURATION)
      .attr(
        'x',
        (entry) => (x(entry.points[entry.points.length - 1]!.rankingIndex) ?? 0) + POINT_RADIUS + 8,
      )
      .attr('y', (entry) => y(entry.points[entry.points.length - 1]!.rank))

    svg.toggleAttribute('data-focus', this.highlighted !== undefined)
  }

  override render() {
    const ordered = this.ordered
    const hovered = this.hover
    const series = this.series
    const focused = series.find((entry) => entry.topicId === (hovered?.topicId ?? this.highlighted))
    const point = hovered
      ? focused?.points.find((p) => p.rankingIndex === hovered.rankingIndex)
      : undefined
    return html`
      <svg class="rv-chart" role="group" aria-label="Bump chart of ranks across the selected rankings" height=${this.height}>
        <g class="grid"></g>
        <g class="rank-axis"></g>
        <g class="axis"></g>
        <g class="topics"></g>
      </svg>
      <div class="rv-chart-detail wa-caption-m" aria-live="polite">
        ${
          focused
            ? html`<strong>${focused.title}</strong>
                ${
                  point
                    ? html` · rank ${point.rank} in ${ordered[point.rankingIndex]?.name ?? ''}${point.description ? html`: <span class="rv-quiet">${point.description}</span>` : nothing}`
                    : html` · ${focused.points.map((p) => `${p.rank}`).join(' → ')}`
                }`
            : html`<span class="rv-quiet">Hover or focus a line for details. Rank 1 is the top.</span>`
        }
      </div>
    `
  }
}

customElements.define('rv-bump-chart', RvBumpChart)
