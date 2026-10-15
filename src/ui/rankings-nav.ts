import { html, LitElement, nothing } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { type RankingDoc, shortId } from '../data/model.js'
import { requestDialog } from './events.js'
import { formatDate } from './format.js'
import { navigate, type Route, routeHash } from './router.js'

/**
 * The sidebar: rankings newest first, each with a checkbox for comparison, then topics.
 * Written once into `<wa-page>`'s navigation slot; the page renders it as a sidebar on
 * desktop and as a drawer on mobile.
 */
export class RvRankingsNav extends LitElement {
  static override properties = {
    rankings: { attribute: false },
    route: { attribute: false },
    compareIds: { attribute: false },
    topicCount: { type: Number },
    hasSession: { type: Boolean },
  }

  rankings: RankingDoc[] = []
  route: Route = { view: 'home' }
  compareIds: ReadonlySet<string> = new Set()
  topicCount = 0
  hasSession = false

  protected override createRenderRoot(): HTMLElement {
    return this
  }

  private toggleCompare(rid: string, checked: boolean): void {
    this.dispatchEvent(
      new CustomEvent('rv-compare-toggle', {
        detail: { rid, checked },
        bubbles: true,
        composed: true,
      }),
    )
  }

  private compareNow = (): void => {
    const rids = this.rankings.map((r) => shortId(r._id)).filter((rid) => this.compareIds.has(rid))
    navigate({ view: 'compare', rids })
  }

  private isCurrent(rid: string): boolean {
    return this.route.view === 'ranking' && this.route.rid === rid
  }

  override render() {
    if (!this.hasSession) return nothing
    const selected = this.compareIds.size
    return html`
      <nav class="rv-nav wa-stack wa-gap-m" aria-label="Rankings and topics">
        <div class="wa-split wa-align-items-center">
          <h2 class="rv-nav-heading">Rankings</h2>
          <wa-button size="s" appearance="plain" @click=${() => requestDialog(this, { kind: 'new-ranking' })}>
            <wa-icon slot="start" name="plus"></wa-icon>New
          </wa-button>
        </div>
        ${
          this.rankings.length === 0
            ? html`<p class="rv-quiet wa-caption-m">No rankings yet.</p>`
            : html`<ul class="rv-nav-list wa-stack wa-gap-3xs">
                ${repeat(
                  this.rankings,
                  (r) => r._id,
                  (r) => {
                    const rid = shortId(r._id)
                    return html`<li class="rv-nav-row" aria-current=${this.isCurrent(rid) ? 'page' : nothing}>
                      <wa-checkbox
                        size="s"
                        ?checked=${this.compareIds.has(rid)}
                        @change=${(e: Event) => this.toggleCompare(rid, (e.target as HTMLInputElement).checked)}
                      ><span class="wa-visually-hidden">Compare ${r.name}</span></wa-checkbox>
                      <a class="rv-nav-link" href=${routeHash({ view: 'ranking', rid })} data-drawer="close">
                        <span class="rv-nav-link-name">${r.name}</span>
                        <span class="rv-nav-link-date">${formatDate(r.date)}</span>
                      </a>
                    </li>`
                  },
                )}
              </ul>`
        }
        ${
          this.rankings.length >= 2
            ? html`<wa-button
                size="s"
                variant="brand"
                appearance=${this.route.view === 'compare' ? 'accent' : 'outlined'}
                ?disabled=${selected < 2}
                @click=${this.compareNow}
                data-drawer="close"
              >
                <wa-icon slot="start" name="chart-line"></wa-icon>
                ${selected < 2 ? 'Tick 2 or more to compare' : `Compare ${selected} rankings`}
              </wa-button>`
            : nothing
        }
        <wa-divider></wa-divider>
        <h2 class="rv-nav-heading">Topics</h2>
        <ul class="rv-nav-list">
          <li class="rv-nav-row" aria-current=${this.route.view === 'topics' ? 'page' : nothing}>
            <wa-icon name="tags" class="rv-quiet"></wa-icon>
            <a class="rv-nav-link" href=${routeHash({ view: 'topics' })} data-drawer="close">
              <span class="rv-nav-link-name">Manage topics</span>
              <span class="rv-nav-link-date">${this.topicCount} topic${this.topicCount === 1 ? '' : 's'}</span>
            </a>
          </li>
        </ul>
      </nav>
    `
  }
}

customElements.define('rv-rankings-nav', RvRankingsNav)
