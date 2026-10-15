/**
 * Export and import as JSON.
 *
 * The file is the documents themselves, minus `_rev`, grouped by session. Revisions are a
 * property of a database, not of the data, and carrying them across would make an import
 * conflict with whatever the target database already holds.
 *
 * @module
 */
import {
  type AnyDoc,
  ids,
  isHexColour,
  isIsoDate,
  newId,
  type RankingDoc,
  type SessionDoc,
  type SessionId,
  shortId,
  type TopicDoc,
} from './model.js'
import { requireAllWritten, type Store } from './store.js'

export const EXPORT_FORMAT = 'ranking-visualizier'
export const EXPORT_VERSION = 1

export interface ExportedSession {
  session: Omit<SessionDoc, '_rev'>
  topics: Omit<TopicDoc, '_rev'>[]
  rankings: Omit<RankingDoc, '_rev'>[]
}

export interface ExportFile {
  format: typeof EXPORT_FORMAT
  version: typeof EXPORT_VERSION
  exportedAt: string
  sessions: ExportedSession[]
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

function stripRev<T extends { _rev?: string }>(doc: T): Omit<T, '_rev'> {
  const { _rev, ...rest } = doc
  return rest
}

/** All sessions, or only the ones named. */
export async function exportSessions(
  store: Store,
  sessionIds?: readonly SessionId[],
  now: () => string = () => new Date().toISOString(),
): Promise<ExportFile> {
  const sessions = await store.listSessions()
  const wanted = sessionIds
    ? sessions.filter((session) => sessionIds.includes(shortId(session._id)))
    : sessions
  const exported = await Promise.all(
    wanted.map(async (session): Promise<ExportedSession> => {
      const sid = shortId(session._id)
      const [topics, rankings] = await Promise.all([store.listTopics(sid), store.listRankings(sid)])
      return {
        session: stripRev(session),
        topics: topics.map(stripRev),
        rankings: rankings.map(stripRev),
      }
    }),
  )
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now(), sessions: exported }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ImportError(message)
}

/** Parses and validates the text of an export file. Throws `ImportError` with a plain reason. */
export function parseExport(text: string): ExportFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ImportError('The file is not valid JSON')
  }
  expect(isRecord(raw), 'The file is not a ranking-visualizier export')
  expect(raw.format === EXPORT_FORMAT, 'The file is not a ranking-visualizier export')
  expect(raw.version === EXPORT_VERSION, `Unsupported export version ${String(raw.version)}`)
  expect(Array.isArray(raw.sessions), 'The export has no sessions array')

  const sessions = raw.sessions.map((entry, index): ExportedSession => {
    const where = `sessions[${index}]`
    expect(isRecord(entry) && isRecord(entry.session), `${where}.session is missing`)
    const session = entry.session
    expect(
      typeof session._id === 'string' && session._id.startsWith('session:'),
      `${where}.session._id is invalid`,
    )
    expect(
      typeof session.name === 'string' && session.name.trim() !== '',
      `${where}.session.name is missing`,
    )
    const sid = shortId(session._id)
    expect(Array.isArray(entry.topics), `${where}.topics is missing`)
    expect(Array.isArray(entry.rankings), `${where}.rankings is missing`)

    const topics = entry.topics.map((topic, topicIndex): Omit<TopicDoc, '_rev'> => {
      const at = `${where}.topics[${topicIndex}]`
      expect(isRecord(topic), `${at} is not an object`)
      expect(
        typeof topic._id === 'string' && topic._id.startsWith(`topic:${sid}:`),
        `${at}._id is invalid`,
      )
      expect(typeof topic.title === 'string' && topic.title.trim() !== '', `${at}.title is missing`)
      expect(isHexColour(topic.colour), `${at}.colour is not #rrggbb`)
      return {
        _id: topic._id,
        type: 'topic',
        sessionId: sid,
        title: topic.title,
        colour: topic.colour.toLowerCase(),
        ...(typeof topic.description === 'string' ? { description: topic.description } : {}),
      }
    })
    const topicIds = new Set(topics.map((topic) => shortId(topic._id)))

    const rankings = entry.rankings.map((ranking, rankingIndex): Omit<RankingDoc, '_rev'> => {
      const at = `${where}.rankings[${rankingIndex}]`
      expect(isRecord(ranking), `${at} is not an object`)
      expect(
        typeof ranking._id === 'string' && ranking._id.startsWith(`ranking:${sid}:`),
        `${at}._id is invalid`,
      )
      expect(
        typeof ranking.name === 'string' && ranking.name.trim() !== '',
        `${at}.name is missing`,
      )
      expect(isIsoDate(ranking.date), `${at}.date is not YYYY-MM-DD`)
      expect(Array.isArray(ranking.items), `${at}.items is missing`)
      const items = ranking.items.map((item, itemIndex) => {
        expect(
          isRecord(item) && typeof item.topicId === 'string',
          `${at}.items[${itemIndex}] is invalid`,
        )
        expect(topicIds.has(item.topicId), `${at}.items[${itemIndex}] names an unknown topic`)
        return {
          topicId: item.topicId,
          description: typeof item.description === 'string' ? item.description : '',
        }
      })
      return {
        _id: ranking._id,
        type: 'ranking',
        sessionId: sid,
        name: ranking.name,
        date: ranking.date,
        createdAt: typeof ranking.createdAt === 'string' ? ranking.createdAt : '',
        items,
      }
    })

    return {
      session: {
        _id: session._id,
        type: 'session',
        name: session.name,
        createdAt: typeof session.createdAt === 'string' ? session.createdAt : '',
      },
      topics,
      rankings,
    }
  })

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: String(raw.exportedAt ?? ''),
    sessions,
  }
}

/** Session ids in the file that already exist in the store. */
export async function findClashes(store: Store, file: ExportFile): Promise<SessionId[]> {
  const existing = new Set((await store.listSessions()).map((session) => shortId(session._id)))
  return file.sessions.map((entry) => shortId(entry.session._id)).filter((sid) => existing.has(sid))
}

export type ClashStrategy = 'replace' | 'copy' | 'skip'

/** Rewrites every id of an exported session so it can live beside the original. */
export function duplicateSession(
  entry: ExportedSession,
  idGenerator: () => string = newId,
): ExportedSession {
  const sid = idGenerator()
  const topicIds = new Map(entry.topics.map((topic) => [shortId(topic._id), idGenerator()]))
  return {
    session: { ...entry.session, _id: ids.session(sid) },
    topics: entry.topics.map((topic) => ({
      ...topic,
      _id: ids.topic(sid, topicIds.get(shortId(topic._id))!),
      sessionId: sid,
    })),
    rankings: entry.rankings.map((ranking) => ({
      ...ranking,
      _id: ids.ranking(sid, idGenerator()),
      sessionId: sid,
      items: ranking.items.map((item) => ({ ...item, topicId: topicIds.get(item.topicId)! })),
    })),
  }
}

export interface ImportResult {
  imported: SessionId[]
  skipped: SessionId[]
}

/**
 * Writes the file's sessions into the store. A session whose id already exists is handled by
 * `onClash`: `replace` overwrites it in place, `copy` imports under fresh ids, `skip` leaves
 * it alone.
 */
export async function importSessions(
  store: Store,
  file: ExportFile,
  onClash: ClashStrategy,
  idGenerator: () => string = newId,
): Promise<ImportResult> {
  const clashes = new Set(await findClashes(store, file))
  const result: ImportResult = { imported: [], skipped: [] }
  for (const original of file.sessions) {
    const sid = shortId(original.session._id)
    let entry = original
    const leftovers: PouchDB.Core.PutDocument<AnyDoc>[] = []
    let docs: PouchDB.Core.PutDocument<AnyDoc>[] = [
      entry.session,
      ...entry.topics,
      ...entry.rankings,
    ]
    if (clashes.has(sid)) {
      if (onClash === 'skip') {
        result.skipped.push(sid)
        continue
      }
      if (onClash === 'copy') {
        entry = duplicateSession(original, idGenerator)
        docs = [entry.session, ...entry.topics, ...entry.rankings]
      }
      if (onClash === 'replace') {
        // Carry the current revision of every document the file also has, so each becomes an
        // update rather than a conflict. Documents the file no longer contains are deleted
        // only after every write succeeded: `bulkDocs` is not transactional, so a failed
        // write must leave the session complete, if partly updated, rather than thinned.
        const existing = new Map((await store.sessionDocuments(sid)).map((doc) => [doc._id, doc]))
        docs = docs.map((doc) => {
          const current = existing.get(doc._id)
          return current ? { ...doc, _rev: current._rev } : doc
        })
        const incoming = new Set(docs.map((doc) => doc._id))
        for (const doc of existing.values()) {
          if (!incoming.has(doc._id)) leftovers.push({ ...doc, _deleted: true })
        }
      }
    }
    try {
      requireAllWritten(await store.db.bulkDocs(docs), `of session "${entry.session.name}"`)
      if (leftovers.length > 0) {
        requireAllWritten(await store.db.bulkDocs(leftovers), `of session "${entry.session.name}"`)
      }
    } catch (error) {
      throw new ImportError(error instanceof Error ? error.message : String(error))
    }
    result.imported.push(shortId(entry.session._id))
  }
  return result
}
