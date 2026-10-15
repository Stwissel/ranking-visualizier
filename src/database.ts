/**
 * The browser's database and the remote factory. Kept outside `src/data/` because
 * `pouchdb-browser` references `self` at module scope and cannot load in Node.
 *
 * @module
 */
import PouchDB from 'pouchdb-browser'
import type { AnyDoc } from './data/model.js'
import type { RemoteFactory } from './data/sync.js'
import { remoteUrl } from './data/sync.js'

export const LOCAL_DATABASE_NAME = 'ranking-visualizier'

export function openLocalDatabase(name: string = LOCAL_DATABASE_NAME): PouchDB.Database<AnyDoc> {
  return new PouchDB<AnyDoc>(name)
}

export const openRemoteDatabase: RemoteFactory = (settings) =>
  new PouchDB<AnyDoc>(remoteUrl(settings), {
    skip_setup: true,
    auth:
      settings.username.trim() !== ''
        ? { username: settings.username, password: settings.password }
        : undefined,
  })
