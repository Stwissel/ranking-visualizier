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
  /** Undefined where the topic is absent from that ranking: the line breaks there. */
  rank: number | undefined
  description: string
}

/** A point the topic is ranked at. */
type RankedPoint = Point & { rank: number }

function isRanked(point: Point): point is RankedPoint {
  return point.rank !== undefined
}

interface Series {
  topicId: string
  title: string
  colour: string
  points: Point[]
}

/** Elements not yet positioned, i.e. created by this draw: `transform`, `d`, `x` all absent. */
function isFresh(this: Element): boolean {
  return !this.hasAttribute('d') && !this.hasAttribute('transform') && !this.hasAttribute('x')
}

function isSettled(this: Element): boolean {
  return !isFresh.call(this)
}

/** The last ranking a topic appears in; every series has at least one. */
function lastRanked(series: Series): RankedPoint {
  return series.points.filter(isRanked).at(-1)!
}

const MARGIN = { top: 16, right: 150, bottom: 40, left: 36 }
const ROW_HEIGHT = 34
const MIN_HEIGHT = 180
const POINT_RADIUS = 11
const DURATION = 300

/** WCAG relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return (
    0.2126 * channel((value >> 16) & 255) +
    0.7152 * channel((value >> 8) & 255) +
    0.0722 * channel(value & 255)
  )
}

/** WCAG contrast ratio between two luminances. */
function contrast(a: number, b: number): number {
  const [light, dark] = a > b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

const INK_DARK = '#111111'
const INK_LIGHT = '#ffffff'

/** Of black and white, the ink with the higher contrast ratio on `hex`. */
export function inkOn(hex: string): string {
  const background = luminance(hex)
  return contrast(background, luminance(INK_DARK)) >= contrast(background, luminance(INK_LIGHT))
    ? INK_DARK
    : INK_LIGHT
}

/** A horizontal band behind the lines, covering ranks `from` to `to` inclusive. */
export interface Band {
  name: string
  from: number
  to: number
}

export class RvBumpChart extends LitElement {
  static override properties = {
    rankings: { attribute: false },
    topics: { attribute: false },
    bands: { attribute: false },
    frame: { attribute: false },
    size: { type: String, reflect: true },
    selected: { attribute: false },
    highlighted: { state: true },
    hover: { state: true },
    width: { state: true },
  }

  /** The rankings to show, in any order; the chart sorts them chronologically. */
  rankings: RankingDoc[] = []
  topics: ReadonlyMap<string, TopicDoc> = new Map()
  /** Tier bands of the latest ranking, drawn behind everything. */
  bands: Band[] = []
  /**
   * Fixes the column and row count independently of the rankings shown, so a presentation
   * that reveals rankings one at a time keeps every column where it will end up.
   */
  frame: { columns: number; rows: number } | undefined
  /** `large` for a presentation: taller rows, bigger type. */
  size: 'medium' | 'large' = 'medium'

  private get rowHeight(): number {
    return this.size === 'large' ? 56 : ROW_HEIGHT
  }
  /**
   * Topic pinned by a click (or Enter on a focused line). Stays highlighted until clicked again
   * or the background is clicked; the owner may set it too, e.g. from a table row.
   */
  selected: string | undefined
  /** Topic id highlighted by hover or keyboard focus. */
  highlighted: string | undefined
  /** The hovered point, for the detail panel. */
  hover: { topicId: string; rankingIndex: number } | undefined
  width = 0

  private observer: ResizeObserver | undefined

  /** For a topic that no longer exists: the neutral token, read once the element is styled. */
  private get fallbackColour(): string {
    return (
      getComputedStyle(this).getPropertyValue('--wa-color-neutral-fill-loud').trim() || '#888888'
    )
  }

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
          // One point per ranking, ranked or not, so a topic absent from a middle ranking
          // shows a gap rather than a line drawn straight across it.
          entry = {
            topicId: item.topicId,
            title: topic?.title ?? 'Unknown topic',
            colour: topic?.colour ?? this.fallbackColour,
            points: ordered.map((_, i) => ({ rankingIndex: i, rank: undefined, description: '' })),
          }
          byTopic.set(item.topicId, entry)
        }
        entry.points[rankingIndex] = {
          rankingIndex,
          rank: index + 1,
          description: item.description,
        }
      })
    })
    // Stable order: by rank in the last ranking they appear in, then title.
    return [...byTopic.values()].sort((a, b) => {
      const lastA = lastRanked(a)
      const lastB = lastRanked(b)
      return (
        lastB.rankingIndex - lastA.rankingIndex ||
        lastA.rank - lastB.rank ||
        a.title.localeCompare(b.title)
      )
    })
  }

  private get maxRank(): number {
    return Math.max(
      1,
      this.frame?.rows ?? 0,
      ...this.rankings.map((ranking) => ranking.items.length),
    )
  }

  /** Column indices of the x scale: the rankings shown, or the frame when it is wider. */
  private get columns(): number[] {
    const count = Math.max(this.rankings.length, this.frame?.columns ?? 0)
    return Array.from({ length: count }, (_, index) => index)
  }

  private get height(): number {
    return Math.max(MIN_HEIGHT, MARGIN.top + MARGIN.bottom + this.maxRank * this.rowHeight)
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
      .domain(this.columns)
      .range([MARGIN.left, width - rightMargin])
      .padding(0.3)
    const y = scaleLinear()
      .domain([1, this.maxRank])
      .range([MARGIN.top + this.rowHeight / 2, height - MARGIN.bottom - this.rowHeight / 2])
    const path = line<Point>()
      .defined(isRanked)
      .x((point) => x(point.rankingIndex) ?? 0)
      .y((point) => y(point.rank ?? 1))
      .curve(curveMonotoneX)

    const root = select(svg).attr('viewBox', `0 0 ${width} ${height}`).attr('height', height)

    // Tier bands, behind everything; alternate opacity tells neighbours apart without strokes.
    const bands = root
      .select<SVGGElement>('g.bands')
      .selectAll<SVGGElement, Band>('g.band')
      .data(this.bands, (band) => band.name)
      .join((enter) => {
        const band = enter.append('g').attr('class', 'band')
        band.append('rect').attr('class', 'band-fill')
        band.append('text').attr('class', 'band-label')
        return band
      })
      .attr('data-alternate', (_, i) => (i % 2 === 1 ? '' : null))
    bands
      .select<SVGRectElement>('rect.band-fill')
      .attr('x', MARGIN.left - 8)
      .attr('width', Math.max(0, width - rightMargin - MARGIN.left + 16))
      .attr('y', (band) => y(band.from) - this.rowHeight / 2)
      .attr('height', (band) => y(band.to) - y(band.from) + this.rowHeight)
      .attr('rx', 6)
    bands
      .select<SVGTextElement>('text.band-label')
      .attr('x', width - rightMargin + 8)
      .attr('y', (band) => y(band.from) - this.rowHeight / 2 + 12)
      .attr('text-anchor', 'start')
      .text((band) => (rightMargin > 24 ? '' : band.name))
    bands
      .select<SVGTextElement>('text.band-label')
      .filter(() => rightMargin > 24)
      .attr('x', MARGIN.left - 4)
      .attr('text-anchor', 'start')
      .text((band) => band.name)

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
          .attr('data-topic-id', (entry) => entry.topicId)
          .attr('tabindex', 0)
          .attr('role', 'button')
        group.append('title')
        group.append('path').attr('class', 'topic-line')
        group.append('g').attr('class', 'points')
        group.append('text').attr('class', 'topic-label').attr('dominant-baseline', 'middle')
        return group
      })
      .attr('data-active', (entry) =>
        entry.topicId === this.highlighted || entry.topicId === this.selected ? '' : null,
      )
      .attr('data-selected', (entry) => (entry.topicId === this.selected ? '' : null))
      .attr('aria-pressed', (entry) => (entry.topicId === this.selected ? 'true' : 'false'))
      .attr(
        'aria-label',
        (entry) =>
          `${entry.title}: ${entry.points
            .filter(isRanked)
            .map((p) => `rank ${p.rank} in ${ordered[p.rankingIndex]?.name ?? ''}`)
            .join(', ')}`,
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
          rankingIndex: lastRanked(entry).rankingIndex,
        }
      })
      .on('blur', () => {
        this.highlighted = undefined
        this.hover = undefined
      })
      .on('click', (event: MouseEvent, entry) => {
        event.stopPropagation()
        this.toggle(entry.topicId)
      })
      .on('keydown', (event: KeyboardEvent, entry) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        this.toggle(entry.topicId)
      })
    topicGroups.select('title').text((entry) => entry.title)
    // A node drawn for the first time sits at its final position at once; transitions only
    // animate a change to something already on screen.
    const lines = topicGroups
      .select<SVGPathElement>('path.topic-line')
      .attr('stroke', (entry) => entry.colour)
    const lineShape = (entry: Series) => path(entry.points) ?? ''
    lines.filter(isFresh).attr('d', lineShape)
    lines.filter(isSettled).transition().duration(DURATION).attr('d', lineShape)

    const points = topicGroups
      .select<SVGGElement>('g.points')
      .selectAll<SVGGElement, Point>('g.point')
      .data(
        (entry) =>
          entry.points
            .filter(isRanked)
            .map((point) => ({ ...point, topicId: entry.topicId, colour: entry.colour })),
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
    const place = (point: RankedPoint) =>
      `translate(${x(point.rankingIndex) ?? 0}, ${y(point.rank)})`
    points.filter(isFresh).attr('transform', place)
    points.filter(isSettled).transition().duration(DURATION).attr('transform', place)

    const labels = topicGroups
      .select<SVGTextElement>('text.topic-label')
      .text((entry) => (rightMargin > 24 ? entry.title : ''))
    const labelX = (entry: Series) => (x(lastRanked(entry).rankingIndex) ?? 0) + POINT_RADIUS + 8
    const labelY = (entry: Series) => y(lastRanked(entry).rank)
    labels.filter(isFresh).attr('x', labelX).attr('y', labelY)
    labels.filter(isSettled).transition().duration(DURATION).attr('x', labelX).attr('y', labelY)

    svg.toggleAttribute('data-focus', this.highlighted !== undefined || this.selected !== undefined)
  }

  private toggle(topicId: string): void {
    this.select(this.selected === topicId ? undefined : topicId)
  }

  /** Pins `topicId` (or clears the pin) and tells the owner, so a table can follow. */
  private select(topicId: string | undefined): void {
    if (this.selected === topicId) return
    this.selected = topicId
    this.dispatchEvent(
      new CustomEvent<{ topicId: string | undefined }>('rv-select-topic', {
        detail: { topicId },
        bubbles: true,
        composed: true,
      }),
    )
  }

  /** A click on the chart background, not on a line, clears the pin. */
  private onBackgroundClick = (event: Event): void => {
    if ((event.target as Element).closest('g.topic')) return
    this.select(undefined)
  }

  override render() {
    const ordered = this.ordered
    const hovered = this.hover
    const series = this.series
    const focused = series.find(
      (entry) => entry.topicId === (hovered?.topicId ?? this.highlighted ?? this.selected),
    )
    const point = hovered
      ? focused?.points.filter(isRanked).find((p) => p.rankingIndex === hovered.rankingIndex)
      : undefined
    return html`
      <svg class="rv-chart" size=${this.size} role="group" aria-label="Bump chart of ranks across the selected rankings" height=${this.height} @click=${this.onBackgroundClick}>
        <g class="bands"></g>
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
                    : html` · ${focused.points.map((p) => (p.rank === undefined ? '–' : `${p.rank}`)).join(' → ')}`
                }`
            : html`<span class="rv-quiet">Hover or focus a line for details; click to pin it. Rank 1 is the top.</span>`
        }
      </div>
    `
  }
}

customElements.define('rv-bump-chart', RvBumpChart)
