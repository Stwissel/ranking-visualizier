/**
 * `<rv-present-view>`: the comparison told one ranking at a time, full screen. Columns keep
 * their final positions from the first step, so lines extend into place rather than the
 * picture reflowing.
 */
import { html, LitElement, nothing } from 'lit'
import { compareRankings, type RankingDoc, type TopicDoc } from '../data/model.js'
import './bump-chart.js'
import './change-summary.js'
import { bandsOf } from './compare-view.js'
import { formatDate } from './format.js'
import { navigate } from './router.js'

export class RvPresentView extends LitElement {
  static override properties = {
    rankings: { attribute: false },
    topics: { attribute: false },
    step: { state: true },
  }

  rankings: RankingDoc[] = []
  topics: ReadonlyMap<string, TopicDoc> = new Map()
  /** How many rankings are shown, 1 to `rankings.length`. */
  step = 1

  protected override createRenderRoot(): HTMLElement {
    return this
  }

  private get ordered(): RankingDoc[] {
    return [...this.rankings].sort(compareRankings)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.setAttribute('tabindex', '0')
    this.addEventListener('keydown', this.onKeyDown)
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => undefined)
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('keydown', this.onKeyDown)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }

  protected override firstUpdated(): void {
    this.focus()
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const total = this.ordered.length
    const actions: Record<string, () => void> = {
      ArrowRight: () => this.go(this.step + 1),
      ' ': () => this.go(this.step + 1),
      Enter: () => this.go(this.step + 1),
      PageDown: () => this.go(this.step + 1),
      ArrowLeft: () => this.go(this.step - 1),
      PageUp: () => this.go(this.step - 1),
      Home: () => this.go(1),
      End: () => this.go(total),
      Escape: () => this.leave(),
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  private go(step: number): void {
    this.step = Math.min(Math.max(step, 1), this.ordered.length)
  }

  private leave(): void {
    navigate({
      view: 'compare',
      rids: this.ordered.map((ranking) => ranking._id.split(':').pop() ?? ''),
    })
  }

  override render() {
    const ordered = this.ordered
    const shown = ordered.slice(0, this.step)
    const current = shown[shown.length - 1]
    const previous = shown.length > 1 ? shown[shown.length - 2] : undefined
    if (!current) return nothing
    const frame = {
      columns: ordered.length,
      rows: Math.max(1, ...ordered.map((ranking) => ranking.items.length)),
    }
    return html`
      <section class="rv-present wa-stack wa-gap-l" aria-label="Presentation">
        <header class="wa-split wa-align-items-center">
          <div class="wa-stack wa-gap-3xs">
            <h1 class="wa-heading-xl rv-page-title">${current.name}</h1>
            <p class="rv-page-subtitle">${formatDate(current.date, { dateStyle: 'full' })}</p>
          </div>
          <div class="wa-cluster wa-gap-xs">
            <span class="rv-quiet" aria-live="polite">${this.step} of ${ordered.length}</span>
            <wa-button size="s" appearance="outlined" ?disabled=${this.step === 1} @click=${() => this.go(this.step - 1)}>
              <wa-icon name="arrow-left" label="Previous ranking"></wa-icon>
            </wa-button>
            <wa-button size="s" appearance="outlined" ?disabled=${this.step === ordered.length} @click=${() => this.go(this.step + 1)}>
              <wa-icon name="arrow-right" label="Next ranking"></wa-icon>
            </wa-button>
            <wa-button size="s" appearance="plain" @click=${() => this.leave()}>
              <wa-icon slot="start" name="xmark"></wa-icon>Leave
            </wa-button>
          </div>
        </header>
        <rv-bump-chart
          size="large"
          .rankings=${shown}
          .topics=${this.topics}
          .frame=${frame}
          .bands=${bandsOf(current)}
        ></rv-bump-chart>
        ${
          previous
            ? html`<rv-change-summary .previous=${previous} .current=${current} .topics=${this.topics}></rv-change-summary>`
            : html`<p class="rv-quiet">Press → or space to reveal the next ranking.</p>`
        }
      </section>
    `
  }
}

customElements.define('rv-present-view', RvPresentView)
