import type { OrderSummary, ParseResult } from '../types/order.js'
import { decryptGpcFile } from './decrypt.js'
import { unpackOpc } from './unpack.js'
import { parseOrder } from './parseOrder.js'
import { buildArticlePriceMap, buildArticleCatalog } from './parseConfig.js'
import { buildLicenseCatalog } from './parseLicenseCatalog.js'
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
export async function loadGpcFile(file: File, fileHandle?: FileSystemFileHandle): Promise<ParseResult> {
  // 1. Read file bytes
  const buffer = await file.arrayBuffer()

  // 2. Decrypt
  const decrypted = await decryptGpcFile(buffer)

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

  const articleCatalog = configXml ? buildArticleCatalog(configXml, order.priceList) : []
  const licenseCatalog = buildLicenseCatalog(orderXml)

  return {
    order,
    gpcVersion,
    sourceFile: file.name,
    rawOrderXml: orderXml,
    rawDecryptedBuffer: decrypted,
    originalItemNos: order.items.map(i => i.no),
    articleCatalog,
    licenseCatalog,
    fileHandle,
  }
}

/**
 * Creates a new blank order ParseResult from optional cached PDB contents.
 * Used when the user clicks "New Order" (with or without a cached PDB).
 */
export async function createNewOrder(
  pdb: { configXml: string; versionXml: string } | null
): Promise<ParseResult> {
  const orderXml = createBlankOrderXml()
  const order = parseOrder(orderXml)

  const articleCatalog = pdb ? buildArticleCatalog(pdb.configXml, order.priceList) : []
  const licenseCatalog = buildLicenseCatalog(orderXml)

  // For a new order we need a minimal ZIP with order.xml + config.xml.
  // We use JSZip to create the OPC structure.
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  zip.file('order.xml', orderXml)
  if (pdb?.configXml) zip.file('config.xml', pdb.configXml)
  if (pdb?.versionXml) zip.file('version.xml', pdb.versionXml)
  // OPC structure required by GPC — must have _rels/.rels with xml/gomorder relationship
  // and correct content types (text/xml + rels type), otherwise GPC rejects the file.
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="text/xml" /><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /></Types>')
  const rels = [
    '<Relationship Type="xml/gomorder" Target="/order.xml" Id="R1" />',
    pdb?.configXml ? '<Relationship Type="xml/gomconfig" Target="/config.xml" Id="R2" />' : '',
    pdb?.versionXml ? '<Relationship Type="xml/gomversion" Target="/version.xml" Id="R3" />' : '',
  ].filter(Boolean).join('')
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`)
  const zipBuffer = await zip.generateAsync({ type: 'arraybuffer' })

  return {
    order,
    gpcVersion: '',
    sourceFile: 'New Order.gconfiguration',
    rawOrderXml: orderXml,
    rawDecryptedBuffer: zipBuffer,
    originalItemNos: [],
    articleCatalog,
    licenseCatalog,
    fileHandle: undefined,
    openInEditMode: true,
  }
}

// Re-export individual modules for consumers who want lower-level access
export { decryptGpcFile } from './decrypt.js'
export { unpackOpc } from './unpack.js'
export { parseOrder } from './parseOrder.js'
export { calcEndCustomerPrice, formatPrice, formatPercent, parseItemNo } from './pricing.js'
