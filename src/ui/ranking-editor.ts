/**
 * `<rv-ranking-editor>`: one ranking, reordered by drag and drop (SortableJS) or with the
 * up/down buttons, with a per-ranking description under each topic.
 */
import { html, LitElement, nothing } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import Sortable from 'sortablejs'
import { type RankingDoc, shortId, type TopicDoc } from '../data/model.js'
import type { Store } from '../data/store.js'
import { attempt, requestDialog } from './events.js'
import { formatDate } from './format.js'

export class RvRankingEditor extends LitElement {
  static override properties = {
    store: { attribute: false },
    sid: { type: String },
    ranking: { attribute: false },
    topics: { attribute: false },
    rankings: { attribute: false },
    announcement: { state: true },
  }

  store: Store | undefined
  sid = ''
  ranking!: RankingDoc
  /** Every topic of the session, by short id. */
  topics: ReadonlyMap<string, TopicDoc> = new Map()
  rankings: RankingDoc[] = []
  announcement = ''

  private sortable: Sortable | undefined
  private dragAnchor: Node | null = null

  protected override createRenderRoot(): HTMLElement {
    return this
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.sortable?.destroy()
    this.sortable = undefined
  }

  protected override updated(): void {
    const list = this.querySelector<HTMLElement>('.rv-rank-list')
    if (!list) {
      this.sortable?.destroy()
      this.sortable = undefined
      return
    }
    if (this.sortable && this.sortable.el === list) return
    this.sortable?.destroy()
    this.sortable = Sortable.create(list, {
      handle: '.rv-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onStart: (event) => {
        // Lit's `repeat` brackets each item with comment markers that SortableJS never moves, so
        // the node that followed the item at drag start is still where the item belongs.
        this.dragAnchor = event.item.nextSibling
      },
      onEnd: (event) => {
        const { item, oldIndex, newIndex } = event
        // Put the DOM back the way Lit left it before the state changes; Lit then performs the
        // move itself from the new order, with its own picture of the list intact.
        list.insertBefore(item, this.dragAnchor)
        this.dragAnchor = null
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        void this.move(oldIndex, newIndex)
      },
    })
  }

  private get items() {
    return this.ranking.items
  }

  private topicOf(topicId: string): TopicDoc | undefined {
    return this.topics.get(topicId)
  }

  private async move(from: number, to: number): Promise<void> {
    if (!this.store) return
    const ids = this.items.map((item) => item.topicId)
    const [moved] = ids.splice(from, 1)
    if (moved === undefined) return
    ids.splice(to, 0, moved)
    const title = this.topicOf(moved)?.title ?? 'Topic'
    const store = this.store
    const ok = await attempt(this, () =>
      store.reorderRanking(this.sid, shortId(this.ranking._id), ids),
    )
    if (ok) this.announcement = `Moved ${title} to position ${to + 1} of ${ids.length}.`
  }

  private async saveDescription(topicId: string, value: string): Promise<void> {
    if (!this.store) return
    const current = this.items.find((item) => item.topicId === topicId)?.description ?? ''
    if (current === value) return
    const store = this.store
    await attempt(this, () =>
      store.setDescription(this.sid, shortId(this.ranking._id), topicId, value),
    )
  }

  private async addTopic(topicId: string): Promise<void> {
    if (!this.store) return
    const store = this.store
    await attempt(this, () => store.addTopicToRanking(this.sid, shortId(this.ranking._id), topicId))
  }

  /** Topics of the session that are not in this ranking: retired ones, or ones added later. */
  private get missingTopics(): TopicDoc[] {
    const present = new Set(this.items.map((item) => item.topicId))
    return [...this.topics.values()].filter((topic) => !present.has(shortId(topic._id)))
  }

  override render() {
    const ranking = this.ranking
    const isNewest = this.rankings[0]?._id === ranking._id
    const missing = this.missingTopics
    return html`
      <header class="wa-split wa-align-items-start">
        <div class="wa-stack wa-gap-2xs">
          <h1 class="wa-heading-l rv-page-title">${ranking.name}</h1>
          <p class="rv-page-subtitle">
            ${formatDate(ranking.date, { dateStyle: 'full' })}
            ${isNewest ? html`<wa-tag size="s" variant="brand" appearance="filled-outlined">newest</wa-tag>` : nothing}
            · ${this.items.length} topic${this.items.length === 1 ? '' : 's'}
          </p>
        </div>
        <div class="wa-cluster wa-gap-xs">
          ${
            missing.length > 0
              ? html`<wa-dropdown
                  @wa-select=${(e: CustomEvent<{ item: { value: string } }>) => void this.addTopic(e.detail.item.value)}
                >
                  <wa-button slot="trigger" size="s" appearance="outlined" with-caret>
                    <wa-icon slot="start" name="plus"></wa-icon>Add existing
                  </wa-button>
                  ${missing.map(
                    (topic) => html`<wa-dropdown-item value=${shortId(topic._id)}>
                      <span slot="icon" class="rv-swatch" style=${styleMap({ '--rv-colour': topic.colour })}></span>
                      ${topic.title}
                    </wa-dropdown-item>`,
                  )}
                </wa-dropdown>`
              : nothing
          }
          <wa-button size="s" variant="brand" @click=${() => requestDialog(this, { kind: 'new-topic' })}>
            <wa-icon slot="start" name="plus"></wa-icon>New topic
          </wa-button>
          <wa-dropdown placement="bottom-end" @wa-select=${(
            e: CustomEvent<{ item: { value: string } }>,
          ) => {
            if (e.detail.item.value === 'edit')
              requestDialog(this, { kind: 'edit-ranking', ranking })
            if (e.detail.item.value === 'delete')
              requestDialog(this, { kind: 'delete-ranking', ranking })
          }}>
            <wa-button slot="trigger" size="s" appearance="plain">
              <wa-icon name="ellipsis-vertical" label="Ranking actions"></wa-icon>
            </wa-button>
            <wa-dropdown-item value="edit"><wa-icon slot="icon" name="pen"></wa-icon>Rename or redate…</wa-dropdown-item>
            <wa-dropdown-item value="delete" variant="danger"><wa-icon slot="icon" name="trash"></wa-icon>Delete ranking…</wa-dropdown-item>
          </wa-dropdown>
        </div>
      </header>

      ${
        this.items.length === 0
          ? html`<div class="rv-empty wa-stack wa-gap-s wa-align-items-center">
              <wa-icon name="list-ol"></wa-icon>
              <p>Nothing ranked yet. Add a topic to start the list.</p>
            </div>`
          : html`<p class="rv-quiet wa-caption-m">
                Drag the handle, or use the arrows, to reorder. Rank 1 is the top priority. Each
                description belongs to this ranking only.
              </p>
              <ol class="rv-rank-list wa-stack wa-gap-xs" aria-label="Ranked topics">
                ${repeat(
                  this.items,
                  (item) => item.topicId,
                  (item, index) => this.renderItem(item.topicId, item.description, index),
                )}
              </ol>`
      }
      <div class="wa-visually-hidden" role="status" aria-live="polite">${this.announcement}</div>
    `
  }

  private renderItem(topicId: string, description: string, index: number) {
    const topic = this.topicOf(topicId)
    const title = topic?.title ?? 'Unknown topic'
    const last = this.items.length - 1
    return html`<li class="rv-rank-item" style=${styleMap({ '--rv-colour': topic?.colour ?? '' })} data-topic=${topicId}>
      <span class="rv-rank-number" aria-hidden="true">${index + 1}</span>
      <span class="wa-visually-hidden">Rank ${index + 1}</span>
      <wa-icon class="rv-handle" name="grip-vertical" label="Drag to reorder"></wa-icon>
      <h2 class="rv-rank-title wa-body-m">${title}</h2>
      <wa-textarea
        class="rv-rank-description"
        size="s"
        appearance="filled"
        rows="1"
        resize="auto"
        .value=${description}
        placeholder="Why it sits here…"
        @change=${(e: Event) => void this.saveDescription(topicId, (e.target as HTMLTextAreaElement).value)}
      ><span slot="label" class="wa-visually-hidden">Description of ${title} in this ranking</span></wa-textarea>
      <div class="rv-rank-actions wa-stack wa-gap-3xs">
        <wa-button size="s" appearance="plain" ?disabled=${index === 0} @click=${() => void this.move(index, index - 1)}>
          <wa-icon name="arrow-up" label=${`Move ${title} up`}></wa-icon>
        </wa-button>
        <wa-button size="s" appearance="plain" ?disabled=${index === last} @click=${() => void this.move(index, index + 1)}>
          <wa-icon name="arrow-down" label=${`Move ${title} down`}></wa-icon>
        </wa-button>
        ${
          topic
            ? html`<wa-button size="s" appearance="plain" variant="danger"
                @click=${() => requestDialog(this, { kind: 'delete-topic', topic, ranking: this.ranking })}>
                <wa-icon name="xmark" label=${`Remove ${title}`}></wa-icon>
              </wa-button>`
            : nothing
        }
      </div>
    </li>`
  }
}

customElements.define('rv-ranking-editor', RvRankingEditor)
