/**
 * Loads a .gproducts PDB file — decrypts (AES-128-CBC, same key as .gconfiguration),
 * unpacks the OPC ZIP, and extracts config.xml + version.xml.
 *
 * The PDB does NOT contain an order.xml — it is a pure catalog file.
 */

import { decryptGpcFile } from './decrypt.js'
import { unpackOpc } from './unpack.js'
import { parseCurrencyRates } from './parseConfig.js'
import { savePdbCache } from './pdbCache.js'
import type { CachedPdb } from './pdbCache.js'

export interface PdbContents {
  configXml: string
  versionXml: string
  currencyRates: Record<string, number>
}

export async function loadPdbFile(file: File): Promise<PdbContents> {
  const buffer = await file.arrayBuffer()

  // Try AES decryption first (same key as .gconfiguration).
  // If the result doesn't start with PK (ZIP magic), try reading as raw ZIP.
  let zipBuffer: ArrayBuffer
  try {
    const decrypted = await decryptGpcFile(buffer)
    const header = new Uint8Array(decrypted, 0, 2)
    if (header[0] === 0x50 && header[1] === 0x4b) {
      zipBuffer = decrypted
    } else {
      // Decryption produced garbage — try raw
      zipBuffer = buffer
    }
  } catch {
    zipBuffer = buffer
  }

  const { configXml, versionXml } = await unpackOpc(zipBuffer)

  if (!configXml) {
    throw new Error('loadPdbFile: config.xml not found in PDB — is this a valid .gproducts file?')
  }

  const currencyRates = configXml ? parseCurrencyRates(configXml) : {}

  const result: PdbContents = {
    configXml,
    versionXml: versionXml ?? '',
    currencyRates,
  }

  // Cache for future "New Order" use
  const cached: CachedPdb = {
    configXml: result.configXml,
    versionXml: result.versionXml,
    currencyRates,
    cachedAt: Date.now(),
  }
  await savePdbCache(cached)

  return result
}
