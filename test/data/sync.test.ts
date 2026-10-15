import { describe, expect, it } from 'vitest'
import { shortId } from '../../src/data/model.js'
import { Store } from '../../src/data/store.js'
import {
  EMPTY_SETTINGS,
  isConfigured,
  loadSyncSettings,
  remoteUrl,
  SyncController,
  type SyncStatus,
  saveSyncSettings,
} from '../../src/data/sync.js'
import { memoryDatabase } from './support/memory-database.js'

class FakeStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

describe('settings', () => {
  it('round-trips through storage and tolerates garbage', () => {
    const storage = new FakeStorage()
    expect(loadSyncSettings(storage)).toEqual(EMPTY_SETTINGS)
    const settings = {
      ...EMPTY_SETTINGS,
      url: 'http://localhost:5984',
      username: 'u',
      password: 'p',
      live: true,
    }
    saveSyncSettings(settings, storage)
    expect(loadSyncSettings(storage)).toEqual(settings)
    storage.setItem('ranking-visualizier.sync', '{not json')
    expect(loadSyncSettings(storage)).toEqual(EMPTY_SETTINGS)
  })

  it('builds the remote URL without credentials', () => {
    expect(
      remoteUrl({ ...EMPTY_SETTINGS, url: 'https://couch.example.org//', database: 'my db' }),
    ).toBe('https://couch.example.org/my%20db')
    expect(isConfigured(EMPTY_SETTINGS)).toBe(false)
    expect(isConfigured({ ...EMPTY_SETTINGS, url: 'http://x' })).toBe(true)
  })
})

describe('SyncController', () => {
  it('replicates both ways in one shot and reports idle', async () => {
    const local = memoryDatabase()
    const remote = memoryDatabase()
    const controller = new SyncController(
      local,
      () => remote,
      () => '2026-10-15T10:00:00.000Z',
    )
    const states: SyncStatus[] = []
    controller.addEventListener('status', (event) =>
      states.push((event as CustomEvent<SyncStatus>).detail),
    )

    const localStore = new Store(local)
    const remoteStore = new Store(remote)
    const mine = await localStore.createSession('Mine')
    const theirs = await remoteStore.createSession('Theirs')

    await controller.syncOnce({ ...EMPTY_SETTINGS, url: 'http://irrelevant' })

    expect((await localStore.listSessions()).map((s) => s.name).sort()).toEqual(['Mine', 'Theirs'])
    expect((await remoteStore.listSessions()).map((s) => s.name).sort()).toEqual(['Mine', 'Theirs'])
    expect(states.map((s) => s.state)).toEqual(['active', 'idle'])
    expect(controller.status.lastSyncedAt).toBe('2026-10-15T10:00:00.000Z')
    expect(shortId(mine._id)).not.toBe(shortId(theirs._id))
  })

  it('refuses to sync without a URL', async () => {
    const controller = new SyncController(memoryDatabase(), () => memoryDatabase())
    await expect(controller.syncOnce(EMPTY_SETTINGS)).rejects.toThrow(/required/)
  })

  it('live sync carries later writes and stop() turns it off', async () => {
    const local = memoryDatabase()
    const remote = memoryDatabase()
    const controller = new SyncController(local, () => remote)
    controller.start({ ...EMPTY_SETTINGS, url: 'http://irrelevant', live: true })
    expect(controller.status.state).toBe('connecting')

    await new Store(local).createSession('Later')
    const deadline = Date.now() + 2000
    while (Date.now() < deadline && (await new Store(remote).listSessions()).length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    expect((await new Store(remote).listSessions()).map((s) => s.name)).toEqual(['Later'])

    controller.stop()
    expect(controller.status.state).toBe('off')
  })

  it('stop() leaves a one-shot result alone when nothing is running', async () => {
    const controller = new SyncController(memoryDatabase(), () => memoryDatabase())
    await controller.syncOnce({ ...EMPTY_SETTINGS, url: 'http://irrelevant' })
    controller.stop()
    expect(controller.status.state).toBe('idle')
  })
})
