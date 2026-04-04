/**
 * Parses config.xml (the AdministrationData product database) to build a
 * lookup map of article prices for a given price list.
 *
 * config.xml is large (thousands of articles) but we only need one pass
 * to build the map — O(n) with no repeated lookups.
 */

export interface ArticlePrices {
  msrp: number | null
  dp: number | null
  sapNr: string
  unit: string
  category: string
}

export interface ArticleCatalogEntry {
  longName: string
  sapNr: string
  unitMsrp: number | null
  unitDp: number | null
  unit: string
  category: string
}

/**
 * Returns every article in config.xml as a flat sorted array for use in
 * the product-search picker.  Prices are resolved for the given priceList
 * (falls back to first available, same logic as buildArticlePriceMap).
 */
export function buildArticleCatalog(
  configXml: string,
  priceListName: string
): ArticleCatalogEntry[] {
  const map = buildArticlePriceMap(configXml, priceListName)
  const entries: ArticleCatalogEntry[] = []
  for (const [longName, prices] of map) {
    entries.push({
      longName,
      sapNr: prices.sapNr,
      unitMsrp: prices.msrp,
      unitDp: prices.dp,
      unit: prices.unit,
      category: prices.category,
    })
  }
  entries.sort((a, b) => a.longName.localeCompare(b.longName))
  return entries
}

/** Parse a decimal string, return null if absent or NaN. */
function toFloat(text: string | null | undefined): number | null {
  if (!text || text.trim() === '') return null
  const v = parseFloat(text.trim())
  return isNaN(v) ? null : v
}

/**
 * Build a Map<LongName, ArticlePrices> for the given price list name.
 * Falls back to the first available price list if the named one is absent
 * (handles cases where the order's PriceList string doesn't exactly match).
 */
export function buildArticlePriceMap(
  configXml: string,
  priceListName: string
): Map<string, ArticlePrices> {
  const map = new Map<string, ArticlePrices>()

  const parser = new DOMParser()
  const doc = parser.parseFromString(configXml, 'application/xml')

  if (doc.querySelector('parsererror')) return map

  const articlesData = doc.getElementsByTagName('ArticlesData')[0]
  if (!articlesData) return map

  for (const article of Array.from(articlesData.getElementsByTagName('Article'))) {
    const longName = article.getElementsByTagName('LongName')[0]?.textContent?.trim()
    if (!longName) continue

    const sapNr = article.getElementsByTagName('SapNr')[0]?.textContent?.trim() ?? ''
    const unit = article.getElementsByTagName('Unit')[0]?.textContent?.trim() ?? ''
    // The GPC ordering tool uses MPG (not GroupLevel1) as ConfigurationItem.GroupLevel1 in the
    // order XML — e.g. "Calibration Object" articles are categorised as "Spareparts" (the MPG).
    const mpg = article.getElementsByTagName('MPG')[0]?.textContent?.trim() ?? ''
    const category = mpg || article.getElementsByTagName('GroupLevel1')[0]?.textContent?.trim() ?? ''

    const priceLists = Array.from(article.getElementsByTagName('ArticlePriceList'))
    if (priceLists.length === 0) continue

    // Prefer exact match on price list name; fall back to first available
    const targetPl =
      priceLists.find(
        (pl) =>
          pl.getElementsByTagName('Name')[0]?.textContent?.trim() === priceListName
      ) ?? priceLists[0]

    const msrp = toFloat(targetPl.getElementsByTagName('Msrp')[0]?.textContent)
    const dp = toFloat(targetPl.getElementsByTagName('Dp')[0]?.textContent)

    map.set(longName, { msrp, dp, sapNr, unit, category })
  }

  return map
}
