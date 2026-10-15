/**
 * `<rv-compare-view>`: two or more rankings side by side as a bump chart, with the table that
 * carries the same numbers for anyone who cannot or would rather not read the chart.
 */
import { html, LitElement, nothing } from 'lit'
import { styleMap } from 'lit/directives/style-map.js'
import { compareRows, describeStats, statsOf } from '../data/insights.js'
import { compareRankings, type RankingDoc, type TopicDoc } from '../data/model.js'
import { formatDate } from './format.js'
import './bump-chart.js'

export class RvCompareView extends LitElement {
  static override properties = {
    rankings: { attribute: false },
    topics: { attribute: false },
  }

  rankings: RankingDoc[] = []
  topics: ReadonlyMap<string, TopicDoc> = new Map()

  protected override createRenderRoot(): HTMLElement {
    return this
  }

  override render() {
    const ordered = [...this.rankings].sort(compareRankings)
    if (ordered.length < 2) {
      return html`<div class="rv-empty wa-stack wa-gap-s wa-align-items-center">
        <wa-icon name="chart-line"></wa-icon>
        <h1 class="wa-heading-l rv-page-title">Compare rankings</h1>
        <p>Tick two or more rankings in the sidebar to see how their order shifted.</p>
      </div>`
    }
    const first = ordered[0]!
    const last = ordered[ordered.length - 1]!
    return html`
      <header class="wa-stack wa-gap-2xs">
        <h1 class="wa-heading-l rv-page-title">Compare ${ordered.length} rankings</h1>
        <p class="rv-page-subtitle">${formatDate(first.date)} to ${formatDate(last.date)}. Each line is a topic; up means a higher priority.</p>
      </header>
      <wa-card>
        <rv-bump-chart .rankings=${ordered} .topics=${this.topics}></rv-bump-chart>
      </wa-card>
      <section class="wa-stack wa-gap-s">
        <h2 class="wa-heading-s">Ranks and changes</h2>
        <div class="rv-table-wrap">${this.renderTable(ordered)}</div>
      </section>
    `
  }

  private renderTable(ordered: RankingDoc[]) {
    const rows = this.rows(ordered)
    return html`<table class="rv-compare-table">
      <thead>
        <tr>
          <th scope="col">Topic</th>
          ${ordered.map((r) => html`<th scope="col"><div>${r.name}</div><div class="wa-caption-s">${formatDate(r.date)}</div></th>`)}
        </tr>
      </thead>
      <tbody>
        ${rows.map(
          (row) => html`<tr>
            <th scope="row">
              <span class="wa-cluster wa-gap-xs" id=${`rv-row-${row.topicId}`}>
                <span class="rv-swatch" style=${styleMap({ '--rv-colour': row.colour ?? '' })}></span>${row.title}
              </span>
              <wa-tooltip for=${`rv-row-${row.topicId}`} placement="right">${describeStats(statsOf(row.topicId, ordered))}</wa-tooltip>
            </th>
            ${row.ranks.map((rank, index) => this.renderCell(rank, index === 0 ? undefined : row.ranks[index - 1]))}
          </tr>`,
        )}
      </tbody>
    </table>`
  }

  private renderCell(rank: number | undefined, previous: number | undefined) {
    if (rank === undefined) return html`<td class="rv-rank-cell rv-quiet">—</td>`
    if (previous === undefined) return html`<td class="rv-rank-cell">${rank}</td>`
    const delta = previous - rank
    const cls = delta > 0 ? 'rv-delta-up' : delta < 0 ? 'rv-delta-down' : 'rv-delta-same'
    const icon = delta > 0 ? 'arrow-up' : delta < 0 ? 'arrow-down' : 'minus'
    const label = delta > 0 ? `up ${delta}` : delta < 0 ? `down ${-delta}` : 'unchanged'
    return html`<td class="rv-rank-cell">
      ${rank}
      <span class=${cls}><wa-icon name=${icon} label=${label}></wa-icon>${delta === 0 ? nothing : Math.abs(delta)}</span>
    </td>`
  }

  private rows(ordered: RankingDoc[]) {
    return compareRows(ordered, this.topics)
  }
}

customElements.define('rv-compare-view', RvCompareView)
