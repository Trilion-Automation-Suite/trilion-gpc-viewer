import type { OrderSummary, ParseResult } from '../types/order.js'
import { decryptGpcFile } from './decrypt.js'
import { unpackOpc } from './unpack.js'
import { parseOrder } from './parseOrder.js'
import { buildArticlePriceMap } from './parseConfig.js'

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
export async function loadGpcFile(file: File): Promise<ParseResult> {
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

  return {
    order,
    gpcVersion,
    sourceFile: file.name,
  }
}

// Re-export individual modules for consumers who want lower-level access
export { decryptGpcFile } from './decrypt.js'
export { unpackOpc } from './unpack.js'
export { parseOrder } from './parseOrder.js'
export { calcEndCustomerPrice, formatPrice, formatPercent, parseItemNo } from './pricing.js'
