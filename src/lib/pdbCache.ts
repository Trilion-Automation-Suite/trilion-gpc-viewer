/**
 * Caches the extracted PDB files (config.xml, version.xml) in IndexedDB
 * so the user only needs to drop the .gproducts file once.
 *
 * The PDB is NOT committed to the repo — only cached locally in the browser.
 */

const DB_NAME = 'gpc-viewer-pdb'
const DB_VERSION = 1
const STORE = 'pdb'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export interface CachedPdb {
  configXml: string
  versionXml: string
  currencyRates: Record<string, number>  // ISO → EUR-based exchange rate (EUR=1, USD=1.15, etc.)
  cachedAt: number  // Date.now()
}

export async function savePdbCache(pdb: CachedPdb): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(pdb, 'current')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function loadPdbCache(): Promise<CachedPdb | null> {
  try {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get('current')
      req.onsuccess = () => resolve((req.result as CachedPdb) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

export async function clearPdbCache(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete('current')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
