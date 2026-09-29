/**
 * Wipes everything the app keeps between visits, then the caller reloads.
 *
 * Two kinds of state outlive a reload and both have produced "still broken"
 * reports that were really stale data:
 *
 *  - the **product-database library** in IndexedDB, which decides which
 *    catalog a new order starts from;
 *  - the **service worker** and its Cache Storage, which can keep serving an
 *    old bundle long after a deploy — Safari especially.
 *
 * Preferences in localStorage (theme) are left alone.
 */
import { DB_NAME as PDB_DATABASE } from './pdbCache.ts'

export interface ClearReport {
  database: boolean
  caches: number
  workers: number
}

function deleteDatabase(name: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const req = indexedDB.deleteDatabase(name)
      req.onsuccess = () => resolve(true)
      req.onerror = () => resolve(false)
      // Another tab holds it open: the delete completes when that tab closes.
      req.onblocked = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

export async function clearCachedData(): Promise<ClearReport> {
  const database = typeof indexedDB !== 'undefined' ? await deleteDatabase(PDB_DATABASE) : false

  let caches_ = 0
  if (typeof caches !== 'undefined') {
    for (const key of await caches.keys()) {
      if (await caches.delete(key)) caches_++
    }
  }

  let workers = 0
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      if (await reg.unregister()) workers++
    }
  }
  return { database, caches: caches_, workers }
}
