/**
 * Article prices and currency rates from config.xml.
 *
 * The scanning lives in configScan.ts: config.xml is ~45 MB and building a DOM
 * for it is the dominant cost of opening a configuration. These functions keep
 * their original signatures and delegate.
 */
import { scanArticles, scanCurrencyRates } from './configScan.js'

export interface ArticlePrices {
  msrp: number | null
  dp: number | null
  sapNr: string
  unit: string
  category: string
  currency: string  // ISO currency of the price list (e.g. "EUR")
}

export interface ArticleCatalogEntry {
  longName: string
  sapNr: string
  unitMsrp: number | null
  unitDp: number | null
  unit: string
  category: string
  currency: string  // ISO currency the prices are denominated in
  /**
   * A software maintenance agreement, which cannot be added on its own: it
   * needs a dongle and a contract term. See `gpc/sma.ts`.
   */
  isSoftwareSupport: boolean
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
  const entries: ArticleCatalogEntry[] = scanArticles(configXml, priceListName).map((a) => ({
    longName: a.longName,
    sapNr: a.sapNr,
    unitMsrp: a.msrp,
    unitDp: a.dp,
    unit: a.unit,
    category: a.category,
    currency: a.currency,
    isSoftwareSupport: a.isSoftwareSupport,
  }))
  entries.sort((a, b) => a.longName.localeCompare(b.longName))
  return entries
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
  for (const a of scanArticles(configXml, priceListName)) {
    map.set(a.longName, {
      msrp: a.msrp,
      dp: a.dp,
      sapNr: a.sapNr,
      unit: a.unit,
      category: a.category,
      currency: a.currency,
    })
  }
  return map
}

/**
 * Parses CurrenciesData from config.xml and returns a map of ISO → latest
 * exchange rate (relative to EUR, i.e. EUR=1.00, USD=1.15 means 1 EUR = 1.15 USD).
 * For each ISO, picks the entry with the highest ValidFrom (most recent).
 */
export function parseCurrencyRates(configXml: string): Record<string, number> {
  return scanCurrencyRates(configXml)
}
