import memoryAdapter from 'pouchdb-adapter-memory'
import PouchDB from 'pouchdb-core'
import replication from 'pouchdb-replication'
import type { AnyDoc } from '../../../src/data/model.js'
import { Store } from '../../../src/data/store.js'

PouchDB.plugin(memoryAdapter)
PouchDB.plugin(replication)

let counter = 0

/** A fresh in-memory database; a distinct name per call because PouchDB caches by name. */
export function memoryDatabase(): PouchDB.Database<AnyDoc> {
  counter += 1
  return new PouchDB<AnyDoc>(`test-${counter}`, { adapter: 'memory' })
}

/** Deterministic ids: t1, t2, … */
export function sequentialIds(prefix = 'id'): () => string {
  let n = 0
  return () => {
    n += 1
    return `${prefix}${n}`
  }
}

/** A clock that advances one second per call from a fixed start. */
export function tickingClock(start = '2026-01-01T00:00:00.000Z'): () => string {
  let time = Date.parse(start)
  return () => {
    const value = new Date(time).toISOString()
    time += 1000
    return value
  }
}

export function testStore(): Store {
  return new Store(memoryDatabase(), { clock: tickingClock(), idGenerator: sequentialIds() })
}
