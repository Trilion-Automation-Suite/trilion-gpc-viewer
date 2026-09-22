/**
 * Adding a line item to an order.
 *
 * The semantics matter and are not obvious (spec §3): GPC does **not** invent a
 * configuration item around an article. It picks the *catalog* configuration item
 * the article belongs to, clones it verbatim into the order, and puts the article
 * inside it. Confirmed against reference files: both the `<ConfigurationItem>`
 * and the `<Article>` subtrees appear byte-for-byte in the PDB's `config.xml`,
 * differing only in indentation.
 *
 * The article/item linkage is the filter tag: a FreeList configuration item's
 * `WorksheetArticleFilter` is `<Articles>` + tag, and the article's `FilterTags`
 * carries that tag. The match is on the whole tag, never a substring — catalogs
 * contain tags that are suffixes of one another.
 */
import type { GpcContainer } from './container.ts'
import type { ElementValue, OrderDocument, OrderMember, OrderValue } from './orderXml.ts'
import { setMember } from './orderXml.ts'
import { readPdbConfig } from './blankOrder.ts'

const ARTICLES_FILTER_PREFIX = '<Articles>'

const txt = (value: string): OrderValue => ({ kind: 'text', type: null, value })
const nil = (): OrderValue => ({ kind: 'nil' })
const el = (members: Array<[string, OrderValue]>): ElementValue => ({
  kind: 'element',
  type: null,
  members: members.map(([name, value]) => ({ name, value })),
})

function field(e: ElementValue, name: string): string | null {
  const v = e.members.find((m) => m.name === name)?.value
  return v && v.kind === 'text' ? v.value : null
}

function sub(e: ElementValue, name: string): ElementValue | null {
  const v = e.members.find((m) => m.name === name)?.value
  return v && v.kind === 'element' ? v : null
}

function section(config: ElementValue, name: string): ElementValue {
  const v = config.members.find((m) => m.name === name)?.value
  if (!v || v.kind !== 'element') throw new Error(`addItem: PDB config has no <${name}>`)
  return v
}

/** Deep copy, so an order never aliases the catalog it was built from. */
function clone(v: OrderValue): OrderValue {
  if (v.kind !== 'element') return { ...v }
  return { kind: 'element', type: v.type, members: v.members.map((m) => ({ name: m.name, value: clone(m.value) })) }
}

function listItems(parent: ElementValue, listName: string): ElementValue[] {
  const list = sub(parent, listName)
  if (!list) return []
  return list.members.map((m) => m.value).filter((x): x is ElementValue => x.kind === 'element')
}

// ── catalog lookups ───────────────────────────────────────────────────────────

/** The catalog article with this `LongName`. */
export function findArticle(config: ElementValue, longName: string): ElementValue {
  for (const a of listItems(section(config, 'ArticlesData'), 'Articles')) {
    if (field(a, 'LongName') === longName) return a
  }
  throw new Error(`addItem: PDB has no article ${JSON.stringify(longName)}`)
}

/**
 * The FreeList configuration item whose filter tag the article carries.
 * Exact tag match: a tag must not select an item whose tag merely contains it.
 */
export function findFreeListItem(config: ElementValue, article: ElementValue): ElementValue {
  const tags = (field(article, 'FilterTags') ?? '').split(/[,;\s]+/).filter(Boolean)
  const items = listItems(section(config, 'ConfigurationItemsData'), 'ConfigurationItems')
  for (const item of items) {
    if (field(item, 'ItemType') !== 'FreeList') continue
    const filter = field(item, 'WorksheetArticleFilter') ?? ''
    if (!filter.startsWith(ARTICLES_FILTER_PREFIX)) continue
    const tag = filter.slice(ARTICLES_FILTER_PREFIX.length)
    if (tags.includes(tag)) return item
  }
  throw new Error(
    `addItem: no FreeList configuration item matches filter tags ${JSON.stringify(tags)}`
  )
}

// ── pricing ───────────────────────────────────────────────────────────────────

/**
 * Catalog prices are in euro; an order carries them in its own currency, scaled
 * by the currency row's exchange rate. Confirmed against reference files: the
 * order's price-list row times the currency's exchange rate reproduces the
 * recorded Dp and Msrp exactly.
 */
export interface ArticlePricing {
  dp: number
  msrp: number
}

export function priceArticle(
  article: ElementValue,
  priceListName: string,
  exchangeRate: number
): ArticlePricing {
  const rows = listItems(article, 'ArticlePriceLists')
  const row = rows.find((r) => field(r, 'Name') === priceListName)
  if (!row) {
    throw new Error(`addItem: article has no price list ${JSON.stringify(priceListName)}`)
  }
  const dp = Number(field(row, 'Dp') ?? '0')
  const msrp = Number(field(row, 'Msrp') ?? '0')
  return { dp: dp * exchangeRate, msrp: msrp * exchangeRate }
}

/**
 * .NET decimal formatting: no exponent, no trailing-zero padding beyond the
 * value's own scale. `decimals` forces a scale where the reference files show
 * one — .NET preserves `decimal` scale through arithmetic, so some fields carry
 * trailing zeros a plain number would drop.
 */
export function decimalString(value: number, decimals = 0): string {
  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals
  return decimals > 0 ? rounded.toFixed(decimals) : String(rounded)
}

// ── the add-item path ─────────────────────────────────────────────────────────

export interface AddArticleOptions {
  /** Defaults to the order's own `PriceList`. */
  priceListName?: string
  /** Defaults to the order's own `Currency/ExchangeRate`. */
  exchangeRate?: number
  amount?: number
}

/**
 * Adds an article to the order the way GPC does: clone the catalog item, clone
 * the article, nest the article inside the item. Returns the same document.
 */
export function addArticle(
  order: OrderDocument,
  pdb: GpcContainer,
  articleName: string,
  options: AddArticleOptions = {}
): OrderDocument {
  const config = readPdbConfig(pdb)
  const article = findArticle(config, articleName)
  const item = findFreeListItem(config, article)

  const priceListName = options.priceListName ?? orderField(order, 'PriceList')
  if (!priceListName) throw new Error('addItem: order has no PriceList')
  const exchangeRate = options.exchangeRate ?? orderExchangeRate(order)
  const amount = options.amount ?? 1

  const { dp, msrp } = priceArticle(article, priceListName, exchangeRate)
  const totalDp = dp * amount
  const totalMsrp = msrp * amount

  const screen = el([
    ['ConfigurationItem', clone(item)],
    ['UseInCalculation', txt('true')],
    ['No', txt(String(nextItemNumber(order)))],
    ['TotalDp', txt(decimalString(totalDp))],
    ['TotalMsrp', txt(decimalString(totalMsrp))],
    ['Discount', nil()],
    ['IsDiscountPercentage', txt('false')],
    ['IsHidden', txt('false')],
    ['FreeListArticles', el([
      ['FreeListArticle', el([
        ['Amount', txt(String(amount))],
        ['Step', txt('1')],
        ['Article', clone(article)],
        ['OverwrittenDp', nil()],
        ['OverwrittenMrsp', nil()],
        ['PriceOnRequest', txt('false')],
        ['EuroMsrp', nil()],
        ['Msrp', txt(decimalString(msrp))],
        ['Dp', txt(decimalString(dp))],
        ['SumMsrp', nil()],
        ['SumDp', nil()],
        ['CustomQuantityDiscount', nil()],
      ])],
    ])],
  ])

  appendTo(order.root, 'FreeListArticlesData', 'FreeListScreenData', screen)
  return order
}

function orderField(order: OrderDocument, name: string): string | null {
  const v = order.root.members.find((m) => m.name === name)?.value
  return v && v.kind === 'text' ? v.value : null
}

function orderExchangeRate(order: OrderDocument): number {
  const currency = order.root.members.find((m) => m.name === 'Currency')?.value
  if (!currency || currency.kind !== 'element') throw new Error('addItem: order has no Currency')
  return Number(field(currency, 'ExchangeRate') ?? '1')
}

/** Line items are numbered from 1 across every screen-data list. */
function nextItemNumber(order: OrderDocument): number {
  let n = 0
  for (const listName of ['DependentListsData', 'FreeArticlesData', 'FreeListArticlesData', 'SupportArticlesData']) {
    const list = order.root.members.find((m) => m.name === listName)?.value
    if (list && list.kind === 'element') n += list.members.length
  }
  return n + 1
}

function appendTo(root: ElementValue, listName: string, itemName: string, value: OrderValue): void {
  const list = root.members.find((m) => m.name === listName)?.value
  if (!list || list.kind !== 'element') throw new Error(`addItem: order has no <${listName}>`)
  const entry: OrderMember = { name: itemName, value }
  list.members.push(entry)
}

// ── order-level rollup ────────────────────────────────────────────────────────

/**
 * What the operator chose, as opposed to what the catalog determines. These are
 * inputs to the scenario, not pinned non-determinism: two runs with the same
 * choices produce the same bytes.
 */
export interface OrderScenario {
  /** Distributor Id, as listed in the PDB's DistributorData. */
  distributor?: string
  /** HOM center Id. */
  homCenter?: string
  /** Freight term; empty unless the operator picked one. */
  freightTerm?: string
  /** Payment term; empty unless the operator picked one. */
  paymentTerm?: string
}

/**
 * Recomputes the order-level totals and status fields GPC writes on save.
 *
 * Prices roll up from the line items; the handling-fee name and source file name
 * come from the PDB's ParametersData; `ReasonUnclean` is derived by comparing the
 * order's freight and payment terms against the distributor's standard ones.
 */
export function recalculateOrder(
  order: OrderDocument,
  pdb: GpcContainer,
  scenario: OrderScenario = {}
): OrderDocument {
  const config = readPdbConfig(pdb)
  const params = section(config, 'ParametersData')

  let totalDp = 0
  let totalMsrp = 0
  for (const listName of ['DependentListsData', 'FreeArticlesData', 'FreeListArticlesData', 'SupportArticlesData']) {
    const list = order.root.members.find((m) => m.name === listName)?.value
    if (!list || list.kind !== 'element') continue
    for (const m of list.members) {
      if (m.value.kind !== 'element') continue
      if (field(m.value, 'UseInCalculation') === 'false') continue
      totalDp += Number(field(m.value, 'TotalDp') ?? '0')
      totalMsrp += Number(field(m.value, 'TotalMsrp') ?? '0')
    }
  }

  // Reference PDBs set both handling-fee thresholds low enough that the fee
  // always applies, and the recorded fee is 0 — present but zero.
  const handlingFee = 0

  set(order, 'CleanOrder', txt('false'))
  const reason = reasonUnclean(config, scenario)
  if (reason) set(order, 'ReasonUnclean', txt(reason))
  set(order, 'DiscountForCustomer', txt('0'))
  if (scenario.distributor) set(order, 'Distributor', txt(scenario.distributor))
  set(order, 'FinalPriceForEndCustomer', txt(decimalString(totalMsrp)))
  set(order, 'FinalPriceForEndCustomerWithHandlingFee', txt(decimalString(totalMsrp + handlingFee)))
  set(order, 'HandlingFee', txt(decimalString(handlingFee)))
  set(order, 'HandlingFeeName', txt(field(params, 'HandlingFeeDisplayName') ?? 'Handling Fee'))
  if (scenario.homCenter) set(order, 'HOMCenter', txt(scenario.homCenter))
  set(order, 'Msrp', txt(decimalString(totalMsrp)))
  set(order, 'Dp', txt(decimalString(totalDp)))
  // Scale 1, not 0: the user's OrderValueToGomModel is ApplySplit and the split
  // share is null, so .NET computes `dp * 1.0m`, which keeps one decimal place.
  set(order, 'OrderValueToGom', txt(decimalString(totalDp, 1)))
  set(order, 'OrderValueToGomWithHandlingFee', txt(decimalString(totalDp + handlingFee, 1)))
  set(order, 'SourceFileName', txt(field(params, 'VersionName') ?? ''))

  return order
}

/**
 * GPC marks an order unclean and lists why. Each line is CRLF-terminated,
 * inside the element's text — verified against the artifact's raw bytes.
 */
function reasonUnclean(config: ElementValue, scenario: OrderScenario): string {
  const distributor = scenario.distributor
    ? findDistributor(config, scenario.distributor)
    : null
  const lines: string[] = []
  const freight = scenario.freightTerm ?? ''
  const payment = scenario.paymentTerm ?? ''
  if (!standardTerms(distributor, 'StandardFreightTerms').includes(freight)) {
    lines.push(`* Not standard freight term '${freight}'.`)
  }
  if (!standardTerms(distributor, 'StandardPaymentTerms').includes(payment)) {
    lines.push(`* Not standard payment term '${payment}'.`)
  }
  return lines.length ? lines.map((l) => `${l}\r\n`).join('') : ''
}

function findDistributor(config: ElementValue, id: string): ElementValue | null {
  for (const d of listItems(section(config, 'DistributorData'), 'Distributors')) {
    if (field(d, 'Id') === id) return d
  }
  return null
}

function standardTerms(distributor: ElementValue | null, name: string): string[] {
  if (!distributor) return []
  const list = sub(distributor, name)
  if (!list) return []
  return list.members
    .map((m) => (m.value.kind === 'text' ? m.value.value : null))
    .filter((v): v is string => v !== null)
}

function set(order: OrderDocument, name: string, value: OrderValue): void {
  setMember(order.root, 'OrderData', name, value)
}

// ── support articles (SMA) ────────────────────────────────────────────────────

/**
 * Articles carrying this tag are software-support entries. The catalog uses
 * exactly one such tag across 270 articles, and they do not belong to a FreeList
 * item at all — they go inside the support item's SoftwareSupportArticles.
 */
const SOFTWARE_SUPPORT_TAG = '<software-support>'

/** Support items are typed `Supportextension`, not `Support`. */
const SUPPORT_ITEM_TYPE = 'Supportextension'

/** True when an article belongs in a support screen rather than a free list. */
export function isSupportArticle(article: ElementValue): boolean {
  return (field(article, 'FilterTags') ?? '').includes(SOFTWARE_SUPPORT_TAG)
}

/**
 * The catalog's support item — "Software Maintenance Agreement", grouped under
 * "ZEISS Metrology Care".
 *
 * Deliberately not matched through the FreeList filter-tag rule: a support
 * item's `WorksheetArticleFilter` is `<Support>SMA_EXT`, which has nothing in
 * common with the article's `<software-support>` tag. Matching on `ItemType` is
 * what actually identifies it.
 */
export function findSupportItem(config: ElementValue): ElementValue {
  const items = listItems(section(config, 'ConfigurationItemsData'), 'ConfigurationItems')
  for (const item of items) {
    if (field(item, 'ItemType') === SUPPORT_ITEM_TYPE) return item
  }
  throw new Error(`addItem: PDB has no ${SUPPORT_ITEM_TYPE} configuration item`)
}

export interface SupportContract {
  /** Dongle or sensor serial the agreement covers. */
  sensorSnDongleId?: string
  startNewContract?: string
  endNewContract?: string
  endOldContract?: string
  /** Contact shown on the support line; GPC labels these Reply1/Reply2. */
  replyEmail?: string
  replyName?: string
}

/**
 * Adds a software-support article to the order's support screen, creating that
 * screen from the catalog item the first time.
 *
 * This is the case the app got wrong: it invented a configuration item from the
 * article's MPG ("SMA (Stand-alone / Extension)") and made a separate line,
 * instead of nesting the article under the existing "Software Maintenance
 * Agreement" item. The article's MPG is not its category.
 */
export function addSupportArticle(
  order: OrderDocument,
  pdb: GpcContainer,
  articleName: string,
  options: AddArticleOptions & SupportContract = {}
): OrderDocument {
  const config = readPdbConfig(pdb)
  const article = findArticle(config, articleName)
  if (!isSupportArticle(article)) {
    throw new Error(`addItem: ${JSON.stringify(articleName)} is not a software-support article`)
  }

  const priceListName = options.priceListName ?? orderField(order, 'PriceList')
  if (!priceListName) throw new Error('addItem: order has no PriceList')
  const exchangeRate = options.exchangeRate ?? orderExchangeRate(order)
  const amount = options.amount ?? 1
  const { dp, msrp } = priceArticle(article, priceListName, exchangeRate)

  const screen = supportScreen(order, config, options)
  const entry = el([
    ['Amount', txt(String(amount))],
    ['Step', txt('1')],
    ['Article', clone(article)],
    ['OverwrittenDp', nil()],
    ['OverwrittenMrsp', nil()],
    ['PriceOnRequest', txt('false')],
    ['EuroMsrp', nil()],
    ['Msrp', txt(decimalString(msrp))],
    ['Dp', txt(decimalString(dp))],
    ['SumMsrp', nil()],
    ['SumDp', nil()],
    ['CustomQuantityDiscount', nil()],
    ['EconomyYears', el([])],
    ...(options.endNewContract ? [['EndNewContract', txt(options.endNewContract)] as [string, OrderValue]] : []),
    ...(options.endOldContract ? [['EndOldContract', txt(options.endOldContract)] as [string, OrderValue]] : []),
    ['IsOlderSelected', txt('false')],
    ['MsrpForMissingMonth', nil()],
    ['MsrpForNewContract', nil()],
    ['MsrpPerYear', nil()],
    ...(options.sensorSnDongleId ? [['SensorSnDongleId', txt(options.sensorSnDongleId)] as [string, OrderValue]] : []),
    ...(options.startNewContract ? [['StartNewContract', txt(options.startNewContract)] as [string, OrderValue]] : []),
  ])

  const list = sub(screen, 'SoftwareSupportArticles')
  if (!list) throw new Error('addItem: support screen has no SoftwareSupportArticles')
  list.members.push({ name: 'SupportArticle', value: entry })

  retotalSupportScreen(screen)
  return order
}

/** The order's support screen, cloned from the catalog on first use. */
function supportScreen(order: OrderDocument, config: ElementValue, options: SupportContract): ElementValue {
  const list = order.root.members.find((m) => m.name === 'SupportArticlesData')?.value
  if (!list || list.kind !== 'element') throw new Error('addItem: order has no <SupportArticlesData>')

  const existing = list.members.find((m) => m.value.kind === 'element')
  if (existing && existing.value.kind === 'element') return existing.value

  const screen = el([
    ['ConfigurationItem', clone(findSupportItem(config))],
    ['UseInCalculation', txt('true')],
    ['No', txt(String(nextItemNumber(order)))],
    ...(options.replyEmail ? [['Reply1', txt(options.replyEmail)] as [string, OrderValue]] : []),
    ...(options.replyName ? [['Reply2', txt(options.replyName)] as [string, OrderValue]] : []),
    ['TotalDp', txt('0')],
    ['TotalMsrp', txt('0')],
    ['Discount', nil()],
    ['IsDiscountPercentage', txt('false')],
    ['IsHidden', txt('false')],
    ['HardwareSupportArticles', el([])],
    ['SoftwareSupportArticles', el([])],
    ['IsLegacy', txt('false')],
    ['DependentListSupportScreenDatas', el([])],
    ['CustomVolumeDiscount', nil()],
    ['VolumeDiscount', txt('0')],
  ])
  list.members.push({ name: 'SupportScreenData', value: screen })
  return screen
}

/** Support totals are the sum of both article lists, times each amount. */
function retotalSupportScreen(screen: ElementValue): void {
  let msrp = 0
  let dp = 0
  for (const listName of ['HardwareSupportArticles', 'SoftwareSupportArticles']) {
    const list = sub(screen, listName)
    if (!list) continue
    for (const m of list.members) {
      if (m.value.kind !== 'element') continue
      const amount = Number(field(m.value, 'Amount') ?? '1')
      msrp += Number(field(m.value, 'Msrp') ?? '0') * amount
      dp += Number(field(m.value, 'Dp') ?? '0') * amount
    }
  }
  setText(screen, 'TotalMsrp', decimalString(msrp))
  setText(screen, 'TotalDp', decimalString(dp))
}

function setText(el: ElementValue, name: string, value: string): void {
  const member = el.members.find((m) => m.name === name)
  if (member) member.value = { kind: 'text', type: null, value }
}

/**
 * Adds an article to the right kind of line item for what it is: a support
 * article joins the support screen, anything else becomes a free-list item.
 * Callers that do not want to care which should use this.
 */
export function addCatalogArticle(
  order: OrderDocument,
  pdb: GpcContainer,
  articleName: string,
  options: AddArticleOptions & SupportContract = {}
): OrderDocument {
  const article = findArticle(readPdbConfig(pdb), articleName)
  return isSupportArticle(article)
    ? addSupportArticle(order, pdb, articleName, options)
    : addArticle(order, pdb, articleName, options)
}
