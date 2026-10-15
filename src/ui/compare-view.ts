/**
 * `<rv-compare-view>`: two or more rankings side by side as a bump chart, with the table that
 * carries the same numbers for anyone who cannot or would rather not read the chart.
 */
import { html, LitElement, nothing } from 'lit'
import { styleMap } from 'lit/directives/style-map.js'
import { compareRows, describeStats, statsOf } from '../data/insights.js'
import { compareToMarkdown } from '../data/markdown.js'
import { compareRankings, type RankingDoc, type TopicDoc, today } from '../data/model.js'
import type { Band } from './bump-chart.js'
import { rasterise, serialiseChart } from './chart-export.js'
import { attempt, notify } from './events.js'
import { downloadBlob, downloadText, exportFileName, formatDate } from './format.js'
import './bump-chart.js'

export class RvCompareView extends LitElement {
  static override properties = {
    rankings: { attribute: false },
    topics: { attribute: false },
    sessionName: { type: String },
  }

  rankings: RankingDoc[] = []
  topics: ReadonlyMap<string, TopicDoc> = new Map()
  /** For the file names and the Markdown heading. */
  sessionName = ''

  private get ordered(): RankingDoc[] {
    return [...this.rankings].sort(compareRankings)
  }

  private fileName(extension: string): string {
    return exportFileName(today(), `${this.sessionName} compare`).replace(
      /\.json$/,
      `.${extension}`,
    )
  }

  private onExport = (event: CustomEvent<{ item: { value: string } }>): void => {
    const kind = event.detail.item.value
    if (kind === 'svg') void this.exportSvg()
    else if (kind === 'png') void this.exportPng()
    else if (kind === 'markdown') void this.exportMarkdown()
  }

  private chartSvg(): SVGSVGElement {
    const svg = this.querySelector<SVGSVGElement>('rv-bump-chart svg.rv-chart')
    if (!svg) throw new Error('The chart has not been drawn yet')
    return svg
  }

  private async exportSvg(): Promise<void> {
    await attempt(this, async () => {
      downloadText(this.fileName('svg'), serialiseChart(this.chartSvg()), 'image/svg+xml')
    })
  }

  private async exportPng(): Promise<void> {
    await attempt(this, async () => {
      downloadBlob(this.fileName('png'), await rasterise(serialiseChart(this.chartSvg()), 2))
    })
  }

  private async exportMarkdown(): Promise<void> {
    await attempt(this, async () => {
      const text = compareToMarkdown(this.ordered, this.topics, {
        title: this.sessionName || undefined,
        formatDate: (date) => formatDate(date),
      })
      let copied = false
      try {
        await navigator.clipboard.writeText(text)
        copied = true
      } catch {
        // No clipboard permission: the download below still delivers the text.
      }
      downloadText(this.fileName('md'), text, 'text/markdown')
      notify(this, {
        variant: 'success',
        message: copied
          ? 'Markdown copied to the clipboard and downloaded.'
          : 'Markdown downloaded.',
      })
    })
  }

  protected override createRenderRoot(): HTMLElement {
    return this
  }

  override render() {
    const ordered = this.ordered
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
      <header class="wa-split wa-align-items-start">
        <div class="wa-stack wa-gap-2xs">
          <h1 class="wa-heading-l rv-page-title">Compare ${ordered.length} rankings</h1>
          <p class="rv-page-subtitle">${formatDate(first.date)} to ${formatDate(last.date)}. Each line is a topic; up means a higher priority.</p>
        </div>
        <wa-dropdown placement="bottom-end" @wa-select=${this.onExport}>
          <wa-button slot="trigger" size="s" appearance="outlined" with-caret>
            <wa-icon slot="start" name="download"></wa-icon>Export
          </wa-button>
          <wa-dropdown-item value="svg"><wa-icon slot="icon" name="chart-line"></wa-icon>Chart as SVG</wa-dropdown-item>
          <wa-dropdown-item value="png"><wa-icon slot="icon" name="chart-line"></wa-icon>Chart as PNG (2x)</wa-dropdown-item>
          <wa-dropdown-item value="markdown"><wa-icon slot="icon" name="list-ol"></wa-icon>Summary and table as Markdown</wa-dropdown-item>
        </wa-dropdown>
      </header>
      <wa-card>
        <rv-bump-chart .rankings=${ordered} .topics=${this.topics} .bands=${bandsOf(last)}></rv-bump-chart>
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
            ${row.ranks.map((rank, index) =>
              this.renderCell(
                rank,
                index === 0 ? undefined : row.ranks[index - 1],
                row.tiers[index],
                index === 0 ? undefined : row.tiers[index - 1],
              ),
            )}
          </tr>`,
        )}
      </tbody>
    </table>`
  }

  private renderCell(
    rank: number | undefined,
    previous: number | undefined,
    tier: string | undefined,
    previousTier: string | undefined,
  ) {
    if (rank === undefined) return html`<td class="rv-rank-cell rv-quiet">—</td>`
    const tierLine = tier
      ? html`<div class="rv-tier-cell wa-caption-s rv-quiet">
          ${tier}
          ${
            previousTier !== undefined && previousTier.toLowerCase() !== tier.toLowerCase()
              ? html`<wa-icon name="arrow-right-arrow-left" label=${`tier changed from ${previousTier}`}></wa-icon>`
              : nothing
          }
        </div>`
      : nothing
    if (previous === undefined) return html`<td class="rv-rank-cell">${rank}${tierLine}</td>`
    const delta = previous - rank
    const cls = delta > 0 ? 'rv-delta-up' : delta < 0 ? 'rv-delta-down' : 'rv-delta-same'
    const icon = delta > 0 ? 'arrow-up' : delta < 0 ? 'arrow-down' : 'minus'
    const label = delta > 0 ? `up ${delta}` : delta < 0 ? `down ${-delta}` : 'unchanged'
    return html`<td class="rv-rank-cell">
      ${rank}
      <span class=${cls}><wa-icon name=${icon} label=${label}></wa-icon>${delta === 0 ? nothing : Math.abs(delta)}</span>
      ${tierLine}
    </td>`
  }

  private rows(ordered: RankingDoc[]) {
    return compareRows(ordered, this.topics)
  }
}

/** The rank range of each tier in a ranking, for the chart's bands. Empty tiers draw nothing. */
export function bandsOf(ranking: RankingDoc): Band[] {
  if (!ranking.tiers?.length) return []
  return ranking.tiers.flatMap((tier) => {
    const ranks = ranking.items
      .map((item, index) => (item.tierId === tier.id ? index + 1 : undefined))
      .filter((rank): rank is number => rank !== undefined)
    if (ranks.length === 0) return []
    return [{ name: tier.name, from: Math.min(...ranks), to: Math.max(...ranks) }]
  })
}

customElements.define('rv-compare-view', RvCompareView)
