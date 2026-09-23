/**
 * Targeted scanning of config.xml, instead of parsing it into a DOM.
 *
 * config.xml is the whole product catalog — around 45 MB of XML, of which
 * ArticlesData alone is two thirds. Building a DOM for that costs hundreds of
 * megabytes of nodes and seconds of wall clock, and opening a configuration did
 * it *three* times: once for the order's article prices, again for the search
 * catalog (which re-parsed to build the same map), and once more for currency
 * rates that live in 0.18% of the file.
 *
 * These scanners walk the string with indexOf instead. They rely on two
 * properties of the format, both verified against the corpus rather than
 * assumed:
 *
 *  - `<Article>` never nests inside another `<Article>` within `<ArticlesData>`
 *    (max nesting depth 1 across 3827 articles; `LinkedArticles` is always
 *    empty), so block boundaries can be found by scanning for the next close
 *    tag rather than counting depth.
 *  - The parts we need are contiguous sections, so the rest of the file can be
 *    skipped entirely.
 *
 * This is deliberately not a general XML parser. It handles the shapes this
 * catalog actually contains; anything structurally surprising yields no match
 * and the caller sees a missing field rather than wrong data.
 */

/** The inner text of the first `<tag>…</tag>`, or null. Not recursive. */
function readTag(block: string, tag: string, from = 0): string | null {
  const open = `<${tag}>`
  const start = block.indexOf(open, from)
  if (start < 0) return null
  const end = block.indexOf(`</${tag}>`, start + open.length)
  if (end < 0) return null
  return block.slice(start + open.length, end)
}

/** Trimmed text of a tag, or '' — the common case for catalog fields. */
function readText(block: string, tag: string): string {
  return readTag(block, tag)?.trim() ?? ''
}

/** The contents of a top-level section such as `<ArticlesData>`. */
export function sliceSection(xml: string, tag: string): string | null {
  const open = `<${tag}>`
  const start = xml.indexOf(open)
  if (start < 0) return null
  const end = xml.indexOf(`</${tag}>`, start)
  if (end < 0) return null
  return xml.slice(start + open.length, end)
}

/** Yields each `<tag>…</tag>` block's inner text within `section`. */
function* blocks(section: string, tag: string): Generator<string> {
  const open = `<${tag}>`
  const close = `</${tag}>`
  let at = 0
  for (;;) {
    const start = section.indexOf(open, at)
    if (start < 0) return
    const end = section.indexOf(close, start + open.length)
    if (end < 0) return
    yield section.slice(start + open.length, end)
    at = end + close.length
  }
}

function toFloat(text: string): number | null {
  if (!text || text.trim() === '') return null
  const v = parseFloat(text.trim())
  return isNaN(v) ? null : v
}

export interface ScannedArticle {
  longName: string
  sapNr: string
  unit: string
  category: string
  msrp: number | null
  dp: number | null
  currency: string
  /** Carries the `<software-support>` tag, so it belongs in a support screen. */
  isSoftwareSupport: boolean
}

/**
 * Every article with its price for `priceListName`, falling back to the first
 * price list when that name is absent — matching the DOM implementation this
 * replaces, including its fallback.
 */
export function scanArticles(configXml: string, priceListName: string): ScannedArticle[] {
  const section = sliceSection(configXml, 'ArticlesData')
  if (!section) return []

  const out: ScannedArticle[] = []
  for (const article of blocks(section, 'Article')) {
    const longName = readText(article, 'LongName')
    if (!longName) continue

    // The ordering tool uses MPG, not GroupLevel1, as the order's GroupLevel1.
    const mpg = readText(article, 'MPG')
    const category = mpg || readText(article, 'GroupLevel1')

    let chosen: string | null = null
    let first: string | null = null
    for (const priceList of blocks(article, 'ArticlePriceList')) {
      if (first === null) first = priceList
      if (readText(priceList, 'Name') === priceListName) { chosen = priceList; break }
    }
    const priceList = chosen ?? first
    if (!priceList) continue

    out.push({
      longName,
      sapNr: readText(article, 'SapNr'),
      unit: readText(article, 'Unit'),
      category,
      // The tag that sends an article to a support screen rather than a free
      // list. The picker needs it to know when to ask for a dongle. This
      // scanner reads raw text and does not resolve entities, and the catalog
      // writes the tag escaped.
      isSoftwareSupport: readText(article, 'FilterTags').includes('&lt;software-support&gt;'),
      msrp: toFloat(readText(priceList, 'Msrp')),
      dp: toFloat(readText(priceList, 'Dp')),
      currency: readText(priceList, 'Currency'),
    })
  }
  return out
}

/**
 * ISO → most recent exchange rate. Only CurrenciesData is touched, which is
 * well under a percent of the file.
 */
export function scanCurrencyRates(configXml: string): Record<string, number> {
  const section = sliceSection(configXml, 'CurrenciesData')
  if (!section) return {}

  const rates: Record<string, number> = {}
  const validFroms: Record<string, string> = {}
  for (const currency of blocks(section, 'Currency')) {
    const iso = readText(currency, 'Iso')
    const rate = toFloat(readText(currency, 'ExchangeRate'))
    if (!iso || rate === null) continue
    const validFrom = readText(currency, 'ValidFrom')
    // .NET ticks are fixed-width, so a lexicographic compare orders them.
    if (!validFroms[iso] || validFrom > validFroms[iso]) {
      rates[iso] = rate
      validFroms[iso] = validFrom
    }
  }
  return rates
}
