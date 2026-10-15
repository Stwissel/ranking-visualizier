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
  ids,
  isHexColour,
  isIsoDate,
  newId,
  type RankingDoc,
  type RankingId,
  type SessionDoc,
  type SessionId,
  shortId,
  type TopicDoc,
  type TopicId,
} from './model.js'

export type Database = PouchDB.Database<AnyDoc>

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

function requireDate(value: string): string {
  if (!isIsoDate(value)) throw new ValidationError(`Date must be YYYY-MM-DD, got "${value}"`)
  return value
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
    await this.db.bulkDocs(docs.map((doc) => ({ ...doc, _deleted: true })))
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
   * Creates a topic and appends it to the newest ranking, if there is one. Older rankings are
   * left as they were: a topic that did not exist then was not ranked then.
   */
  async createTopic(
    sid: SessionId,
    input: { title: string; colour: string; description?: string },
  ): Promise<TopicDoc> {
    await this.getSession(sid)
    const doc: TopicDoc = {
      _id: ids.topic(sid, this.idGenerator()),
      type: 'topic',
      sessionId: sid,
      title: requireText(input.title, 'Topic title'),
      colour: requireColour(input.colour),
    }
    await this.db.put(doc)
    const newest = await this.newestRanking(sid)
    if (newest) {
      newest.items.push({ topicId: shortId(doc._id), description: input.description ?? '' })
      await this.db.put(newest)
    }
    return this.get<TopicDoc>(doc._id)
  }

  async updateTopic(
    sid: SessionId,
    tid: TopicId,
    patch: Partial<Pick<TopicDoc, 'title' | 'colour'>>,
  ): Promise<TopicDoc> {
    const doc = await this.getTopic(sid, tid)
    if (patch.title !== undefined) doc.title = requireText(patch.title, 'Topic title')
    if (patch.colour !== undefined) doc.colour = requireColour(patch.colour)
    await this.db.put(doc)
    return this.getTopic(sid, tid)
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
    if (touched.length > 0) await this.db.bulkDocs(touched)
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
    await this.db.bulkDocs([...rankings, { ...topic, _deleted: true }])
  }

  /** Re-adds a topic (typically a retired one) at the bottom of a ranking. */
  async addTopicToRanking(sid: SessionId, rid: RankingId, tid: TopicId): Promise<RankingDoc> {
    await this.getTopic(sid, tid)
    const ranking = await this.getRanking(sid, rid)
    if (!ranking.items.some((item) => item.topicId === tid)) {
      ranking.items.push({ topicId: tid, description: '' })
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
   * title order with an empty description.
   */
  async createRanking(sid: SessionId, input: { name: string; date: string }): Promise<RankingDoc> {
    await this.getSession(sid)
    const previous = await this.newestRanking(sid)
    const items = previous
      ? previous.items.map((item) => ({ ...item }))
      : (await this.listTopics(sid)).map((topic) => ({
          topicId: shortId(topic._id),
          description: '',
        }))
    const doc: RankingDoc = {
      _id: ids.ranking(sid, this.idGenerator()),
      type: 'ranking',
      sessionId: sid,
      name: requireText(input.name, 'Ranking name'),
      date: requireDate(input.date),
      createdAt: this.clock(),
      items,
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
   * Sets the order. `topicIds` must be a permutation of the ranking's current topics; anything
   * else means the caller's view of the ranking is stale and the write is refused.
   */
  async reorderRanking(
    sid: SessionId,
    rid: RankingId,
    topicIds: readonly TopicId[],
  ): Promise<RankingDoc> {
    const doc = await this.getRanking(sid, rid)
    const current = new Map(doc.items.map((item) => [item.topicId, item]))
    if (topicIds.length !== current.size || new Set(topicIds).size !== topicIds.length) {
      throw new ValidationError('New order must contain each topic of the ranking exactly once')
    }
    const items = topicIds.map((topicId) => {
      const item = current.get(topicId)
      if (!item) throw new ValidationError(`Topic ${topicId} is not in this ranking`)
      return item
    })
    doc.items = items
    await this.db.put(doc)
    return this.getRanking(sid, rid)
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
