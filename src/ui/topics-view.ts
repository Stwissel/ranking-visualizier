/**
 * `<rv-topics-view>`: every topic of the session with its colour, where it currently stands,
 * and the controls to edit or remove it.
 */
import { html, LitElement, nothing } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import { type RankingDoc, shortId, type TopicDoc } from '../data/model.js'
import type { Store } from '../data/store.js'
import { attempt, requestDialog } from './events.js'

export class RvTopicsView extends LitElement {
  static override properties = {
    store: { attribute: false },
    sid: { type: String },
    topics: { attribute: false },
    rankings: { attribute: false },
  }

  store: Store | undefined
  sid = ''
  topics: TopicDoc[] = []
  rankings: RankingDoc[] = []

  protected override createRenderRoot(): HTMLElement {
    return this
  }

  private get newest(): RankingDoc | undefined {
    return this.rankings[0]
  }

  /** Rank in the newest ranking, 1-based, or undefined when retired or never ranked. */
  private rankOf(topic: TopicDoc): number | undefined {
    const index = this.newest?.items.findIndex((item) => item.topicId === shortId(topic._id)) ?? -1
    return index === -1 ? undefined : index + 1
  }

  private async restore(topic: TopicDoc): Promise<void> {
    if (!this.store || !this.newest) return
    const store = this.store
    const rid = shortId(this.newest._id)
    await attempt(this, () => store.addTopicToRanking(this.sid, rid, shortId(topic._id)))
  }

  override render() {
    const newest = this.newest
    return html`
      <header class="wa-split wa-align-items-start">
        <div class="wa-stack wa-gap-2xs">
          <h1 class="wa-heading-l rv-page-title">Topics</h1>
          <p class="rv-page-subtitle">
            Title and colour are shared by every ranking. ${newest ? html`Ranks shown are from “${newest.name}”.` : nothing}
          </p>
        </div>
        <wa-button variant="brand" size="s" @click=${() => requestDialog(this, { kind: 'new-topic' })}>
          <wa-icon slot="start" name="plus"></wa-icon>New topic
        </wa-button>
      </header>
      ${
        this.topics.length === 0
          ? html`<div class="rv-empty wa-stack wa-gap-s wa-align-items-center">
              <wa-icon name="tags"></wa-icon>
              <p>No topics yet. Each topic needs a title and a colour; the colour follows it through every chart.</p>
            </div>`
          : html`<div class="wa-grid rv-topic-grid">
              ${repeat(
                this.topics,
                (topic) => topic._id,
                (topic) => this.renderTopic(topic),
              )}
            </div>`
      }
    `
  }

  private renderTopic(topic: TopicDoc) {
    const rank = this.rankOf(topic)
    const retired = this.newest !== undefined && rank === undefined
    return html`<wa-card class="rv-topic-card" appearance="outlined">
      <div class="wa-flank wa-gap-s wa-align-items-center">
        <span class="rv-swatch wa-font-size-xl" style=${styleMap({ '--rv-colour': topic.colour })}></span>
        <div class="wa-split wa-align-items-center wa-gap-xs">
          <div class="wa-stack wa-gap-3xs">
            <h2 class="rv-topic-title wa-body-m wa-font-weight-semibold">${topic.title}</h2>
            <span class="rv-quiet wa-caption-s">
              ${
                rank !== undefined
                  ? `Rank ${rank} of ${this.newest?.items.length ?? 0}`
                  : retired
                    ? 'Not in the newest ranking'
                    : 'Not ranked yet'
              }
            </span>
          </div>
          <div class="wa-cluster wa-gap-3xs">
            ${
              retired
                ? html`<wa-button size="s" appearance="plain" @click=${() => void this.restore(topic)}>
                    <wa-icon slot="start" name="plus"></wa-icon>Re-add
                  </wa-button>`
                : nothing
            }
            <wa-button size="s" appearance="plain" @click=${() => requestDialog(this, { kind: 'edit-topic', topic })}>
              <wa-icon name="pen" label=${`Edit ${topic.title}`}></wa-icon>
            </wa-button>
            <wa-button size="s" appearance="plain" variant="danger" @click=${() => requestDialog(this, { kind: 'delete-topic', topic })}>
              <wa-icon name="trash" label=${`Remove ${topic.title}`}></wa-icon>
            </wa-button>
          </div>
        </div>
      </div>
    </wa-card>`
  }
}

customElements.define('rv-topics-view', RvTopicsView)
