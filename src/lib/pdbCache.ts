/**
 * Caches the extracted PDB files (config.xml, version.xml) in IndexedDB
 * so the user only needs to drop the .gproducts file once.
 *
 * The PDB is NOT committed to the repo — only cached locally in the browser.
 */

const DB_NAME = 'gpc-viewer-pdb'
const DB_VERSION = 2
const STORE = 'pdb'
/**
 * Every product database the user has loaded, keyed by version name, so an open
 * order can be switched between catalogs without hunting for the file again.
 * `STORE` keeps its single 'current' slot for the new-order flow.
 */
const LIBRARY = 'pdb-library'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      if (!req.result.objectStoreNames.contains(LIBRARY)) req.result.createObjectStore(LIBRARY)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export interface CachedPdb {
  configXml: string
  versionXml: string
  currencyRates: Record<string, number>  // ISO → EUR-based exchange rate (EUR=1, USD=1.15, etc.)
  rawBuffer: ArrayBuffer  // original decrypted PDB ZIP — used as base for new .gconfiguration files
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

/** One entry in the catalog library, as listed in the header dropdown. */
export interface PdbLibraryEntry {
  /** Version name from ParametersData, e.g. "PDB290_09-2026". */
  name: string
}

/** Version name of a decrypted PDB package, read from its config.xml. */
export function pdbVersionName(configXml: string): string {
  return /<VersionName>([^<]*)<\/VersionName>/.exec(configXml)?.[1]?.trim() ?? ''
}

export async function addPdbToLibrary(name: string, pdb: CachedPdb): Promise<void> {
  if (!name) return
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LIBRARY, 'readwrite')
    tx.objectStore(LIBRARY).put(pdb, name)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Names only — deliberately `getAllKeys`, never `getAll`.
 *
 * Each stored catalog is the decrypted product database, tens of megabytes. The
 * dropdown needs names, so reading the records to list them would pull every
 * catalog into memory on app start.
 */
export async function listPdbLibrary(): Promise<PdbLibraryEntry[]> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LIBRARY, 'readonly')
      const req = tx.objectStore(LIBRARY).getAllKeys()
      req.onsuccess = () => {
        const names = (req.result as IDBValidKey[]).map(String).filter(Boolean)
        names.sort((a, b) => b.localeCompare(a))  // newest catalog name first
        resolve(names.map((name) => ({ name })))
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

export async function getPdbFromLibrary(name: string): Promise<CachedPdb | null> {
  try {
    const db = await openDb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LIBRARY, 'readonly')
      const req = tx.objectStore(LIBRARY).get(name)
      req.onsuccess = () => resolve((req.result as CachedPdb) ?? null)
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}
