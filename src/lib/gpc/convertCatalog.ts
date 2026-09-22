/**
 * Re-targeting an order at a newer product database.
 *
 * An order carries a frozen copy of everything it used: each line item holds a
 * cloned catalog configuration item, and each article is a cloned catalog
 * article with its whole price-list table. So an order built on an old catalog
 * keeps old names and old prices forever, even when opened against a new one.
 *
 * Converting is a *substitution on an existing order*, not a rebuild: every
 * cloned subtree is swapped for the current one and the totals are recomputed.
 * That is what makes it work for line-item shapes the add-item path cannot yet
 * construct from scratch — the order's own structure is preserved throughout.
 *
 * Nothing is dropped or guessed. An article that cannot be matched confidently
 * is left exactly as it was and reported, so the result is always openable and
 * the caller can see precisely what needs a human.
 */
import type { GpcContainer } from './container.ts'
import { readPdbConfig } from './blankOrder.ts'
import { decimalString, priceArticle, recalculateOrder } from './addItem.ts'
import { fromInt, parseDecimalOrNull } from './decimal.ts'
import { scanRoundingRules } from './roundingRules.ts'
import type { ElementValue, OrderDocument, OrderValue } from './orderXml.ts'

/** `AbasNr` uses this as "no value"; it must not be treated as a key. */
const ABSENT = '-'

/** How an article was identified in the target catalog, best first. */
export type MatchKind = 'sapNr+traits' | 'sapNr+longName' | 'sapNr' | 'abasNr' | 'longName'

export interface ConversionIssue {
  kind: 'unmatched' | 'ambiguous'
  longName: string | null
  sapNr: string | null
  abasNr: string | null
  /** For `ambiguous`: the competing target articles, by long name. */
  candidates?: string[]
}

export interface PriceChange {
  longName: string | null
  field: string
  from: string
  to: string
}

export interface ConversionReport {
  /** `VersionName` of the catalog converted to. */
  targetCatalog: string | null
  articles: { total: number; replaced: number; left: number }
  matchedBy: Partial<Record<MatchKind, number>>
  configurationItems: { replaced: number; renamed: Array<{ from: string; to: string }>; unmatched: string[] }
  priceChanges: PriceChange[]
  /** Line items whose totals are not a plain sum, so they were left alone. */
  totalsLeft: string[]
  /**
   * Dependent-list line items, which are NOT converted. Their selections live in
   * `SectionArticleScreenData`, which carries only a display `Name` and a price —
   * no SapNr, no embedded article — and the catalog source for those section
   * prices has not been located. Converting the rest of the order while leaving
   * these at their old prices is a partial conversion, so it is reported loudly
   * rather than left for the reader to notice.
   */
  dependentListsNotConverted: string[]
  issues: ConversionIssue[]
}

export interface ConvertOptions {
  /** Recompute prices from the new catalog. On by default. */
  reprice?: boolean
  /** Move the order onto the new catalog's current currency row. On by default. */
  updateCurrency?: boolean
}

// ── small helpers ─────────────────────────────────────────────────────────────

function text(e: ElementValue | null, name: string): string | null {
  const v = e?.members.find((m) => m.name === name)?.value
  return v && v.kind === 'text' ? v.value : null
}

function key(e: ElementValue, name: string): string | null {
  const v = text(e, name)
  return v && v !== ABSENT && v.trim() !== '' ? v : null
}

function sub(e: ElementValue, name: string): ElementValue | null {
  const v = e.members.find((m) => m.name === name)?.value
  return v && v.kind === 'element' ? v : null
}

function joinStrings(e: ElementValue, name: string): string {
  const list = sub(e, name)
  if (!list) return ''
  return list.members.map((m) => (m.value.kind === 'text' ? m.value.value : '')).join('|')
}

function clone(v: OrderValue): OrderValue {
  if (v.kind !== 'element') return { ...v }
  return { kind: 'element', type: v.type, members: v.members.map((m) => ({ name: m.name, value: clone(m.value) })) }
}

function listOf(parent: ElementValue, section: string, list: string): ElementValue[] {
  const s = sub(parent, section)
  const l = s ? sub(s, list) : null
  if (!l) return []
  return l.members.map((m) => m.value).filter((x): x is ElementValue => x.kind === 'element')
}

// ── the target catalog index ──────────────────────────────────────────────────

interface CatalogIndex {
  bySap: Map<string, ElementValue[]>
  byAbas: Map<string, ElementValue[]>
  byName: Map<string, ElementValue[]>
  itemsByName: Map<string, ElementValue>
  /**
   * Keyed by `ItemType` + `WorksheetArticleFilter`. Names are not stable across
   * catalogs — PDB290 merged "Spare Parts" and "Tools, Screws & Cases" into
   * "Spare Parts & Tools" — but the filter tag survived the merge, so it is the
   * key that actually identifies the same item.
   */
  itemsByFilter: Map<string, ElementValue>
  versionName: string | null
}

function itemFilterKey(item: ElementValue): string | null {
  const type = key(item, 'ItemType')
  const filter = key(item, 'WorksheetArticleFilter')
  return type && filter ? `${type}\u0000${filter}` : null
}

function indexCatalog(config: ElementValue): CatalogIndex {
  const bySap = new Map<string, ElementValue[]>()
  const byAbas = new Map<string, ElementValue[]>()
  const byName = new Map<string, ElementValue[]>()
  const push = (map: Map<string, ElementValue[]>, k: string | null, a: ElementValue) => {
    if (!k) return
    const bucket = map.get(k)
    if (bucket) bucket.push(a)
    else map.set(k, [a])
  }
  for (const a of listOf(config, 'ArticlesData', 'Articles')) {
    push(bySap, key(a, 'SapNr'), a)
    push(byAbas, key(a, 'AbasNr'), a)
    push(byName, key(a, 'LongName'), a)
  }
  const itemsByName = new Map<string, ElementValue>()
  const itemsByFilter = new Map<string, ElementValue>()
  for (const item of listOf(config, 'ConfigurationItemsData', 'ConfigurationItems')) {
    const n = key(item, 'Name')
    if (n && !itemsByName.has(n)) itemsByName.set(n, item)
    const fk = itemFilterKey(item)
    if (fk && !itemsByFilter.has(fk)) itemsByFilter.set(fk, item)
  }
  return {
    bySap, byAbas, byName, itemsByName, itemsByFilter,
    versionName: text(sub(config, 'ParametersData'), 'VersionName'),
  }
}

/**
 * Finds the article's counterpart in the new catalog.
 *
 * SapNr is the stable identity but is *not* unique — a code can carry both a
 * product and its extension (e.g. "SMA for X" and "EXT SMA for X"). So a SapNr
 * hit with more than one candidate is only accepted when the trait values or the
 * long name single one out; otherwise it is reported as ambiguous rather than
 * guessed at.
 */
function matchArticle(
  source: ElementValue,
  index: CatalogIndex
): { article: ElementValue; by: MatchKind } | { ambiguous: ElementValue[] } | null {
  const sap = key(source, 'SapNr')
  if (sap) {
    const hits = index.bySap.get(sap)
    if (hits && hits.length === 1) return { article: hits[0], by: 'sapNr' }
    if (hits && hits.length > 1) {
      const traits = joinStrings(source, 'SapCharaterTraitValues')
      const byTraits = hits.filter((h) => joinStrings(h, 'SapCharaterTraitValues') === traits)
      if (byTraits.length === 1) return { article: byTraits[0], by: 'sapNr+traits' }
      const name = key(source, 'LongName')
      const byName = hits.filter((h) => key(h, 'LongName') === name)
      if (byName.length === 1) return { article: byName[0], by: 'sapNr+longName' }
      return { ambiguous: hits }
    }
  }
  const abas = key(source, 'AbasNr')
  if (abas) {
    const hits = index.byAbas.get(abas)
    if (hits && hits.length === 1) return { article: hits[0], by: 'abasNr' }
  }
  const name = key(source, 'LongName')
  if (name) {
    const hits = index.byName.get(name)
    if (hits && hits.length === 1) return { article: hits[0], by: 'longName' }
  }
  return null
}

// ── conversion ────────────────────────────────────────────────────────────────

/**
 * Converts an order onto `targetPdb`'s catalog, in place. Returns a report of
 * everything that changed and everything that needs a human.
 */
export function convertOrderToCatalog(
  order: OrderDocument,
  targetPdb: GpcContainer,
  options: ConvertOptions = {}
): ConversionReport {
  const reprice = options.reprice !== false
  const updateCurrency = options.updateCurrency !== false
  const config = readPdbConfig(targetPdb)
  const index = indexCatalog(config)

  const report: ConversionReport = {
    targetCatalog: index.versionName,
    articles: { total: 0, replaced: 0, left: 0 },
    matchedBy: {},
    configurationItems: { replaced: 0, renamed: [], unmatched: [] },
    priceChanges: [],
    totalsLeft: [],
    dependentListsNotConverted: [],
    issues: [],
  }

  if (updateCurrency) moveToCurrentCurrency(order, config)
  const priceList = text(order.root, 'PriceList')
  const currency = sub(order.root, 'Currency')
  const rate = parseDecimalOrNull(text(currency, 'ExchangeRate')) ?? fromInt(1)
  const currencyIso = text(currency, 'Iso') ?? ''
  // The new catalog's rounding rules, not the old order's: prices move when a
  // catalog changes its bands, and converting has to follow the new ones.
  const rules = scanRoundingRules(configXml(targetPdb))

  convertNode(order.root, { index, report, reprice, priceList, rate, rules, currencyIso })

  const version = index.versionName
  if (version) setText(order.root, 'SourceFileName', version)

  // Totals are recomputed from the converted line items, so the order's own
  // figures never disagree with the articles it now carries.
  recalculateOrder(order, targetPdb, {
    distributor: text(order.root, 'Distributor') ?? undefined,
    homCenter: text(order.root, 'HOMCenter') ?? undefined,
  })

  return report
}

interface Ctx {
  index: CatalogIndex
  report: ConversionReport
  reprice: boolean
  priceList: string | null
  rate: import('./decimal.ts').Dec
  rules: import('./roundingRules.ts').RoundingRule[]
  currencyIso: string
}

/** The raw config.xml inside a catalog container. */
function configXml(pdb: GpcContainer): string {
  const entry = pdb.entries.find((e) => e.name === 'config.xml')
  if (!entry) throw new Error('convertCatalog: catalog has no config.xml')
  return new TextDecoder('utf-8').decode(entry.data)
}

/**
 * Walks the order, swapping cloned catalog data for the current equivalent.
 *
 * `ConfigurationItem` subtrees are replaced whole and then *not* descended into:
 * the articles inside them (`ProductionArticles`) are catalog data that arrived
 * with the replacement, not order line items, and re-pricing them would corrupt
 * the item.
 */
function convertNode(node: ElementValue, ctx: Ctx): void {
  for (const member of node.members) {
    const value = member.value
    if (value.kind !== 'element') continue

    if (member.name === 'ConfigurationItem') {
      replaceConfigurationItem(member as { name: string; value: ElementValue }, ctx)
      continue
    }

    if (member.name === 'Article') {
      convertArticle(node, member as { name: string; value: ElementValue }, ctx)
      continue
    }

    // A dependent-list screen: its priced selections are Sections, not Articles.
    if (value.members.some((m) => m.name === 'Sections')) {
      const itemName = key(sub(value, 'ConfigurationItem') ?? value, 'Name') ?? '(unnamed)'
      if (!ctx.report.dependentListsNotConverted.includes(itemName)) {
        ctx.report.dependentListsNotConverted.push(itemName)
      }
      // The cloned catalog item is still refreshed; only the section prices are
      // left, so the item's own totals must be left alone to stay consistent.
      const ci = value.members.find((m) => m.name === 'ConfigurationItem')
      if (ci && ci.value.kind === 'element') {
        replaceConfigurationItem(ci as { name: string; value: ElementValue }, ctx)
      }
      continue
    }

    const isScreen = value.members.some((m) => m.name === 'TotalDp' || m.name === 'TotalMsrp')
    if (!isScreen) { convertNode(value, ctx); continue }

    // Only rewrite a screen's totals when they demonstrably *were* the sum of
    // its lines before conversion. Support screens price on contract months and
    // volume discounts, not a plain sum, and silently "fixing" those would
    // corrupt them.
    const beforeSum = sumLines(value)
    const reconciled =
      matches(text(value, 'TotalMsrp'), beforeSum.msrp) && matches(text(value, 'TotalDp'), beforeSum.dp)
    convertNode(value, ctx)
    if (reconciled) {
      const afterSum = sumLines(value)
      setIfPresent(value, 'TotalMsrp', decimalString(afterSum.msrp))
      setIfPresent(value, 'TotalDp', decimalString(afterSum.dp))
    } else if (beforeSum.lines > 0) {
      ctx.report.totalsLeft.push(key(sub(value, 'ConfigurationItem') ?? value, 'Name') ?? '(unnamed item)')
    }
  }
}

function replaceConfigurationItem(member: { name: string; value: ElementValue }, ctx: Ctx): void {
  const name = key(member.value, 'Name')
  const fk = itemFilterKey(member.value)
  const replacement =
    (fk ? ctx.index.itemsByFilter.get(fk) : undefined) ??
    (name ? ctx.index.itemsByName.get(name) : undefined)
  if (!replacement) {
    if (!name) return
    // Items do get renamed between catalogs; leaving the old clone in place
    // keeps the file valid, so this is reported rather than forced.
    if (!ctx.report.configurationItems.unmatched.includes(name)) {
      ctx.report.configurationItems.unmatched.push(name)
    }
    return
  }
  const newName = key(replacement, 'Name')
  member.value = clone(replacement) as ElementValue
  ctx.report.configurationItems.replaced++
  if (name && newName && newName !== name &&
      !ctx.report.configurationItems.renamed.some((r) => r.from === name)) {
    ctx.report.configurationItems.renamed.push({ from: name, to: newName })
  }
}

function convertArticle(
  parent: ElementValue,
  member: { name: string; value: ElementValue },
  ctx: Ctx
): void {
  const source = member.value
  ctx.report.articles.total++
  const longName = key(source, 'LongName')
  const sapNr = key(source, 'SapNr')
  const abasNr = key(source, 'AbasNr')

  const match = matchArticle(source, ctx.index)
  if (!match) {
    ctx.report.articles.left++
    ctx.report.issues.push({ kind: 'unmatched', longName, sapNr, abasNr })
    return
  }
  if ('ambiguous' in match) {
    ctx.report.articles.left++
    ctx.report.issues.push({
      kind: 'ambiguous',
      longName, sapNr, abasNr,
      candidates: match.ambiguous.map((a) => key(a, 'LongName') ?? '(unnamed)'),
    })
    return
  }

  const newName = key(match.article, 'LongName')
  member.value = clone(match.article) as ElementValue
  ctx.report.articles.replaced++
  ctx.report.matchedBy[match.by] = (ctx.report.matchedBy[match.by] ?? 0) + 1
  if (newName && longName && newName !== longName) {
    ctx.report.priceChanges.push({ longName, field: 'LongName', from: longName, to: newName })
  }

  if (ctx.reprice) repriceLine(parent, member.value, longName ?? newName, ctx)
}

/**
 * Updates the `Msrp`/`Dp` that sit beside an `Article`. Only those two: the
 * overwrite and sum fields are the operator's, not the catalog's.
 */
function repriceLine(parent: ElementValue, article: ElementValue, label: string | null, ctx: Ctx): void {
  if (!ctx.priceList) return
  const hasPricing = parent.members.some((m) => m.name === 'Msrp' || m.name === 'Dp')
  if (!hasPricing) return

  let priced
  try {
    priced = priceArticle(article, ctx.priceList, ctx.rate, ctx.rules, ctx.currencyIso)
  } catch {
    // The new catalog may not carry this order's price list for this article.
    ctx.report.issues.push({
      kind: 'unmatched',
      longName: label,
      sapNr: key(article, 'SapNr'),
      abasNr: key(article, 'AbasNr'),
    })
    return
  }

  const amount = Number(text(parent, 'Amount') ?? '1')
  for (const [field, value] of [['Msrp', priced.msrp], ['Dp', priced.dp]] as const) {
    const current = text(parent, field)
    const next = decimalString(value)
    if (current !== null && current !== next) {
      ctx.report.priceChanges.push({ longName: label, field, from: current, to: next })
    }
    if (current !== null) setText(parent, field, next)
  }

  void amount
}

/** Sums `Msrp`/`Dp` x `Amount` over every priced line inside a screen. */
function sumLines(screen: ElementValue): { msrp: number; dp: number; lines: number } {
  let msrp = 0, dp = 0, lines = 0
  const walk = (el: ElementValue, insideItem: boolean) => {
    for (const m of el.members) {
      if (m.value.kind !== 'element') continue
      if (m.name === 'ConfigurationItem') continue  // catalog data, never a line
      const isLine = !insideItem && m.value.members.some((x) => x.name === 'Article')
        && m.value.members.some((x) => x.name === 'Msrp' || x.name === 'Dp')
      if (isLine) {
        const amount = Number(text(m.value, 'Amount') ?? '1')
        msrp += Number(text(m.value, 'Msrp') ?? '0') * amount
        dp += Number(text(m.value, 'Dp') ?? '0') * amount
        lines++
      }
      walk(m.value, insideItem)
    }
  }
  walk(screen, false)
  return { msrp, dp, lines }
}

/** Tolerant compare: the stored value may carry a different decimal scale. */
function matches(stored: string | null, computed: number): boolean {
  if (stored === null) return true
  const a = Number(stored)
  return Number.isFinite(a) && Math.abs(a - computed) < 0.005
}

function setIfPresent(el: ElementValue, name: string, value: string): void {
  if (el.members.some((m) => m.name === name)) setText(el, name, value)
}

/** Moves the order onto the newest currency row for its ISO in the new catalog. */
function moveToCurrentCurrency(order: OrderDocument, config: ElementValue): void {
  const currency = sub(order.root, 'Currency')
  if (!currency) return
  const iso = text(currency, 'Iso')
  if (!iso) return
  const rows = listOf(config, 'CurrenciesData', 'Currencies').filter((r) => text(r, 'Iso') === iso)
  if (!rows.length) return
  let newest = rows[0]
  for (const r of rows) {
    if (BigInt(text(r, 'ValidFrom') ?? '0') > BigInt(text(newest, 'ValidFrom') ?? '0')) newest = r
  }
  const member = order.root.members.find((m) => m.name === 'Currency')
  if (member) member.value = clone(newest)
}

function setText(el: ElementValue, name: string, value: string): void {
  const member = el.members.find((m) => m.name === name)
  if (member) member.value = { kind: 'text', type: null, value }
}
