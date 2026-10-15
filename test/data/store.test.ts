import { describe, expect, it } from 'vitest'
import { parseTopicLines, shortId } from '../../src/data/model.js'
import { NotFoundError, ValidationError } from '../../src/data/store.js'
import { testStore } from './support/memory-database.js'

async function seeded() {
  const store = testStore()
  const session = await store.createSession('Work')
  const sid = shortId(session._id)
  const a = await store.createTopic(sid, { title: 'Alpha', colour: '#FF0000' })
  const b = await store.createTopic(sid, { title: 'Beta', colour: '#00ff00' })
  const c = await store.createTopic(sid, { title: 'Gamma', colour: '#0000ff' })
  return { store, sid, a: shortId(a._id), b: shortId(b._id), c: shortId(c._id) }
}

describe('sessions', () => {
  it('creates, lists, renames and deletes with everything inside', async () => {
    const { store, sid } = await seeded()
    await store.createRanking(sid, { name: 'Q1', date: '2026-01-15' })
    const other = await store.createSession('Home')

    expect((await store.listSessions()).map((s) => s.name)).toEqual(['Home', 'Work'])
    await store.renameSession(sid, 'Office')
    expect((await store.getSession(sid)).name).toBe('Office')

    await store.deleteSession(sid)
    expect(await store.listSessions()).toHaveLength(1)
    expect(await store.listTopics(sid)).toEqual([])
    expect(await store.listRankings(sid)).toEqual([])
    await expect(store.getSession(sid)).rejects.toBeInstanceOf(NotFoundError)
    expect((await store.getSession(shortId(other._id))).name).toBe('Home')
  })

  it('refuses an empty name', async () => {
    const store = testStore()
    await expect(store.createSession('   ')).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('topics', () => {
  it('normalises colour and validates input', async () => {
    const { store, sid, a } = await seeded()
    expect((await store.getTopic(sid, a)).colour).toBe('#ff0000')
    await expect(store.createTopic(sid, { title: 'X', colour: 'red' })).rejects.toBeInstanceOf(
      ValidationError,
    )
    await expect(
      store.createTopic('nope', { title: 'X', colour: '#000000' }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await store.updateTopic(sid, a, { title: 'Alpha prime', colour: '#ABCDEF' })
    const updated = await store.getTopic(sid, a)
    expect(updated.title).toBe('Alpha prime')
    expect(updated.colour).toBe('#abcdef')
  })

  it('appends a new topic to the newest ranking only', async () => {
    const { store, sid, a, b, c } = await seeded()
    const old = await store.createRanking(sid, { name: 'Old', date: '2026-01-01' })
    const newer = await store.createRanking(sid, { name: 'New', date: '2026-02-01' })
    const d = await store.createTopic(sid, {
      title: 'Delta',
      colour: '#123456',
      description: 'fresh',
    })

    const oldItems = (await store.getRanking(sid, shortId(old._id))).items
    const newItems = (await store.getRanking(sid, shortId(newer._id))).items
    expect(oldItems.map((i) => i.topicId)).toEqual([a, b, c])
    expect(newItems.map((i) => i.topicId)).toEqual([a, b, c, shortId(d._id)])
    expect(newItems[3]?.description).toBe('fresh')
  })

  it('retires a topic from a ranking and later ones, keeping earlier history and the topic', async () => {
    const { store, sid, b } = await seeded()
    const r1 = await store.createRanking(sid, { name: 'R1', date: '2026-01-01' })
    const r2 = await store.createRanking(sid, { name: 'R2', date: '2026-02-01' })
    const r3 = await store.createRanking(sid, { name: 'R3', date: '2026-03-01' })

    await store.retireTopic(sid, b, shortId(r2._id))

    const has = async (rid: string) =>
      (await store.getRanking(sid, shortId(rid))).items.some((i) => i.topicId === b)
    expect(await has(r1._id)).toBe(true)
    expect(await has(r2._id)).toBe(false)
    expect(await has(r3._id)).toBe(false)
    expect((await store.getTopic(sid, b)).title).toBe('Beta')
  })

  it('retires from the newest ranking when none is named', async () => {
    const { store, sid, a } = await seeded()
    const r1 = await store.createRanking(sid, { name: 'R1', date: '2026-01-01' })
    const r2 = await store.createRanking(sid, { name: 'R2', date: '2026-02-01' })
    await store.retireTopic(sid, a)
    expect((await store.getRanking(sid, shortId(r1._id))).items.map((i) => i.topicId)).toContain(a)
    expect(
      (await store.getRanking(sid, shortId(r2._id))).items.map((i) => i.topicId),
    ).not.toContain(a)
  })

  it('orders "later" by date, then creation time', async () => {
    const { store, sid, a } = await seeded()
    const first = await store.createRanking(sid, { name: 'same day, first', date: '2026-05-05' })
    const second = await store.createRanking(sid, { name: 'same day, second', date: '2026-05-05' })
    const earlierDate = await store.createRanking(sid, {
      name: 'dated earlier',
      date: '2026-04-01',
    })
    await store.retireTopic(sid, a, shortId(first._id))
    const items = async (rid: string) =>
      (await store.getRanking(sid, shortId(rid))).items.map((i) => i.topicId)
    expect(await items(earlierDate._id)).toContain(a)
    expect(await items(first._id)).not.toContain(a)
    expect(await items(second._id)).not.toContain(a)
  })

  it('deletes a topic completely', async () => {
    const { store, sid, c } = await seeded()
    const r1 = await store.createRanking(sid, { name: 'R1', date: '2026-01-01' })
    await store.deleteTopic(sid, c)
    await expect(store.getTopic(sid, c)).rejects.toBeInstanceOf(NotFoundError)
    expect(
      (await store.getRanking(sid, shortId(r1._id))).items.map((i) => i.topicId),
    ).not.toContain(c)
    expect(await store.listTopics(sid)).toHaveLength(2)
  })

  it('keeps the description a topic was created with and carries it into rankings', async () => {
    const { store, sid, a } = await seeded()
    const d = await store.createTopic(sid, {
      title: 'Delta',
      colour: '#123456',
      description: 'why it matters',
    })
    expect(d.description).toBe('why it matters')
    // No ranking yet: the first ranking picks the description up from the topic.
    const first = await store.createRanking(sid, { name: 'First', date: '2026-01-01' })
    const rid = shortId(first._id)
    const deltaItem = first.items.find((item) => item.topicId === shortId(d._id))
    expect(deltaItem?.description).toBe('why it matters')
    // Later edits in a ranking stay with that ranking; the next ranking copies them.
    await store.setDescription(sid, rid, shortId(d._id), 'changed in Q1')
    const second = await store.createRanking(sid, { name: 'Second', date: '2026-02-01' })
    expect(second.items.find((item) => item.topicId === shortId(d._id))?.description).toBe(
      'changed in Q1',
    )
    // A topic created while rankings exist goes into the newest with its description.
    const e = await store.createTopic(sid, {
      title: 'Epsilon',
      colour: '#654321',
      description: 'new now',
    })
    const newest = await store.getRanking(sid, shortId(second._id))
    expect(newest.items.at(-1)).toEqual({ topicId: shortId(e._id), description: 'new now' })
    // Retiring and re-adding carries the last description, not an empty one.
    await store.retireTopic(sid, shortId(d._id), shortId(second._id))
    await store.addTopicToRanking(sid, shortId(second._id), shortId(d._id))
    const readded = await store.getRanking(sid, shortId(second._id))
    expect(readded.items.at(-1)?.description).toBe('changed in Q1')
    // Editing the topic's own description changes only what future first placements use.
    await store.updateTopic(sid, a, { description: 'default for Alpha' })
    expect((await store.getTopic(sid, a)).description).toBe('default for Alpha')
    expect(
      (await store.getRanking(sid, rid)).items.find((item) => item.topicId === a)?.description,
    ).toBe('')
  })

  it('re-adds a retired topic at the bottom of a ranking, once', async () => {
    const { store, sid, a } = await seeded()
    const r1 = await store.createRanking(sid, { name: 'R1', date: '2026-01-01' })
    const rid = shortId(r1._id)
    await store.retireTopic(sid, a, rid)
    await store.addTopicToRanking(sid, rid, a)
    await store.addTopicToRanking(sid, rid, a)
    const topicIds = (await store.getRanking(sid, rid)).items.map((i) => i.topicId)
    expect(topicIds).toEqual([...topicIds.filter((t) => t !== a), a])
    expect(topicIds.filter((t) => t === a)).toHaveLength(1)
  })
})

describe('rankings', () => {
  it('starts from all topics when there is no predecessor', async () => {
    const { store, sid, a, b, c } = await seeded()
    const ranking = await store.createRanking(sid, { name: 'First', date: '2026-01-01' })
    expect(ranking.items).toEqual([
      { topicId: a, description: '' },
      { topicId: b, description: '' },
      { topicId: c, description: '' },
    ])
  })

  it('copies order and descriptions from the newest ranking', async () => {
    const { store, sid, a, b, c } = await seeded()
    const first = await store.createRanking(sid, { name: 'First', date: '2026-01-01' })
    const rid = shortId(first._id)
    await store.reorderRanking(sid, rid, [c, a, b])
    await store.setDescription(sid, rid, c, 'top priority')
    const second = await store.createRanking(sid, { name: 'Second', date: '2026-02-01' })
    expect(second.items).toEqual([
      { topicId: c, description: 'top priority' },
      { topicId: a, description: '' },
      { topicId: b, description: '' },
    ])
    // Descriptions are per ranking: changing one leaves the other alone.
    await store.setDescription(sid, shortId(second._id), c, 'still top')
    expect((await store.getRanking(sid, rid)).items[0]?.description).toBe('top priority')
  })

  it('lists newest first and validates dates', async () => {
    const { store, sid } = await seeded()
    await store.createRanking(sid, { name: 'B', date: '2026-02-01' })
    await store.createRanking(sid, { name: 'A', date: '2026-01-01' })
    await store.createRanking(sid, { name: 'C', date: '2026-03-01' })
    expect((await store.listRankings(sid)).map((r) => r.name)).toEqual(['C', 'B', 'A'])
    await expect(
      store.createRanking(sid, { name: 'X', date: '01/02/2026' }),
    ).rejects.toBeInstanceOf(ValidationError)
    await expect(
      store.createRanking(sid, { name: 'X', date: '2026-13-45' }),
    ).rejects.toBeInstanceOf(ValidationError)
    // Date.parse would roll this into March; the store must not.
    await expect(
      store.createRanking(sid, { name: 'X', date: '2026-02-30' }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('refuses a reorder that is not a permutation', async () => {
    const { store, sid, a, b, c } = await seeded()
    const ranking = await store.createRanking(sid, { name: 'R', date: '2026-01-01' })
    const rid = shortId(ranking._id)
    await expect(store.reorderRanking(sid, rid, [a, b])).rejects.toBeInstanceOf(ValidationError)
    await expect(store.reorderRanking(sid, rid, [a, a, b])).rejects.toBeInstanceOf(ValidationError)
    await expect(store.reorderRanking(sid, rid, [a, b, 'zzz'])).rejects.toBeInstanceOf(
      ValidationError,
    )
    expect((await store.getRanking(sid, rid)).items.map((i) => i.topicId)).toEqual([a, b, c])
  })

  it('updates name and date, and deletes', async () => {
    const { store, sid } = await seeded()
    const ranking = await store.createRanking(sid, { name: 'R', date: '2026-01-01' })
    const rid = shortId(ranking._id)
    await store.updateRanking(sid, rid, { name: 'Renamed', date: '2026-06-06' })
    const updated = await store.getRanking(sid, rid)
    expect([updated.name, updated.date]).toEqual(['Renamed', '2026-06-06'])
    await store.deleteRanking(sid, rid)
    await expect(store.getRanking(sid, rid)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('notifies subscribers of changes', async () => {
    const { store, sid } = await seeded()
    const seen: string[] = []
    const unsubscribe = store.subscribe((change) => seen.push(change.id))
    const ranking = await store.createRanking(sid, { name: 'R', date: '2026-01-01' })
    await new Promise((resolve) => setTimeout(resolve, 20))
    unsubscribe()
    expect(seen).toContain(ranking._id)
  })
})

describe('createTopics', () => {
  it('parses lines with optional descriptions', () => {
    expect(parseTopicLines('A | why\n\n  B  \n| no title\nC|')).toEqual([
      { title: 'A', description: 'why' },
      { title: 'B', description: '' },
      { title: 'C', description: '' },
    ])
  })

  it('creates several topics with unused colours and appends them to the newest ranking', async () => {
    const { store, sid } = await seeded()
    const ranking = await store.createRanking(sid, { name: 'R', date: '2026-01-01' })
    const created = await store.createTopics(sid, [
      { title: 'Delta', description: 'd' },
      { title: 'Epsilon' },
      { title: 'Zeta' },
    ])
    expect(created.map((t) => t.title)).toEqual(['Delta', 'Epsilon', 'Zeta'])
    // #ff0000, #00ff00, #0000ff are taken by seeded(); defaults start from the palette's first.
    expect(created.map((t) => t.colour)).toEqual(['#2a78d6', '#eb6834', '#1baf7a'])
    expect(created[0]?.description).toBe('d')
    const items = (await store.getRanking(sid, shortId(ranking._id))).items
    expect(items.slice(-3)).toEqual([
      { topicId: shortId(created[0]!._id), description: 'd' },
      { topicId: shortId(created[1]!._id), description: '' },
      { topicId: shortId(created[2]!._id), description: '' },
    ])
  })

  it('refuses duplicates before writing anything', async () => {
    const { store, sid } = await seeded()
    await expect(
      store.createTopics(sid, [{ title: 'alpha' }, { title: 'New' }, { title: 'new' }]),
    ).rejects.toThrow(/Already in this session or listed twice: alpha, new/)
    expect(await store.listTopics(sid)).toHaveLength(3)
  })
})

describe('undoable', () => {
  it('puts a reorder back with a single write', async () => {
    const { store, sid, a, b, c } = await seeded()
    const ranking = await store.createRanking(sid, { name: 'R', date: '2026-01-01' })
    const rid = shortId(ranking._id)
    const { undo } = await store.undoable(sid, () => store.reorderRanking(sid, rid, [c, a, b]))
    expect((await store.getRanking(sid, rid)).items.map((i) => i.topicId)).toEqual([c, a, b])
    await undo()
    const restored = await store.getRanking(sid, rid)
    expect(restored.items.map((i) => i.topicId)).toEqual([a, b, c])
    expect(restored._rev?.startsWith('3-')).toBe(true)
  })

  it('brings a deleted topic back into every ranking', async () => {
    const { store, sid, b } = await seeded()
    const r1 = await store.createRanking(sid, { name: 'R1', date: '2026-01-01' })
    await store.setDescription(sid, shortId(r1._id), b, 'kept')
    const { undo } = await store.undoable(sid, () => store.deleteTopic(sid, b))
    await expect(store.getTopic(sid, b)).rejects.toBeInstanceOf(NotFoundError)
    await undo()
    expect((await store.getTopic(sid, b)).title).toBe('Beta')
    const item = (await store.getRanking(sid, shortId(r1._id))).items.find((i) => i.topicId === b)
    expect(item?.description).toBe('kept')
  })

  it('restores a deleted session with its topics and rankings', async () => {
    const { store, sid } = await seeded()
    await store.createRanking(sid, { name: 'R1', date: '2026-01-01' })
    const { undo } = await store.undoable(sid, () => store.deleteSession(sid))
    expect(await store.listSessions()).toHaveLength(0)
    await undo()
    expect((await store.getSession(sid)).name).toBe('Work')
    expect(await store.listTopics(sid)).toHaveLength(3)
    expect(await store.listRankings(sid)).toHaveLength(1)
  })

  it('removes what the action created when undone', async () => {
    const { store, sid } = await seeded()
    const { result, undo } = await store.undoable(sid, () =>
      store.createTopic(sid, { title: 'Temp', colour: '#123456' }),
    )
    await undo()
    await expect(store.getTopic(sid, shortId(result._id))).rejects.toBeInstanceOf(NotFoundError)
  })
})
