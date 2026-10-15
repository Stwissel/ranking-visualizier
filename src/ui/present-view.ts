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
    document.addEventListener('fullscreenchange', this.onFullscreenChange)
    if (document.fullscreenEnabled && !document.fullscreenElement) {
      void document.documentElement
        .requestFullscreen()
        .then(() => this.setAttribute('data-fullscreen', ''))
        .catch(() => undefined)
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('fullscreenchange', this.onFullscreenChange)
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
  }

  /** The browser's own way out of fullscreen (its Escape, a gesture) leaves the mode too. */
  private onFullscreenChange = (): void => {
    if (!document.fullscreenElement && this.entered) this.leave()
  }

  /** Set once fullscreen was granted, so an early change event does not bounce us out. */
  private get entered(): boolean {
    return this.hasAttribute('data-fullscreen')
  }

  protected override firstUpdated(): void {
    this.focus()
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null
    const onControl =
      target !== this && target?.closest('wa-button, button, a, input, select, textarea')
    // Enter and space on a button activate the button; only the surface itself steps on them.
    if (onControl && (event.key === 'Enter' || event.key === ' ')) return
    if (event.key === 'Tab') {
      this.cycleFocus(event)
      return
    }
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

  /**
   * The surface covers the page, so Tab must not wander into the controls behind it: focus
   * cycles between the surface and its own buttons.
   */
  private cycleFocus(event: KeyboardEvent): void {
    const stops: HTMLElement[] = [
      this,
      ...[...this.querySelectorAll<HTMLElement>('wa-button:not([disabled])')],
    ]
    const active = document.activeElement
    // The innermost stop holding focus: the surface contains every button, so it is checked last.
    let index = 0
    stops.forEach((stop, at) => {
      if (stop === active || (active && stop.contains(active))) index = at
    })
    const next = stops[(index + (event.shiftKey ? -1 : 1) + stops.length) % stops.length]
    if (!next) return
    event.preventDefault()
    next.focus()
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
