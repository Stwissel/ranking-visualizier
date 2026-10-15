/**
 * `<rv-ranking-editor>`: one ranking, reordered by drag and drop (SortableJS) or with the
 * up/down buttons, with a per-ranking description under each topic.
 */
import { html, LitElement, nothing } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { styleMap } from 'lit/directives/style-map.js'
import Sortable from 'sortablejs'
import { trendOf } from '../data/insights.js'
import {
  compareRankings,
  type RankingDoc,
  type RankingItem,
  shortId,
  type Tier,
  type TopicDoc,
} from '../data/model.js'
import './change-summary.js'
import type { Store } from '../data/store.js'
import { attempt, offerUndo, requestDialog } from './events.js'
import { formatDate } from './format.js'
import { trendTag } from './trend.js'

export class RvRankingEditor extends LitElement {
  static override properties = {
    store: { attribute: false },
    sid: { type: String },
    ranking: { attribute: false },
    topics: { attribute: false },
    rankings: { attribute: false },
    announcement: { state: true },
    pending: { state: true },
  }

  store: Store | undefined
  sid = ''
  ranking!: RankingDoc
  /** Every topic of the session, by short id. */
  topics: ReadonlyMap<string, TopicDoc> = new Map()
  rankings: RankingDoc[] = []
  announcement = ''
  /**
   * True from the start of a move until the parent hands back the ranking that contains it.
   * A second move read from the old order would silently undo the first, so the controls wait.
   */
  pending = false

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

  protected override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('ranking')) this.pending = false
    this.sortable?.option('disabled', this.pending)
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
      // Tier dividers stay where they are; items are dropped between them.
      filter: '.rv-tier',
      preventOnFilter: false,
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
        // Read the dropped order, with the tier each item now sits under, before putting the DOM
        // back the way Lit left it; Lit then performs the move itself from the new data, with
        // its own picture of the list intact.
        const placement = readPlacement(list)
        list.insertBefore(item, this.dragAnchor)
        this.dragAnchor = null
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        const movedId = item.dataset.topic
        if (movedId) void this.place(placement, movedId)
      },
    })
  }

  private get items() {
    return this.ranking.items
  }

  private topicOf(topicId: string): TopicDoc | undefined {
    return this.topics.get(topicId)
  }

  /**
   * Moves the item at `from` (an index into `items`) to `to`. With tiers, the item takes the
   * tier of the item it displaces, so an arrow press at a tier's edge crosses into the next one.
   */
  private async move(from: number, to: number): Promise<void> {
    const items = this.items
    const moved = items[from]
    const displaced = items[to]
    if (!moved || !displaced) return
    const ids = items.map((item) => item.topicId)
    ids.splice(from, 1)
    ids.splice(to, 0, moved.topicId)
    const tiers = this.hasTiers ? { [moved.topicId]: displaced.tierId } : undefined
    await this.place({ ids, tiers }, moved.topicId)
  }

  /** Writes a new order (and tiers) and announces where the moved topic ended up. */
  private async place(placement: Placement, movedId: string): Promise<void> {
    if (!this.store || this.pending) return
    this.pending = true
    const title = this.topicOf(movedId)?.title ?? 'Topic'
    const store = this.store
    const position = placement.ids.indexOf(movedId) + 1
    const tier = placement.tiers?.[movedId]
    const tierName = tier ? this.tierById(tier)?.name : undefined
    const ok = await attempt(this, async () => {
      const { undo } = await store.undoable(this.sid, () =>
        store.reorderRanking(this.sid, shortId(this.ranking._id), placement.ids, placement.tiers),
      )
      offerUndo(this, { message: `Moved ${title} to #${position}`, undo })
    })
    if (ok) {
      this.announcement = `Moved ${title} to position ${position} of ${placement.ids.length}${
        tierName ? `, in ${tierName}` : ''
      }.`
    } else this.pending = false
  }

  private get hasTiers(): boolean {
    return (this.ranking.tiers?.length ?? 0) > 0
  }

  private tierById(id: string): Tier | undefined {
    return this.ranking.tiers?.find((tier) => tier.id === id)
  }

  /** The list as rendered: a divider before each tier's run of items. */
  private get entries(): Entry[] {
    const items = this.items
    if (!this.hasTiers) return items.map((item, index) => ({ kind: 'item', item, index }))
    const entries: Entry[] = []
    let index = 0
    for (const tier of this.ranking.tiers ?? []) {
      entries.push({ kind: 'tier', tier })
      for (const item of items) {
        if (item.tierId === tier.id) entries.push({ kind: 'item', item, index: index++ })
      }
    }
    return entries
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

  /** The session's rankings oldest first, for trends. */
  private get chronological(): RankingDoc[] {
    return [...this.rankings].sort(compareRankings)
  }

  /** The ranking just before this one in time, if any. */
  private get previous(): RankingDoc | undefined {
    const ordered = this.chronological
    const index = ordered.findIndex((candidate) => candidate._id === this.ranking._id)
    return index > 0 ? ordered[index - 1] : undefined
  }

  override render() {
    const ranking = this.ranking
    const isNewest = this.rankings[0]?._id === ranking._id
    const missing = this.missingTopics
    const previous = this.previous
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
          ${
            this.items.length > 0
              ? html`<wa-button size="s" appearance="outlined" @click=${() => requestDialog(this, { kind: 'new-tier', ranking })}>
                  <wa-icon slot="start" name="layer-group"></wa-icon>Add tier
                </wa-button>`
              : nothing
          }
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
        previous
          ? html`<rv-change-summary .previous=${previous} .current=${ranking} .topics=${this.topics}></rv-change-summary>`
          : nothing
      }
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
                  this.entries,
                  (entry) => (entry.kind === 'tier' ? `tier:${entry.tier.id}` : entry.item.topicId),
                  (entry) =>
                    entry.kind === 'tier'
                      ? this.renderTier(entry.tier)
                      : this.renderItem(entry.item.topicId, entry.item.description, entry.index),
                )}
              </ol>`
      }
      <div class="wa-visually-hidden" role="status" aria-live="polite">${this.announcement}</div>
    `
  }

  private renderTier(tier: Tier) {
    const count = this.items.filter((item) => item.tierId === tier.id).length
    return html`<li class="rv-tier wa-split wa-align-items-center" data-tier=${tier.id}>
      <h3 class="rv-tier-name wa-cluster wa-gap-xs">
        ${tier.name}
        <span class="rv-quiet wa-caption-s">${count === 0 ? 'empty, drop a topic here' : `${count} topic${count === 1 ? '' : 's'}`}</span>
      </h3>
      <span class="wa-cluster wa-gap-3xs">
        <wa-button size="s" appearance="plain" @click=${() => requestDialog(this, { kind: 'rename-tier', ranking: this.ranking, tier })}>
          <wa-icon name="pen" label=${`Rename tier ${tier.name}`}></wa-icon>
        </wa-button>
        <wa-button size="s" appearance="plain" @click=${() => requestDialog(this, { kind: 'remove-tier', ranking: this.ranking, tier })}>
          <wa-icon name="xmark" label=${`Remove tier ${tier.name}`}></wa-icon>
        </wa-button>
      </span>
    </li>`
  }

  private renderItem(topicId: string, description: string, index: number) {
    const topic = this.topicOf(topicId)
    const title = topic?.title ?? 'Unknown topic'
    const last = this.items.length - 1
    return html`<li class="rv-rank-item" style=${styleMap({ '--rv-colour': topic?.colour ?? '' })} data-topic=${topicId}>
      <span class="rv-rank-number" aria-hidden="true">${index + 1}</span>
      <span class="wa-visually-hidden">Rank ${index + 1}</span>
      <wa-icon class="rv-handle" name="grip-vertical" label="Drag to reorder"></wa-icon>
      <h2 class="rv-rank-title wa-body-m wa-cluster wa-gap-xs">${title}${trendTag(trendOf(topicId, this.chronological))}</h2>
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
        <wa-button size="s" appearance="plain" ?disabled=${index === 0 || this.pending} @click=${() => void this.move(index, index - 1)}>
          <wa-icon name="arrow-up" label=${`Move ${title} up`}></wa-icon>
        </wa-button>
        <wa-button size="s" appearance="plain" ?disabled=${index === last || this.pending} @click=${() => void this.move(index, index + 1)}>
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

/** What the user asked for: an order, and with tiers the tier of the topics that changed one. */
interface Placement {
  ids: string[]
  tiers?: Record<string, string | undefined>
}

type Entry = { kind: 'tier'; tier: Tier } | { kind: 'item'; item: RankingItem; index: number }

/** The order in the DOM right after a drop, each item under the divider above it. */
function readPlacement(list: HTMLElement): Placement {
  const ids: string[] = []
  const tiers: Record<string, string | undefined> = {}
  let current: string | undefined
  let sawTier = false
  for (const child of list.children) {
    const element = child as HTMLElement
    if (element.classList.contains('rv-tier')) {
      current = element.dataset.tier
      sawTier = true
    } else if (element.dataset.topic) {
      ids.push(element.dataset.topic)
      tiers[element.dataset.topic] = current
    }
  }
  return sawTier ? { ids, tiers } : { ids }
}

customElements.define('rv-ranking-editor', RvRankingEditor)
