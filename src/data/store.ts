/**
 * Everything the application does to its documents.
 *
 * Takes a database instance rather than constructing one: `pouchdb-browser` cannot be imported
 * in Node, and the tests run this class against `pouchdb-core` with the memory adapter.
 *
 * @module
 */
import {
  type AnyDoc,
  compareRankings,
  DEFAULT_COLOURS,
  ids,
  isHexColour,
  isIsoDate,
  newId,
  type RankingDoc,
  type RankingId,
  type RankingItem,
  type SessionDoc,
  type SessionId,
  shortId,
  type Tier,
  type TopicDoc,
  type TopicId,
} from './model.js'

export type Database = PouchDB.Database<AnyDoc>

/** Puts things back the way they were before an action. */
export type Undo = () => Promise<void>

/** Equal apart from the revision. */
function sameContent(a: AnyDoc, b: AnyDoc): boolean {
  const { _rev: ra, ...ca } = a
  const { _rev: rb, ...cb } = b
  return JSON.stringify(ca) === JSON.stringify(cb)
}

export interface StoreOptions {
  /** Injected so tests get stable timestamps. */
  clock?: () => string
  idGenerator?: () => string
}

export class NotFoundError extends Error {
  constructor(id: string) {
    super(`No document ${id}`)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

function requireText(value: string, what: string): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new ValidationError(`${what} must not be empty`)
  return trimmed
}

function requireColour(value: string): string {
  if (!isHexColour(value)) throw new ValidationError(`Colour must be #rrggbb, got "${value}"`)
  return value.toLowerCase()
}

/** `bulkDocs` is not transactional: a failed document is an error entry, not a rejection. */
export function requireAllWritten(
  responses: (PouchDB.Core.Response | PouchDB.Core.Error)[],
  what: string,
): void {
  const failed = responses.filter((response) => 'error' in response && response.error)
  if (failed.length > 0) throw new Error(`Could not write ${failed.length} document(s) ${what}`)
}

function requireDate(value: string): string {
  if (!isIsoDate(value)) throw new ValidationError(`Date must be YYYY-MM-DD, got "${value}"`)
  return value
}

/**
 * Items regrouped so each tier's run is contiguous in tier order, relative order kept. With
 * tiers present, an item without a valid tier is a caller error; it is put in the first tier
 * rather than refused, since the list must stay whole.
 */
export function groupByTier(
  items: readonly RankingItem[],
  tiers: readonly Tier[] | undefined,
): RankingItem[] {
  if (!tiers?.length) return items.map(({ tierId: _, ...item }) => item)
  const valid = new Set(tiers.map((tier) => tier.id))
  const first = tiers[0]!.id
  const normalised = items.map((item) =>
    item.tierId && valid.has(item.tierId) ? item : { ...item, tierId: first },
  )
  return tiers.flatMap((tier) => normalised.filter((item) => item.tierId === tier.id))
}

/** The tier a newly placed item joins: the last one, when the ranking has tiers. */
function lastTierOf(ranking: RankingDoc): string | undefined {
  return ranking.tiers?.at(-1)?.id
}

export class Store {
  private readonly clock: () => string
  private readonly idGenerator: () => string

  constructor(
    readonly db: Database,
    options: StoreOptions = {},
  ) {
    this.clock = options.clock ?? (() => new Date().toISOString())
    this.idGenerator = options.idGenerator ?? newId
  }

  // ---- sessions -------------------------------------------------------------------------

  async listSessions(): Promise<SessionDoc[]> {
    const result = await this.db.allDocs({
      include_docs: true,
      startkey: 'session:',
      endkey: 'session:￰',
    })
    return result.rows
      .map((row) => row.doc as SessionDoc)
      .sort((a, b) => a.name.localeCompare(b.name) || a.createdAt.localeCompare(b.createdAt))
  }

  async getSession(sid: SessionId): Promise<SessionDoc> {
    return this.get<SessionDoc>(ids.session(sid))
  }

  async createSession(name: string): Promise<SessionDoc> {
    const doc: SessionDoc = {
      _id: ids.session(this.idGenerator()),
      type: 'session',
      name: requireText(name, 'Session name'),
      createdAt: this.clock(),
    }
    await this.db.put(doc)
    return this.get<SessionDoc>(doc._id)
  }

  async renameSession(sid: SessionId, name: string): Promise<SessionDoc> {
    const doc = await this.getSession(sid)
    doc.name = requireText(name, 'Session name')
    await this.db.put(doc)
    return this.getSession(sid)
  }

  /** Removes the session and every topic and ranking in it. */
  async deleteSession(sid: SessionId): Promise<void> {
    const docs = await this.sessionDocuments(sid)
    const responses = await this.db.bulkDocs(docs.map((doc) => ({ ...doc, _deleted: true })))
    requireAllWritten(responses, `while deleting session ${sid}`)
  }

  /** Every document belonging to a session: the session itself, its topics and its rankings. */
  async sessionDocuments(sid: SessionId): Promise<AnyDoc[]> {
    const session = await this.db.get(ids.session(sid)).catch(() => undefined)
    const [topics, rankings] = await Promise.all([this.listTopics(sid), this.listRankings(sid)])
    return [...(session ? [session as SessionDoc] : []), ...topics, ...rankings]
  }

  // ---- topics ---------------------------------------------------------------------------

  async listTopics(sid: SessionId): Promise<TopicDoc[]> {
    const result = await this.db.allDocs({ include_docs: true, ...ids.range('topic', sid) })
    return result.rows
      .map((row) => row.doc as TopicDoc)
      .sort((a, b) => a.title.localeCompare(b.title))
  }

  async getTopic(sid: SessionId, tid: TopicId): Promise<TopicDoc> {
    return this.get<TopicDoc>(ids.topic(sid, tid))
  }

  /**
   * Creates a topic and appends it to the newest ranking, if there is one, with the given
   * description. Older rankings are left as they were: a topic that did not exist then was not
   * ranked then. The description stays on the topic too, for its first ranking if none exists yet.
   */
  async createTopic(
    sid: SessionId,
    input: { title: string; colour: string; description?: string },
  ): Promise<TopicDoc> {
    await this.getSession(sid)
    const description = input.description?.trim() ?? ''
    const doc: TopicDoc = {
      _id: ids.topic(sid, this.idGenerator()),
      type: 'topic',
      sessionId: sid,
      title: requireText(input.title, 'Topic title'),
      colour: requireColour(input.colour),
      description,
    }
    await this.db.put(doc)
    const newest = await this.newestRanking(sid)
    if (newest) {
      const tierId = lastTierOf(newest)
      newest.items.push({ topicId: shortId(doc._id), description, ...(tierId ? { tierId } : {}) })
      await this.db.put(newest)
    }
    return this.get<TopicDoc>(doc._id)
  }

  /**
   * Creates several topics at once. Colours come from `DEFAULT_COLOURS`, skipping the ones the
   * session already uses, then cycling. A title that already exists in the session, or appears
   * twice in the input (case-insensitively), is refused before anything is written.
   */
  async createTopics(
    sid: SessionId,
    inputs: readonly { title: string; description?: string }[],
  ): Promise<TopicDoc[]> {
    await this.getSession(sid)
    const existing = await this.listTopics(sid)
    const taken = new Set(existing.map((topic) => topic.title.trim().toLowerCase()))
    const seen = new Set<string>()
    const duplicates: string[] = []
    const titles = inputs.map((input) => requireText(input.title, 'Topic title'))
    for (const title of titles) {
      const key = title.toLowerCase()
      if (taken.has(key) || seen.has(key)) duplicates.push(title)
      seen.add(key)
    }
    if (duplicates.length > 0) {
      throw new ValidationError(
        `Already in this session or listed twice: ${[...new Set(duplicates)].join(', ')}`,
      )
    }
    const used = new Set(existing.map((topic) => topic.colour))
    const palette = DEFAULT_COLOURS.filter((colour) => !used.has(colour))
    const colours = palette.length > 0 ? palette : [...DEFAULT_COLOURS]
    const docs: TopicDoc[] = titles.map((title, index) => ({
      _id: ids.topic(sid, this.idGenerator()),
      type: 'topic',
      sessionId: sid,
      title,
      colour: colours[index % colours.length]!,
      description: inputs[index]?.description?.trim() ?? '',
    }))
    requireAllWritten(await this.db.bulkDocs(docs), `while creating ${docs.length} topics`)
    const newest = await this.newestRanking(sid)
    if (newest) {
      const tierId = lastTierOf(newest)
      for (const doc of docs) {
        newest.items.push({
          topicId: shortId(doc._id),
          description: doc.description ?? '',
          ...(tierId ? { tierId } : {}),
        })
      }
      await this.db.put(newest)
    }
    const written = await this.db.allDocs({ include_docs: true, keys: docs.map((doc) => doc._id) })
    return written.rows
      .map((row) => ('doc' in row ? (row.doc as TopicDoc) : undefined))
      .filter((doc): doc is TopicDoc => doc !== undefined)
  }

  async updateTopic(
    sid: SessionId,
    tid: TopicId,
    patch: Partial<Pick<TopicDoc, 'title' | 'colour' | 'description'>>,
  ): Promise<TopicDoc> {
    const doc = await this.getTopic(sid, tid)
    if (patch.title !== undefined) doc.title = requireText(patch.title, 'Topic title')
    if (patch.colour !== undefined) doc.colour = requireColour(patch.colour)
    if (patch.description !== undefined) doc.description = patch.description.trim()
    await this.db.put(doc)
    return this.getTopic(sid, tid)
  }

  /**
   * The description a topic should enter a ranking with: the one it had in the most recent
   * ranking that contained it, else the topic's own, else nothing. Descriptions are carried
   * forward, never invented.
   */
  private async carriedDescription(
    sid: SessionId,
    topic: TopicDoc,
    rankings?: RankingDoc[],
  ): Promise<string> {
    const tid = shortId(topic._id)
    for (const ranking of rankings ?? (await this.listRankings(sid))) {
      const item = ranking.items.find((candidate) => candidate.topicId === tid)
      if (item) return item.description
    }
    return topic.description ?? ''
  }

  /**
   * Removes the topic from the given ranking and from every later one (see `compareRankings`),
   * keeping earlier rankings and the topic document itself, so history still renders.
   * Without `fromRankingId` the newest ranking is the starting point.
   */
  async retireTopic(sid: SessionId, tid: TopicId, fromRankingId?: RankingId): Promise<void> {
    await this.getTopic(sid, tid)
    const rankings = (await this.listRankings(sid)).sort(compareRankings)
    const startIndex =
      fromRankingId === undefined
        ? rankings.length - 1
        : rankings.findIndex((ranking) => shortId(ranking._id) === fromRankingId)
    if (startIndex === -1) throw new NotFoundError(ids.ranking(sid, fromRankingId ?? ''))
    const touched = rankings
      .slice(Math.max(startIndex, 0))
      .filter((ranking) => ranking.items.some((item) => item.topicId === tid))
      .map((ranking) => ({
        ...ranking,
        items: ranking.items.filter((item) => item.topicId !== tid),
      }))
    if (touched.length > 0) {
      requireAllWritten(await this.db.bulkDocs(touched), `while retiring topic ${tid}`)
    }
  }

  /** Removes the topic document and its item from every ranking. */
  async deleteTopic(sid: SessionId, tid: TopicId): Promise<void> {
    const topic = await this.getTopic(sid, tid)
    const rankings = (await this.listRankings(sid))
      .filter((ranking) => ranking.items.some((item) => item.topicId === tid))
      .map((ranking) => ({
        ...ranking,
        items: ranking.items.filter((item) => item.topicId !== tid),
      }))
    requireAllWritten(
      await this.db.bulkDocs([...rankings, { ...topic, _deleted: true }]),
      `while deleting topic ${tid}`,
    )
  }

  /**
   * Re-adds a topic (typically a retired one) at the bottom of a ranking, with the description
   * it last had.
   */
  async addTopicToRanking(sid: SessionId, rid: RankingId, tid: TopicId): Promise<RankingDoc> {
    const topic = await this.getTopic(sid, tid)
    const ranking = await this.getRanking(sid, rid)
    if (!ranking.items.some((item) => item.topicId === tid)) {
      const tierId = lastTierOf(ranking)
      ranking.items.push({
        topicId: tid,
        description: await this.carriedDescription(sid, topic),
        ...(tierId ? { tierId } : {}),
      })
      await this.db.put(ranking)
    }
    return this.getRanking(sid, rid)
  }

  // ---- rankings -------------------------------------------------------------------------

  /** Newest first. */
  async listRankings(sid: SessionId): Promise<RankingDoc[]> {
    const result = await this.db.allDocs({ include_docs: true, ...ids.range('ranking', sid) })
    return result.rows.map((row) => row.doc as RankingDoc).sort((a, b) => compareRankings(b, a))
  }

  async getRanking(sid: SessionId, rid: RankingId): Promise<RankingDoc> {
    return this.get<RankingDoc>(ids.ranking(sid, rid))
  }

  async newestRanking(sid: SessionId): Promise<RankingDoc | undefined> {
    return (await this.listRankings(sid))[0]
  }

  /**
   * A new ranking starts as a copy of the newest one — same order, same descriptions — so the
   * user only has to express what changed. Without a predecessor, every topic is listed in
   * title order with the description it was created with.
   */
  async createRanking(sid: SessionId, input: { name: string; date: string }): Promise<RankingDoc> {
    await this.getSession(sid)
    const previous = await this.newestRanking(sid)
    const items = previous
      ? previous.items.map((item) => ({ ...item }))
      : (await this.listTopics(sid)).map((topic) => ({
          topicId: shortId(topic._id),
          description: topic.description ?? '',
        }))
    const doc: RankingDoc = {
      _id: ids.ranking(sid, this.idGenerator()),
      type: 'ranking',
      sessionId: sid,
      name: requireText(input.name, 'Ranking name'),
      date: requireDate(input.date),
      createdAt: this.clock(),
      items,
      ...(previous?.tiers?.length ? { tiers: previous.tiers.map((tier) => ({ ...tier })) } : {}),
    }
    await this.db.put(doc)
    return this.get<RankingDoc>(doc._id)
  }

  async updateRanking(
    sid: SessionId,
    rid: RankingId,
    patch: Partial<Pick<RankingDoc, 'name' | 'date'>>,
  ): Promise<RankingDoc> {
    const doc = await this.getRanking(sid, rid)
    if (patch.name !== undefined) doc.name = requireText(patch.name, 'Ranking name')
    if (patch.date !== undefined) doc.date = requireDate(patch.date)
    await this.db.put(doc)
    return this.getRanking(sid, rid)
  }

  /**
   * Sets the order, and with `tiers` the tier of each topic. `topicIds` must be a permutation
   * of the ranking's current topics; anything else means the caller's view of the ranking is
   * stale and the write is refused. When the ranking has tiers, the items are regrouped so each
   * tier's items are contiguous in tier order, keeping the relative order given.
   */
  async reorderRanking(
    sid: SessionId,
    rid: RankingId,
    topicIds: readonly TopicId[],
    tiers?: Readonly<Record<TopicId, string | undefined>>,
  ): Promise<RankingDoc> {
    const doc = await this.getRanking(sid, rid)
    const current = new Map(doc.items.map((item) => [item.topicId, item]))
    if (topicIds.length !== current.size || new Set(topicIds).size !== topicIds.length) {
      throw new ValidationError('New order must contain each topic of the ranking exactly once')
    }
    const items = topicIds.map((topicId) => {
      const item = current.get(topicId)
      if (!item) throw new ValidationError(`Topic ${topicId} is not in this ranking`)
      return tiers && topicId in tiers ? { ...item, tierId: tiers[topicId] } : item
    })
    doc.items = groupByTier(items, doc.tiers)
    await this.db.put(doc)
    return this.getRanking(sid, rid)
  }

  // ---- tiers ----------------------------------------------------------------------------

  /**
   * Appends a tier at the bottom. The first tier of a ranking takes every item, so the list
   * stays whole; later tiers start empty.
   */
  async addTier(sid: SessionId, rid: RankingId, name: string): Promise<Tier> {
    const doc = await this.getRanking(sid, rid)
    const tier: Tier = { id: this.idGenerator(), name: requireText(name, 'Tier name') }
    const first = !doc.tiers?.length
    doc.tiers = [...(doc.tiers ?? []), tier]
    if (first) doc.items = doc.items.map((item) => ({ ...item, tierId: tier.id }))
    await this.db.put(doc)
    return tier
  }

  async renameTier(sid: SessionId, rid: RankingId, tierId: string, name: string): Promise<void> {
    const doc = await this.getRanking(sid, rid)
    const tier = doc.tiers?.find((candidate) => candidate.id === tierId)
    if (!tier) throw new NotFoundError(`${doc._id}#tier:${tierId}`)
    tier.name = requireText(name, 'Tier name')
    await this.db.put(doc)
  }

  /**
   * Removes a tier. Its items join the tier above it, or the one below when it was the first;
   * removing the last remaining tier leaves the ranking without tiers.
   */
  async removeTier(sid: SessionId, rid: RankingId, tierId: string): Promise<void> {
    const doc = await this.getRanking(sid, rid)
    const tiers = doc.tiers ?? []
    const index = tiers.findIndex((tier) => tier.id === tierId)
    if (index === -1) throw new NotFoundError(`${doc._id}#tier:${tierId}`)
    const remaining = tiers.filter((tier) => tier.id !== tierId)
    const heir = remaining[Math.max(index - 1, 0)]
    doc.items = doc.items.map((item) =>
      item.tierId === tierId ? { ...item, tierId: heir?.id } : item,
    )
    if (remaining.length === 0) {
      doc.items = doc.items.map(({ tierId: _, ...item }) => item)
      delete doc.tiers
    } else {
      doc.tiers = remaining
      doc.items = groupByTier(doc.items, remaining)
    }
    await this.db.put(doc)
  }

  async setDescription(
    sid: SessionId,
    rid: RankingId,
    tid: TopicId,
    description: string,
  ): Promise<RankingDoc> {
    const doc = await this.getRanking(sid, rid)
    const item = doc.items.find((candidate) => candidate.topicId === tid)
    if (!item) throw new NotFoundError(`${doc._id}#${tid}`)
    item.description = description
    await this.db.put(doc)
    return this.getRanking(sid, rid)
  }

  async deleteRanking(sid: SessionId, rid: RankingId): Promise<void> {
    const doc = await this.getRanking(sid, rid)
    await this.db.remove(doc._id, doc._rev!)
  }

  // ---- undo -----------------------------------------------------------------------------

  /**
   * Runs `action` and returns, with its result, a function that puts the session's documents
   * back the way they were before it. The whole session is snapshotted: it is tens of
   * documents, and knowing exactly which ones an action touches is a maintenance burden the
   * size of the data does not justify. Restoring writes only what differs, so an undo of a
   * reorder is one write, and documents the action deleted come back under fresh revisions.
   */
  async undoable<T>(sid: SessionId, action: () => Promise<T>): Promise<{ result: T; undo: Undo }> {
    const before = new Map((await this.sessionDocuments(sid)).map((doc) => [doc._id, doc]))
    const result = await action()
    const undo: Undo = async () => {
      const now = new Map((await this.sessionDocuments(sid)).map((doc) => [doc._id, doc]))
      const writes: PouchDB.Core.PutDocument<AnyDoc>[] = []
      for (const [id, doc] of before) {
        const current = now.get(id)
        if (current && sameContent(current, doc)) continue
        const { _rev: _, ...content } = doc
        writes.push(current ? { ...content, _rev: current._rev } : content)
      }
      for (const [id, doc] of now) {
        if (!before.has(id)) writes.push({ ...doc, _deleted: true })
      }
      if (writes.length > 0) requireAllWritten(await this.db.bulkDocs(writes), 'while undoing')
    }
    return { result, undo }
  }

  // ---- changes --------------------------------------------------------------------------

  /**
   * Calls `listener` on every change from now on, local or replicated. Returns the unsubscribe
   * function. Views reload their slice on each call: the data set is tens of documents.
   */
  subscribe(listener: (change: PouchDB.Core.ChangesResponseChange<AnyDoc>) => void): () => void {
    const feed = this.db.changes({ live: true, since: 'now', include_docs: true })
    feed.on('change', listener)
    return () => feed.cancel()
  }

  // ---- helpers --------------------------------------------------------------------------

  private async get<T extends AnyDoc>(id: string): Promise<T> {
    try {
      return (await this.db.get(id)) as T
    } catch (error) {
      if ((error as { status?: number }).status === 404) throw new NotFoundError(id)
      throw error
    }
  }
}
