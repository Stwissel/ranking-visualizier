/**
 * Replication with a CouchDB.
 *
 * Settings live in `localStorage`, deliberately outside the database: the credentials for a
 * server must never replicate to that server. The controller wraps `PouchDB.sync` and exposes
 * a small status model the header can render.
 *
 * @module
 */
import type { AnyDoc } from './model.js'

export interface SyncSettings {
  /** CouchDB origin, e.g. `https://couch.example.org` or `http://localhost:5984`. */
  url: string
  database: string
  username: string
  password: string
  /** Keep a live two-way replication running while the app is open. */
  live: boolean
}

export const SYNC_SETTINGS_KEY = 'ranking-visualizier.sync'

export const EMPTY_SETTINGS: SyncSettings = {
  url: '',
  database: 'ranking-visualizier',
  username: '',
  password: '',
  live: false,
}

export function loadSyncSettings(storage: Storage = localStorage): SyncSettings {
  try {
    const raw = storage.getItem(SYNC_SETTINGS_KEY)
    if (!raw) return { ...EMPTY_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<SyncSettings>
    return { ...EMPTY_SETTINGS, ...parsed }
  } catch {
    return { ...EMPTY_SETTINGS }
  }
}

export function saveSyncSettings(settings: SyncSettings, storage: Storage = localStorage): void {
  storage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(settings))
}

export function clearSyncSettings(storage: Storage = localStorage): void {
  storage.removeItem(SYNC_SETTINGS_KEY)
}

/** The remote database URL, without credentials. */
export function remoteUrl(settings: SyncSettings): string {
  const base = settings.url.trim().replace(/\/+$/, '')
  return `${base}/${encodeURIComponent(settings.database.trim())}`
}

export function isConfigured(settings: SyncSettings): boolean {
  return settings.url.trim() !== '' && settings.database.trim() !== ''
}

export type SyncState = 'off' | 'connecting' | 'active' | 'idle' | 'error'

export interface SyncStatus {
  state: SyncState
  /** Human-readable reason while `state` is `error`. */
  error?: string
  lastSyncedAt?: string
}

export type RemoteFactory = (settings: SyncSettings) => PouchDB.Database<AnyDoc>

/**
 * Emits a `status` CustomEvent<SyncStatus> whenever the state changes.
 *
 * The remote database is built by a factory so a test can hand in a second in-memory database
 * and watch documents cross; the application's factory opens an HTTP database with basic auth.
 */
export class SyncController extends EventTarget {
  private handler: PouchDB.Replication.Sync<AnyDoc> | undefined
  private current: SyncStatus = { state: 'off' }

  constructor(
    private readonly local: PouchDB.Database<AnyDoc>,
    private readonly remoteFactory: RemoteFactory,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {
    super()
  }

  get status(): SyncStatus {
    return this.current
  }

  /** Starts live two-way replication, replacing any running one. */
  start(settings: SyncSettings): void {
    this.stop()
    if (!isConfigured(settings)) {
      this.set({ state: 'off' })
      return
    }
    this.set({ state: 'connecting' })
    const remote = this.remoteFactory(settings)
    this.handler = this.local
      .sync(remote, { live: true, retry: true })
      .on('active', () => this.set({ state: 'active' }))
      .on('paused', (error) => {
        if (error) this.set({ state: 'error', error: describe(error) })
        else this.set({ state: 'idle', lastSyncedAt: this.clock() })
      })
      .on('denied', (error) => this.set({ state: 'error', error: describe(error) }))
      .on('error', (error) => this.set({ state: 'error', error: describe(error) }))
  }

  /** Ends live replication. A status from a one-shot sync stays as it was when nothing ran. */
  stop(): void {
    if (!this.handler) return
    this.handler.cancel()
    this.handler = undefined
    this.set({ state: 'off' })
  }

  /** One round trip, both directions, awaited. Leaves any live replication running. */
  async syncOnce(settings: SyncSettings): Promise<void> {
    if (!isConfigured(settings)) throw new Error('CouchDB URL and database are required')
    const wasLive = this.handler !== undefined
    if (!wasLive) this.set({ state: 'active' })
    try {
      await this.local.sync(this.remoteFactory(settings), { live: false, retry: false })
      if (!wasLive) this.set({ state: 'idle', lastSyncedAt: this.clock() })
    } catch (error) {
      this.set({ state: 'error', error: describe(error) })
      throw error
    }
  }

  private set(status: SyncStatus): void {
    this.current = { ...this.current, ...status, error: status.error }
    this.dispatchEvent(new CustomEvent<SyncStatus>('status', { detail: this.current }))
  }
}

function describe(error: unknown): string {
  if (error && typeof error === 'object') {
    const { status, message, reason, name } = error as Record<string, unknown>
    if (status === 401) return 'Unauthorised: check username and password'
    if (status === 403) return 'Forbidden: this user may not access the database'
    if (status === 404) return 'Database not found on the server'
    if (typeof message === 'string' && message) return message
    if (typeof reason === 'string' && reason) return reason
    if (typeof name === 'string' && name) return name
  }
  return 'Connection failed: check the URL and that CouchDB allows CORS for this origin'
}
