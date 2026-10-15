import PouchDB from 'pouchdb-browser'
import type { AnyDoc } from '../../../src/data/model.js'
import { Store } from '../../../src/data/store.js'

/**
 * A fresh store on the browser's own IndexedDB: the tests run in real Chromium, so the real
 * adapter is both available and the honest thing to test against. A distinct name per call
 * keeps tests independent; the database is destroyed when the test is done with it.
 */
export function browserStore(): Store {
  const name = `ui-test-${crypto.randomUUID()}`
  return new Store(new PouchDB<AnyDoc>(name))
}

/** Waits for a condition, polling, so a test can follow the store's change feed. */
export async function until(condition: () => boolean, timeout = 2000): Promise<void> {
  const deadline = Date.now() + timeout
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
