import { describe, expect, it } from 'vitest'
import { shortId } from '../../src/data/model.js'
import {
  duplicateSession,
  exportSessions,
  findClashes,
  ImportError,
  importSessions,
  parseExport,
} from '../../src/data/transfer.js'
import { sequentialIds, testStore } from './support/memory-database.js'

async function populated() {
  const store = testStore()
  const session = await store.createSession('Work')
  const sid = shortId(session._id)
  const a = await store.createTopic(sid, { title: 'Alpha', colour: '#ff0000' })
  const b = await store.createTopic(sid, { title: 'Beta', colour: '#00ff00' })
  const ranking = await store.createRanking(sid, { name: 'Q1', date: '2026-01-15' })
  await store.setDescription(sid, shortId(ranking._id), shortId(a._id), 'first')
  return { store, sid, a, b, ranking }
}

describe('export', () => {
  it('writes documents without revisions, grouped by session', async () => {
    const { store, sid } = await populated()
    const file = await exportSessions(store, undefined, () => '2026-10-15T10:00:00.000Z')
    expect(file.format).toBe('ranking-visualizier')
    expect(file.version).toBe(1)
    expect(file.exportedAt).toBe('2026-10-15T10:00:00.000Z')
    expect(file.sessions).toHaveLength(1)
    const [entry] = file.sessions
    expect(entry?.session._id).toBe(`session:${sid}`)
    expect(entry?.topics).toHaveLength(2)
    expect(entry?.rankings[0]?.items[0]?.description).toBe('first')
    const text = JSON.stringify(file)
    expect(text).not.toContain('_rev')
  })

  it('can be limited to named sessions', async () => {
    const { store } = await populated()
    const other = await store.createSession('Home')
    const file = await exportSessions(store, [shortId(other._id)])
    expect(file.sessions.map((entry) => entry.session.name)).toEqual(['Home'])
  })
})

describe('parseExport', () => {
  it('round-trips an export', async () => {
    const { store } = await populated()
    const file = await exportSessions(store)
    expect(parseExport(JSON.stringify(file))).toEqual(file)
  })

  it.each([
    ['not json', 'not valid JSON'],
    ['[]', 'not a ranking-visualizier export'],
    ['{"format":"other","version":1,"sessions":[]}', 'not a ranking-visualizier export'],
    ['{"format":"ranking-visualizier","version":2,"sessions":[]}', 'Unsupported export version'],
    ['{"format":"ranking-visualizier","version":1}', 'no sessions array'],
    [
      '{"format":"ranking-visualizier","version":1,"sessions":[{"session":{"_id":"session:s","name":"S"},"topics":[{"_id":"topic:s:t","title":"T","colour":"red"}],"rankings":[]}]}',
      'colour is not #rrggbb',
    ],
    [
      '{"format":"ranking-visualizier","version":1,"sessions":[{"session":{"_id":"session:s","name":"S"},"topics":[],"rankings":[{"_id":"ranking:s:r","name":"R","date":"2026-01-01","items":[{"topicId":"ghost"}]}]}]}',
      'unknown topic',
    ],
  ])('rejects %s', (text, reason) => {
    expect(() => parseExport(text)).toThrowError(ImportError)
    expect(() => parseExport(text)).toThrowError(reason)
  })
})

describe('import', () => {
  it('imports into an empty store', async () => {
    const { store } = await populated()
    const file = await exportSessions(store)
    const target = testStore()
    const result = await importSessions(target, file, 'skip')
    expect(result.imported).toHaveLength(1)
    const [session] = await target.listSessions()
    const sid = shortId(session!._id)
    expect(await target.listTopics(sid)).toHaveLength(2)
    expect((await target.listRankings(sid))[0]?.items[0]?.description).toBe('first')
  })

  it('detects clashes and honours skip, replace and copy', async () => {
    const { store, sid } = await populated()
    const file = await exportSessions(store)
    expect(await findClashes(store, file)).toEqual([sid])

    const skipped = await importSessions(store, file, 'skip')
    expect(skipped).toEqual({ imported: [], skipped: [sid] })

    await store.renameSession(sid, 'Changed locally')
    const replaced = await importSessions(store, file, 'replace')
    expect(replaced.imported).toEqual([sid])
    expect((await store.getSession(sid)).name).toBe('Work')
    expect(await store.listTopics(sid)).toHaveLength(2)

    const copied = await importSessions(store, file, 'copy', sequentialIds('copy'))
    expect(copied.imported).toEqual(['copy1'])
    expect(await store.listSessions()).toHaveLength(2)
    const copyRankings = await store.listRankings('copy1')
    expect(copyRankings[0]?.items.map((item) => item.topicId)).toEqual(['copy2', 'copy3'])
  })

  it('replace updates in place and drops only what the file no longer has', async () => {
    const { store, sid, a, b } = await populated()
    const file = await exportSessions(store)
    // Locally, a topic the file knows nothing about appears and Alpha is renamed.
    const extra = await store.createTopic(sid, { title: 'Local only', colour: '#123456' })
    await store.updateTopic(sid, shortId(a._id), { title: 'Alpha renamed' })

    await importSessions(store, file, 'replace')

    const topics = await store.listTopics(sid)
    expect(topics.map((topic) => topic.title)).toEqual(['Alpha', 'Beta'])
    expect(topics.map((topic) => topic._id)).toEqual([a._id, b._id])
    await expect(store.getTopic(sid, shortId(extra._id))).rejects.toThrow()
    // Replacing twice is idempotent: revisions are carried, so nothing conflicts.
    await importSessions(store, file, 'replace')
    expect((await store.listTopics(sid)).map((topic) => topic.title)).toEqual(['Alpha', 'Beta'])
  })

  it('duplicateSession rewrites every id consistently', async () => {
    const { store } = await populated()
    const [entry] = (await exportSessions(store)).sessions
    const copy = duplicateSession(entry!, sequentialIds('n'))
    expect(copy.session._id).toBe('session:n1')
    expect(copy.topics.map((topic) => topic._id)).toEqual(['topic:n1:n2', 'topic:n1:n3'])
    expect(copy.rankings[0]?._id).toBe('ranking:n1:n4')
    expect(copy.rankings[0]?.items.map((item) => item.topicId)).toEqual(['n2', 'n3'])
    expect(copy.topics.every((topic) => topic.sessionId === 'n1')).toBe(true)
  })
})
