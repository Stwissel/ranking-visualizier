/**
 * `<rv-change-summary>`: what moved between a ranking and the one before it, as sentences.
 * The chart shows the shape of a change; this is the line to read out or paste into a report.
 */
import { html, LitElement, nothing } from 'lit'
import { styleMap } from 'lit/directives/style-map.js'
import { type Change, changesBetween, describeChange } from '../data/insights.js'
import type { RankingDoc, TopicDoc } from '../data/model.js'

/** How many lines show before the rest fold behind "and n more". */
const SHOWN = 6

export class RvChangeSummary extends LitElement {
  static override properties = {
    previous: { attribute: false },
    current: { attribute: false },
    topics: { attribute: false },
    expanded: { state: true },
  }

  previous!: RankingDoc
  current!: RankingDoc
  topics: ReadonlyMap<string, TopicDoc> = new Map()
  expanded = false

  protected override createRenderRoot(): HTMLElement {
    return this
  }

  override render() {
    const changes = changesBetween(this.previous, this.current)
    const moved = changes.filter((change) => change.kind !== 'same')
    const unchanged = changes.length - moved.length
    if (moved.length === 0) {
      return html`<wa-callout variant="neutral" size="s" class="rv-summary">
        <wa-icon slot="icon" name="minus"></wa-icon>
        Same order as <strong>${this.previous.name}</strong>: nothing moved.
      </wa-callout>`
    }
    const shown = this.expanded ? moved : moved.slice(0, SHOWN)
    const hidden = moved.length - shown.length
    return html`<wa-callout variant="neutral" size="s" class="rv-summary">
      <wa-icon slot="icon" name="arrow-right-arrow-left"></wa-icon>
      <div class="wa-stack wa-gap-2xs">
        <strong>Since ${this.previous.name}</strong>
        <ul class="rv-summary-list wa-stack wa-gap-3xs">
          ${shown.map((change) => this.renderLine(change))}
        </ul>
        <span class="rv-quiet wa-caption-s">
          ${
            hidden > 0
              ? html`<wa-button appearance="plain" size="s" @click=${() => {
                  this.expanded = true
                }}>and ${hidden} more</wa-button>`
              : nothing
          }
          ${unchanged > 0 ? `${unchanged} unchanged` : nothing}
        </span>
      </div>
    </wa-callout>`
  }

  private renderLine(change: Change) {
    const topic = this.topics.get(change.topicId)
    const title = topic?.title ?? 'Unknown topic'
    const icon =
      change.kind === 'up'
        ? 'arrow-up'
        : change.kind === 'down'
          ? 'arrow-down'
          : change.kind === 'new'
            ? 'plus'
            : 'xmark'
    const cls =
      change.kind === 'up'
        ? 'rv-delta-up'
        : change.kind === 'down'
          ? 'rv-delta-down'
          : 'rv-delta-same'
    return html`<li class="wa-cluster wa-gap-xs">
      <span class="rv-swatch" style=${styleMap({ '--rv-colour': topic?.colour ?? '' })}></span>
      <wa-icon class=${cls} name=${icon} label=${change.kind}></wa-icon>
      <span>${describeChange(change, title)}</span>
    </li>`
  }
}

customElements.define('rv-change-summary', RvChangeSummary)
