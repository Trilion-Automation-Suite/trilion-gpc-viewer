import type { OrderSummary, ParseResult } from '../types/order.js'
import { decryptGpcFile } from './decrypt.js'
import { unpackOpc } from './unpack.js'
import { parseOrder } from './parseOrder.js'
import { buildArticlePriceMap, parseCurrencyRates } from './parseConfig.js'
import { buildLicenseCatalog, buildLicenseCatalogFromConfig } from './parseLicenseCatalog.js'
import { METHOD_DEFLATE, METHOD_STORED, readContainer, writeContainer } from './gpc/container.ts'
import type { GpcEntry } from './gpc/container.ts'
import { buildContentTypes, buildRels } from './gpc/writeGpcFile.ts'
import { createBlankOrderXml } from './createBlankOrder.js'

/** Mutates article rows in-place with prices from the config.xml price map. */
function enrichArticlePrices(order: OrderSummary, priceMap: ReturnType<typeof buildArticlePriceMap>): void {
  for (const item of order.items) {
    for (const section of item.sections) {
      for (const article of section.articles) {
        const prices = priceMap.get(article.name)
        if (prices) {
          if (article.unitMsrp === null) article.unitMsrp = prices.msrp
          if (article.unitDp === null) article.unitDp = prices.dp
          if (!article.sapNr) article.sapNr = prices.sapNr
          if (!article.unit && prices.unit) article.unit = prices.unit
        }
      }
    }
  }
}

/**
 * Reads a .gconfiguration File, decrypts it, unpacks the OPC container,
 * and parses the order XML into a structured ParseResult.
 */
/**
 * The product database an order was built against, recorded in order.xml as
 * SourceFileName (e.g. "PDB285_01-2026"). Absent on very old files, which
 * predate the field.
 */
/** `"R" + Guid.NewGuid().ToString("N").Substring(0,16)`, fresh on every save. */
function relationshipId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return 'R' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** `ParametersData/VersionName` — the catalog's own name for itself. */
function readVersionName(configXml: string): string {
  return /<VersionName>([^<]*)<\/VersionName>/.exec(configXml)?.[1]?.trim() ?? ''
}

/**
 * Adds `SourceFileName` to a blank order, in its canonical position after
 * `PriceList`. Inserted as text rather than through the XML model because the
 * blank order's formatting is not byte-stable through a re-serialize, and
 * changing it here would change every new file.
 */
function withSourceFileName(orderXml: string, catalog: string): string {
  if (!catalog || orderXml.includes('<SourceFileName>')) return orderXml
  const eol = orderXml.includes('\r\n') ? '\r\n' : '\n'
  return orderXml.replace(
    `</OrderData>`,
    `  <SourceFileName>${catalog}</SourceFileName>${eol}</OrderData>`
  )
}

function readSourceFileName(orderXml: string): string {
  return /<SourceFileName>([^<]*)<\/SourceFileName>/.exec(orderXml)?.[1]?.trim() ?? ''
}

export async function loadGpcFile(file: File, fileHandle?: FileSystemFileHandle): Promise<ParseResult> {
  // 1. Read file bytes
  const buffer = await file.arrayBuffer()

  // 2. Decrypt
  const decrypted = await decryptGpcFile(buffer)

  return parseDecryptedPackage(decrypted, file.name, fileHandle)
}

/**
 * Everything after decryption, split out so a package produced in memory — a
 * catalog conversion, say — goes through exactly the same parse as one read
 * from disk, instead of a parallel path that can drift.
 */
export async function parseDecryptedPackage(
  decrypted: ArrayBuffer,
  sourceFile: string,
  fileHandle?: FileSystemFileHandle
): Promise<ParseResult> {
  // 3. Validate ZIP magic bytes ("PK" = 0x50 0x4B)
  const header = new Uint8Array(decrypted, 0, 2)
  if (header[0] !== 0x50 || header[1] !== 0x4b) {
    throw new Error(
      'loadGpcFile: decrypted content does not appear to be a ZIP file (missing PK magic bytes)'
    )
  }

  // 4. Unpack OPC ZIP
  const { orderXml, configXml, versionXml } = await unpackOpc(decrypted)

  if (!orderXml) {
    throw new Error('loadGpcFile: order.xml not found in the package')
  }

  // 5. Extract GPC version from version.xml
  let gpcVersion = ''
  if (versionXml) {
    const parser = new DOMParser()
    const vDoc = parser.parseFromString(versionXml, 'application/xml')
    for (const tag of ['Version', 'version', 'ApplicationVersion']) {
      const el = vDoc.querySelector(tag)
      if (el?.textContent) {
        gpcVersion = el.textContent.trim()
        break
      }
    }
  }

  // 6. Parse order
  const order = parseOrder(orderXml)

  // 7. Enrich article prices from config.xml if available
  if (configXml) {
    const priceMap = buildArticlePriceMap(configXml, order.priceList)
    enrichArticlePrices(order, priceMap)
  }

  // Prefer the catalog in config.xml; fall back to the legacy copy some older
  // order files embed.
  const licenseCatalog = configXml
    ? buildLicenseCatalogFromConfig(configXml)
    : buildLicenseCatalog(orderXml)
  const currencyRates = configXml ? parseCurrencyRates(configXml) : {}

  return {
    order,
    gpcVersion,
    pdbVersion: readSourceFileName(orderXml),
    sourceFile,
    rawOrderXml: orderXml,
    rawDecryptedBuffer: decrypted,
    originalItemNos: order.items.map(i => i.no),
    configXml: configXml ?? '',
    licenseCatalog,
    currencyRates,
    fileHandle,
  }
}

/**
 * Creates a new blank order ParseResult from optional cached PDB contents.
 * Used when the user clicks "New Order" (with or without a cached PDB).
 *
 * Strategy: clone the PDB's original ZIP (created by GPC's .NET Package API)
 * and inject order.xml + add the xml/gomorder relationship.  This guarantees
 * the OPC structure is byte-compatible with what GPC expects.
 */
export async function createNewOrder(
  pdb: { configXml: string; versionXml: string; rawBuffer?: ArrayBuffer } | null
): Promise<ParseResult> {
  // Record which catalog the order was started from. Every GPC-written file
  // carries it, and the header reads it to show the current catalog — without
  // it a new order claims to have none.
  const catalog = pdb ? readVersionName(pdb.configXml) : ''
  const orderXml = withSourceFileName(createBlankOrderXml(), catalog)
  const order = parseOrder(orderXml)

  const licenseCatalog = pdb
    ? buildLicenseCatalogFromConfig(pdb.configXml)
    : buildLicenseCatalog(orderXml)
  const currencyRates = pdb ? parseCurrencyRates(pdb.configXml) : {}

  // The package is assembled with the byte-exact container writer, not a
  // general-purpose zip library. GPC only opens a file whose ZIP matches what
  // .NET's System.IO.Packaging writes, and the previous implementation here
  // produced one it rejected: every entry stored rather than deflated, no OPC
  // growth hint, and a directory-removal pass that could take `_rels/.rels`
  // with it. That is the failure this project exists to fix.
  const encoder = new TextEncoder()
  const parts = new Map<string, Uint8Array>()

  if (pdb?.rawBuffer) {
    // Carry the catalog over from the product database as-is.
    const source = await readContainer(new Uint8Array(pdb.rawBuffer))
    for (const entry of source.entries) parts.set(entry.name, entry.data)
  }
  if (pdb?.configXml && !parts.has('config.xml')) parts.set('config.xml', encoder.encode(pdb.configXml))
  if (pdb?.versionXml && !parts.has('version.xml')) parts.set('version.xml', encoder.encode(pdb.versionXml))

  // The order and both OPC parts are always written fresh, so a new file never
  // inherits a stale or broken manifest.
  parts.set('order.xml', encoder.encode(orderXml))
  parts.set('_rels/.rels', buildRels({
    versionRelId: relationshipId(),
    configRelId: relationshipId(),
    orderRelId: relationshipId(),
  }))
  parts.set('[Content_Types].xml', buildContentTypes())

  const now = new Date()
  const entries: GpcEntry[] = []
  for (const name of ['version.xml', '_rels/.rels', 'config.xml', 'order.xml', '[Content_Types].xml']) {
    const data = parts.get(name)
    if (!data) continue
    entries.push({ name, data, method: name === '_rels/.rels' ? METHOD_STORED : METHOD_DEFLATE })
  }

  const zip = await writeContainer({
    entries,
    dosTime: (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
    dosDate: ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(),
  })
  const zipBuffer = zip.buffer as ArrayBuffer

  return {
    order,
    gpcVersion: '',
    pdbVersion: readSourceFileName(orderXml),
    sourceFile: 'New Order.gconfiguration',
    rawOrderXml: orderXml,
    rawDecryptedBuffer: zipBuffer,
    originalItemNos: [],
    configXml: pdb?.configXml ?? '',
    licenseCatalog,
    currencyRates,
    fileHandle: undefined,
    openInEditMode: true,
  }
}

// Re-export individual modules for consumers who want lower-level access
export { decryptGpcFile } from './decrypt.js'
export { unpackOpc } from './unpack.js'
export { parseOrder } from './parseOrder.js'
export { calcEndCustomerPrice, formatPrice, formatPercent, parseItemNo } from './pricing.js'
