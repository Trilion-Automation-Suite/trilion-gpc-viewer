/**
 * Dependent-list line items — the configurable systems.
 *
 * These are the shape a whole system or a computer build takes, and they work
 * unlike every other line item. A free-list or support line holds *cloned
 * articles*. A dependent list holds the catalog's entire option tree: every
 * section and every choice within it, selected or not, with `Amount` recording
 * what was picked. A 15-section list is written out with all 62 of its options.
 *
 * The catalog side lives in `DependentListsData`, keyed by the configuration
 * item's `WorksheetArticleFilter` — which for these items is a plain list name
 * like `PC`, not the `<Articles>tag` filter a free list uses. The shapes differ
 * in naming too: catalog sections use `LongName` and `Articles`, the order uses
 * `Name` and `SectionArticles`, and `SAPCharacterTraitNames` becomes
 * `SapCharacterTraitNames`.
 *
 * ## Nesting
 *
 * A dependent list can contain further dependent lists, and there are two
 * distinct nestings, not one:
 *
 *  - **`SubConfigurations`** on a `DependentListScreenData`. A catalog section
 *    flagged `IsSubconfiguration` does not offer articles at all: its options
 *    name *configuration items*. Selecting one attaches that item's own whole
 *    dependent list as a child line — `<ConfigurationItemData
 *    xsi:type="DependentListScreenData">` — numbered `1.1` under its parent's
 *    `1`. `DependentListDataFactoryExt.InitRuntimeData` is where the
 *    configurator makes the same link, looking the item up by the option's name.
 *  - **`DependentListSupportScreenDatas`** on a `SupportScreenData`. One entry
 *    per dongle. These carry the contract dates and the dongle id, and they are
 *    the *source* of the support screen's article list: `SupportScreenData`
 *    computes `SoftwareSupportArticles` from them (see `refreshSupportArticles`
 *    in addItem.ts), it does not store them.
 */
import type { GpcContainer } from './container.ts'
import type { ElementValue, OrderDocument, OrderValue } from './orderXml.ts'
import { readPdbConfig } from './blankOrder.ts'
import type { Dec } from './decimal.ts'
import { add, divide, fromInt, isZero, multiply } from './decimal.ts'
import { scanDiscounts, scanRoundingRules } from './roundingRules.ts'
import {
  decimalString,
  ensureSupportScreen,
  findArticle,
  plainSupportFilter,
  priceArticle,
  refreshSupportArticles,
} from './addItem.ts'

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

function kids(e: ElementValue | null): ElementValue[] {
  if (!e) return []
  return e.members.map((m) => m.value).filter((x): x is ElementValue => x.kind === 'element')
}

function clone(v: OrderValue): OrderValue {
  if (v.kind !== 'element') return { ...v }
  return { kind: 'element', type: v.type, members: v.members.map((m) => ({ name: m.name, value: clone(m.value) })) }
}

function section(config: ElementValue, name: string): ElementValue {
  const v = config.members.find((m) => m.name === name)?.value
  if (!v || v.kind !== 'element') throw new Error(`dependentList: PDB config has no <${name}>`)
  return v
}

/**
 * How an option's amount came about. Recorded rather than derived: only
 * `None` follows from the amount alone.
 */
export type AmountMode =
  | 'None'
  | 'Default'
  | 'UserChoice'
  | 'SectionSpecialFunction'
  | 'Implication'
  | 'SoftImplication'

/** One option the operator turned on, identified the way the file identifies it. */
export interface DependentListSelection {
  sectionName: string
  articleName: string
  amount: string
  amountMode?: AmountMode
  /**
   * The configurator writes 0 here for an option the current user cannot take.
   * Partly explained by the article's UserBlacklist, but not wholly, so it is
   * carried rather than derived.
   */
  step?: string
}

/**
 * A child line the operator opened from a sub-configuration section.
 *
 * Only the operator's side is carried: which configuration item, the contact
 * they typed on it, and what they picked inside it. *Whether* a child exists at
 * all is derived — it follows from the parent's sub-configuration option being
 * selected — and so are the cloned item, the option tree and every price.
 */
export interface DependentListSubConfiguration {
  /** The catalog configuration item's `Name`, which is also the option's name. */
  itemName: string
  reply1?: string
  reply2?: string
  selections?: DependentListSelection[]
  subConfigurations?: DependentListSubConfiguration[]
}

/** Pricing inputs shared by a line and everything nested inside it. */
interface PriceContext {
  config: ElementValue
  priceListName: string
  exchangeRate: Dec
  currencyIso: string
  rules: ReturnType<typeof scanRoundingRules>
  discounts: ReturnType<typeof scanDiscounts>
}

export interface AddDependentListOptions {
  /** Whether the line counts toward the order totals; operators can switch it off. */
  useInCalculation?: boolean
  /** Free-text reply shown on the line. */
  reply1?: string
  reply2?: string
  selections?: DependentListSelection[]
  subConfigurations?: DependentListSubConfiguration[]
  priceListName?: string
  exchangeRate?: Dec
  currencyIso?: string
}

/** The catalog's configuration item for a dependent list, by name. */
export function findDependentListItem(config: ElementValue, itemName: string): ElementValue {
  for (const item of kids(sub(section(config, 'ConfigurationItemsData'), 'ConfigurationItems'))) {
    if (field(item, 'ItemType') === 'DependentList' && field(item, 'Name') === itemName) return item
  }
  throw new Error(`dependentList: PDB has no DependentList item named ${JSON.stringify(itemName)}`)
}

/**
 * The option tree a configuration item points at. The link is the item's
 * `WorksheetArticleFilter`, which holds the list's name.
 */
export function findDependentList(config: ElementValue, listName: string): ElementValue {
  for (const list of kids(sub(section(config, 'DependentListsData'), 'DependentLists'))) {
    if (field(list, 'DependentListName') === listName) return list
  }
  throw new Error(`dependentList: PDB has no dependent list named ${JSON.stringify(listName)}`)
}

/**
 * Builds the screen for a dependent-list item and appends it to the order.
 *
 * Every section and every option is written out, whether selected or not —
 * that is what the configurator does, and the file records the whole tree.
 */
export function addDependentList(
  order: OrderDocument,
  pdb: GpcContainer,
  itemName: string,
  options: AddDependentListOptions = {}
): OrderDocument {
  const ctx = priceContext(order, pdb, options)
  const useInCalculation = options.useInCalculation ?? true

  const screen = buildScreen(ctx, findDependentListItem(ctx.config, itemName), {
    useInCalculation,
    no: String(nextItemNumber(order)),
    reply1: options.reply1,
    reply2: options.reply2,
    selections: options.selections,
    subConfigurations: options.subConfigurations,
  })

  const list = order.root.members.find((m) => m.name === 'DependentListsData')?.value
  if (!list || list.kind !== 'element') throw new Error('dependentList: order has no <DependentListsData>')
  list.members.push({ name: 'DependentListScreenData', value: screen })
  renumberSubConfigurations(order)
  return order
}

export interface AddDependentListSupportOptions {
  useInCalculation?: boolean
  selections?: DependentListSelection[]
  /** The dongle or sensor serial the agreement covers. */
  dongleId?: string
  startNewContract?: string
  endNewContract?: string
  endOldContract?: string
  isOlderSelected?: boolean
  /** Contact shown on the support line; GPC labels these Reply1/Reply2. */
  replyEmail?: string
  replyName?: string
  priceListName?: string
  exchangeRate?: Dec
  currencyIso?: string
}

/**
 * Adds one dongle's maintenance agreement to the order's support screen,
 * creating that screen from the catalog item the first time.
 *
 * The configuration item here is *not* cloned from the catalog — no catalog
 * item has `ItemType` `DongleList`. `SoftwareSupportArticlesViewModel`
 * constructs one from nothing but the worksheet filter, so every other member
 * is a .NET default and the null reference types are simply absent:
 *
 *     new ConfigurationItem {
 *       ProductionArticles = new List<Article>(),
 *       ItemType = Type.DongleList,
 *       WorksheetArticleFilter = _workSheetFilter,
 *     }
 *
 * and `_workSheetFilter` is the support item's own filter with its `<Support>`
 * prefix removed. So the whole item is derivable from the catalog's support
 * item, which is why nothing about it is taken from the target.
 */
export function addDependentListSupport(
  order: OrderDocument,
  pdb: GpcContainer,
  options: AddDependentListSupportOptions = {}
): OrderDocument {
  const ctx = priceContext(order, pdb, options)
  const screen = ensureSupportScreen(order, ctx.config, options)
  const supportItem = sub(screen, 'ConfigurationItem')
  if (!supportItem) throw new Error('dependentList: support screen has no <ConfigurationItem>')
  const listName = plainSupportFilter(supportItem)

  const built = buildScreen(ctx, dongleListItem(listName), {
    useInCalculation: options.useInCalculation ?? true,
    selections: options.selections,
    listName,
    support: {
      startNewContract: options.startNewContract,
      endNewContract: options.endNewContract,
      endOldContract: options.endOldContract,
      isOlderSelected: options.isOlderSelected ?? false,
      dongleId: options.dongleId,
    },
  })

  const list = sub(screen, 'DependentListSupportScreenDatas')
  if (!list) throw new Error('dependentList: support screen has no <DependentListSupportScreenDatas>')
  list.members.push({ name: 'DependentListSupportScreenData', value: built })

  refreshSupportArticles(screen, ctx.config)
  return order
}

/**
 * The synthetic `DongleList` configuration item. Member order and the choice of
 * which members appear at all follow the serializer: value types are written
 * with their defaults, null reference types are omitted.
 */
function dongleListItem(listName: string): ElementValue {
  return el([
    ['ApplicableFee', txt('0')],
    ['IsHidden', txt('false')],
    ['AsSubItemOnly', txt('false')],
    ['Flatten', txt('false')],
    ['WorksheetArticleFilter', txt(listName)],
    ['ItemType', txt('DongleList')],
    ['AdditionalMandatoryFields', txt('false')],
    ['IsOppIdMandatory', txt('false')],
    ['ProductionArticles', el([])],
    ['Unclean', txt('false')],
  ])
}

/** Contract state a dongle list carries and a plain dependent list does not. */
interface SupportContractState {
  startNewContract?: string
  endNewContract?: string
  endOldContract?: string
  isOlderSelected: boolean
  dongleId?: string
}

interface ScreenSpec {
  useInCalculation: boolean
  no?: string
  reply1?: string
  reply2?: string
  selections?: DependentListSelection[]
  subConfigurations?: DependentListSubConfiguration[]
  /** Overrides the item's own `WorksheetArticleFilter`; only dongle lists need it. */
  listName?: string
  support?: SupportContractState
}

/**
 * One dependent-list screen, with its option tree, its totals and whatever is
 * nested inside it. Shared by the three shapes that use it: a top-level line, a
 * `SubConfigurations` child and a dongle list.
 */
function buildScreen(ctx: PriceContext, item: ElementValue, spec: ScreenSpec): ElementValue {
  const listName = spec.listName ?? field(item, 'WorksheetArticleFilter') ?? ''
  const list = findDependentList(ctx.config, listName)

  const chosen = new Map<string, DependentListSelection>()
  for (const s of spec.selections ?? []) chosen.set(`${s.sectionName}\u0000${s.articleName}`, s)

  let totalMsrp: Dec = fromInt(0)
  let totalDp: Dec = fromInt(0)
  const sections: Array<[string, OrderValue]> = []
  /** Sub-configuration options that came out selected, in catalog order. */
  const openedChildren: string[] = []

  for (const catalogSection of kids(sub(list, 'Sections'))) {
    const sectionName = field(catalogSection, 'LongName') ?? ''
    const isSubconfiguration = field(catalogSection, 'IsSubconfiguration') === 'true'
    const entries: Array<[string, OrderValue]> = []

    for (const catalogArticle of kids(sub(catalogSection, 'Articles'))) {
      const articleName = field(catalogArticle, 'LongName') ?? ''
      const selection = chosen.get(`${sectionName}\u0000${articleName}`)
      const defaultAmount = field(catalogArticle, 'DefaultAmount') ?? '0'
      // Unselected options are zero, even where the catalog gives them a
      // default: the file records what the configuration *is*, and an option
      // whose default is 1 still sits at 0 until something turns it on. Which
      // defaults fire is the configurator's precondition engine, not a property
      // of the option, so replaying a configuration takes the amounts as given.
      const amount = selection?.amount ?? '0'
      if (isSubconfiguration && amount !== '0') openedChildren.push(articleName)

      // An option with no catalog article has no price at all, which is not the
      // same as a price of zero: the configurator writes xsi:nil for the first
      // and 0 for the second, and selector rows are genuinely zero-priced. A
      // sub-configuration option never names an article — it names an item.
      const priced = isSubconfiguration ? null : optionPrice(ctx, articleName)
      if (priced && amount !== '0') {
        const count = fromInt(Number(amount) || 0)
        totalMsrp = add(totalMsrp, multiply(priced.msrp, count))
        totalDp = add(totalDp, multiply(priced.dp, count))
      }

      entries.push(['SectionArticleScreenData', el([
        ['Amount', txt(amount)],
        ['Step', txt(selection?.step ?? field(catalogArticle, 'Step') ?? '0')],
        ['OverwrittenDp', nil()],
        ['OverwrittenMrsp', nil()],
        ['PriceOnRequest', txt('false')],
        ['EuroMsrp', nil()],
        ['Msrp', priced ? txt(decimalString(priced.msrp)) : nil()],
        ['Dp', priced ? txt(decimalString(priced.dp)) : nil()],
        ['SumMsrp', nil()],
        ['SumDp', nil()],
        ['CustomQuantityDiscount', nil()],
        ['Name', txt(articleName)],
        ['AmountMode', txt(amountMode(amount, defaultAmount, selection))],
      ])])
    }

    const traits = sub(catalogSection, 'SAPCharacterTraitNames')
    sections.push(['SectionScreenData', el([
      ['Name', txt(sectionName)],
      ['SectionArticles', el(entries)],
      ...(traits ? [['SapCharacterTraitNames', clone(traits)] as [string, OrderValue]] : []),
    ])])
  }

  // Children inherit UseInCalculation from their parent: the configurator ties
  // the two together, in the view model's setter and again when it rebuilds the
  // item list on load.
  const children: Array<[string, OrderValue]> = openedChildren.map((itemName) => {
    const supplied = (spec.subConfigurations ?? []).find((s) => s.itemName === itemName)
    const child = buildScreen(ctx, findDependentListItem(ctx.config, itemName), {
      useInCalculation: spec.useInCalculation,
      no: '',
      reply1: supplied?.reply1,
      reply2: supplied?.reply2,
      selections: supplied?.selections,
      subConfigurations: supplied?.subConfigurations,
    })
    child.type = 'DependentListScreenData'
    return ['ConfigurationItemData', child]
  })

  if (spec.support) {
    return el([
      ['ConfigurationItem', clone(item)],
      ['UseInCalculation', txt(String(spec.useInCalculation))],
      ['TotalDp', txt(decimalString(supportRoundTrip(totalMsrp, totalDp, spec.support)))],
      ['TotalMsrp', txt(decimalString(supportMsrp(totalMsrp, spec.support)))],
      ['Discount', nil()],
      ['IsDiscountPercentage', txt('false')],
      ['IsHidden', txt('false')],
      ['Sections', el(sections)],
      ['SubConfigurations', el(children)],
      ['CustomArticlesQuantityDiscount', nil()],
      ...(spec.support.startNewContract
        ? [['StartNewContract', txt(spec.support.startNewContract)] as [string, OrderValue]]
        : []),
      ...(spec.support.endNewContract
        ? [['EndNewContract', txt(spec.support.endNewContract)] as [string, OrderValue]]
        : []),
      ...(spec.support.endOldContract
        ? [['EndOldContract', txt(spec.support.endOldContract)] as [string, OrderValue]]
        : []),
      ['IsOlderSelected', txt(String(spec.support.isOlderSelected))],
      ...(spec.support.dongleId ? [['DongleId', txt(spec.support.dongleId)] as [string, OrderValue]] : []),
      ['YearBasedDiscount', txt('0')],
      ['CustomYearBasedDiscount', nil()],
    ])
  }

  return el([
    ['ConfigurationItem', clone(item)],
    ['UseInCalculation', txt(String(spec.useInCalculation))],
    ...(spec.no !== undefined ? [['No', txt(spec.no)] as [string, OrderValue]] : []),
    ...(spec.reply1 ? [['Reply1', txt(spec.reply1)] as [string, OrderValue]] : []),
    ...(spec.reply2 ? [['Reply2', txt(spec.reply2)] as [string, OrderValue]] : []),
    // A plain sum, unlike a support screen: these totals are written at scale 0.
    ['TotalDp', txt(decimalString(totalDp))],
    ['TotalMsrp', txt(decimalString(totalMsrp))],
    ['Discount', nil()],
    ['IsDiscountPercentage', txt('false')],
    ['IsHidden', txt('false')],
    ['Sections', el(sections)],
    ['SubConfigurations', el(children)],
    ['CustomArticlesQuantityDiscount', nil()],
  ])
}

/**
 * Months a contract runs, inclusive of both end months — the configurator's
 * `Duration`. A year is 12, so the usual case divides out exactly.
 */
function contractMonths(state: SupportContractState): number {
  const start = state.startNewContract, end = state.endNewContract
  if (!start || !end) return 12
  const a = new Date(start), b = new Date(end)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 12
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1
}

/**
 * `MsrpForNewContract + ReEntryFee`, where the first is the per-year sum
 * pro-rated over the contract's months.
 *
 * The re-entry fee — what the configurator charges for months the old contract
 * did not cover — is not modelled: nothing in the corpus exercises it, every
 * agreement there starts the day after the previous one ended. A contract with
 * a gap would come out low, and that is a known gap rather than a silent one.
 */
function supportMsrp(msrpPerYear: Dec, state: SupportContractState): Dec {
  const months = contractMonths(state)
  if (months === 12) return msrpPerYear
  return divide(multiply(msrpPerYear, fromInt(months)), fromInt(12))
}

/**
 * `TotalMsrp x (DpPerYear / MsrpPerYear)` — the dongle's distributor total.
 *
 * Mathematically the distributor sum back again; arithmetically not, because a
 * .NET decimal division carries its digits into the multiplication. That is
 * what writes `1078.0000000000000000000000000` into the file where a plain sum
 * would write `1078`.
 */
function supportRoundTrip(msrpPerYear: Dec, dpPerYear: Dec, state: SupportContractState): Dec {
  if (isZero(msrpPerYear)) return supportMsrp(dpPerYear, state)
  return multiply(supportMsrp(msrpPerYear, state), divide(dpPerYear, msrpPerYear))
}

/**
 * Re-stamps every child's `No` from its parent's.
 *
 * The width is an order-wide property, not a per-item one: the configurator
 * formats the index with `"D" + max(SubConfigurations.Count).ToString().Length`
 * taken over every configuration item in the order, so a tenth child anywhere
 * would widen all of them to `1.01`.
 */
function renumberSubConfigurations(order: OrderDocument): void {
  let widest = 0
  for (const item of allItems(order)) {
    const children = sub(item, 'SubConfigurations')
    if (children) widest = Math.max(widest, children.members.length)
  }
  const width = String(widest).length
  for (const item of allItems(order)) {
    const children = sub(item, 'SubConfigurations')
    if (!children) continue
    const parentNo = field(item, 'No') ?? ''
    children.members.forEach((m, i) => {
      if (m.value.kind !== 'element') return
      const no = `${parentNo}.${String(i + 1).padStart(width, '0')}`
      const existing = m.value.members.find((x) => x.name === 'No')
      if (existing) existing.value = txt(no)
    })
  }
}

/** Every line item in the order, in the order the configurator walks them. */
function allItems(order: OrderDocument): ElementValue[] {
  const out: ElementValue[] = []
  for (const listName of ['DependentListsData', 'FreeListArticlesData', 'SupportArticlesData', 'FreeArticlesData']) {
    const list = order.root.members.find((m) => m.name === listName)?.value
    if (!list || list.kind !== 'element') continue
    for (const m of list.members) if (m.value.kind === 'element') out.push(m.value)
  }
  return out
}

/**
 * `None` whenever nothing is selected. Beyond that the mode records *why* an
 * option is on, which the amount cannot tell us, so it is taken from the
 * selection when given and inferred from the catalog default otherwise.
 */
function amountMode(amount: string, defaultAmount: string, selection?: DependentListSelection): AmountMode {
  if (selection?.amountMode) return selection.amountMode
  if (amount === '0') return 'None'
  return defaultAmount !== '0' ? 'Default' : 'UserChoice'
}

/** The option's price, or null when it names no catalog article. */
function optionPrice(ctx: PriceContext, articleName: string): { msrp: Dec; dp: Dec } | null {
  try {
    return priceArticle(
      findArticle(ctx.config, articleName),
      ctx.priceListName,
      ctx.exchangeRate,
      ctx.rules,
      ctx.currencyIso,
      ctx.discounts
    )
  } catch {
    return null
  }
}

function priceContext(
  order: OrderDocument,
  pdb: GpcContainer,
  options: { priceListName?: string; exchangeRate?: Dec; currencyIso?: string }
): PriceContext {
  const configText = configXml(pdb)
  return {
    config: readPdbConfig(pdb),
    priceListName: options.priceListName ?? orderText(order, 'PriceList') ?? '',
    exchangeRate: options.exchangeRate ?? orderExchangeRate(order),
    currencyIso: options.currencyIso ?? orderCurrencyIso(order),
    rules: scanRoundingRules(configText),
    discounts: scanDiscounts(configText),
  }
}

function orderText(order: OrderDocument, name: string): string | null {
  const v = order.root.members.find((m) => m.name === name)?.value
  return v && v.kind === 'text' ? v.value : null
}

function orderExchangeRate(order: OrderDocument): Dec {
  const currency = order.root.members.find((m) => m.name === 'Currency')?.value
  if (!currency || currency.kind !== 'element') return fromInt(1)
  const v = currency.members.find((m) => m.name === 'ExchangeRate')?.value
  return v && v.kind === 'text' ? parseRate(v.value) : fromInt(1)
}

function parseRate(text: string): Dec {
  const dot = text.indexOf('.')
  const digits = dot < 0 ? text : text.slice(0, dot) + text.slice(dot + 1)
  return { unscaled: BigInt(digits || '1'), scale: dot < 0 ? 0 : text.length - dot - 1 }
}

function orderCurrencyIso(order: OrderDocument): string {
  const currency = order.root.members.find((m) => m.name === 'Currency')?.value
  if (!currency || currency.kind !== 'element') return ''
  const v = currency.members.find((m) => m.name === 'Iso')?.value
  return v && v.kind === 'text' ? v.value : ''
}

function nextItemNumber(order: OrderDocument): number {
  let n = 0
  for (const listName of ['DependentListsData', 'FreeArticlesData', 'FreeListArticlesData', 'SupportArticlesData']) {
    const l = order.root.members.find((m) => m.name === listName)?.value
    if (l && l.kind === 'element') n += l.members.length
  }
  return n + 1
}

function configXml(pdb: GpcContainer): string {
  const entry = pdb.entries.find((e) => e.name === 'config.xml')
  if (!entry) throw new Error('dependentList: catalog has no config.xml')
  return new TextDecoder('utf-8').decode(entry.data)
}
