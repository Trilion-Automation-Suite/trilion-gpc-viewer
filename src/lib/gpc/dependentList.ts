/**
 * Dependent-list line items — the configurable systems.
 *
 * These are the shape a whole ARAMIS or a computer build takes, and they work
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
 */
import type { GpcContainer } from './container.ts'
import type { ElementValue, OrderDocument, OrderValue } from './orderXml.ts'
import { readPdbConfig } from './blankOrder.ts'
import type { Dec } from './decimal.ts'
import { add, fromInt, multiply } from './decimal.ts'
import { scanRoundingRules } from './roundingRules.ts'
import { decimalString, findArticle, priceArticle } from './addItem.ts'

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
export type AmountMode = 'None' | 'Default' | 'UserChoice' | 'SectionSpecialFunction'

/** One option the operator turned on, identified the way the file identifies it. */
export interface DependentListSelection {
  sectionName: string
  articleName: string
  amount: string
  amountMode?: AmountMode
}

export interface AddDependentListOptions {
  /** Free-text reply shown on the line. */
  reply1?: string
  selections?: DependentListSelection[]
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
  const config = readPdbConfig(pdb)
  const item = findDependentListItem(config, itemName)
  const listName = field(item, 'WorksheetArticleFilter') ?? ''
  const list = findDependentList(config, listName)

  const priceListName = options.priceListName ?? orderText(order, 'PriceList') ?? ''
  const exchangeRate = options.exchangeRate ?? orderExchangeRate(order)
  const currencyIso = options.currencyIso ?? orderCurrencyIso(order)
  const rules = scanRoundingRules(configXml(pdb))

  const chosen = new Map<string, DependentListSelection>()
  for (const s of options.selections ?? []) chosen.set(`${s.sectionName}\u0000${s.articleName}`, s)

  let totalMsrp: Dec = fromInt(0)
  let totalDp: Dec = fromInt(0)
  const sections: Array<[string, OrderValue]> = []

  for (const catalogSection of kids(sub(list, 'Sections'))) {
    const sectionName = field(catalogSection, 'LongName') ?? ''
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

      // Only options that are actually on carry a price into the total.
      const { msrp, dp } = optionPrice(config, articleName, priceListName, exchangeRate, rules, currencyIso)
      if (amount !== '0') {
        const count = fromInt(Number(amount) || 0)
        totalMsrp = add(totalMsrp, multiply(msrp, count))
        totalDp = add(totalDp, multiply(dp, count))
      }

      entries.push(['SectionArticleScreenData', el([
        ['Amount', txt(amount)],
        ['Step', txt(field(catalogArticle, 'Step') ?? '0')],
        ['OverwrittenDp', nil()],
        ['OverwrittenMrsp', nil()],
        ['PriceOnRequest', txt('false')],
        ['EuroMsrp', nil()],
        ['Msrp', txt(decimalString(msrp))],
        ['Dp', txt(decimalString(dp))],
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

  const screen = el([
    ['ConfigurationItem', clone(item)],
    ['UseInCalculation', txt('true')],
    ['No', txt(String(nextItemNumber(order)))],
    ...(options.reply1 ? [['Reply1', txt(options.reply1)] as [string, OrderValue]] : []),
    // A plain sum, unlike a support screen: these totals are written at scale 0.
    ['TotalDp', txt(decimalString(totalDp))],
    ['TotalMsrp', txt(decimalString(totalMsrp))],
    ['Discount', nil()],
    ['IsDiscountPercentage', txt('false')],
    ['IsHidden', txt('false')],
    ['Sections', el(sections)],
    ['SubConfigurations', el([])],
    ['CustomArticlesQuantityDiscount', nil()],
  ])

  const list_ = order.root.members.find((m) => m.name === 'DependentListsData')?.value
  if (!list_ || list_.kind !== 'element') throw new Error('dependentList: order has no <DependentListsData>')
  list_.members.push({ name: 'DependentListScreenData', value: screen })
  return order
}

/**
 * `None` whenever nothing is selected. Beyond that the mode records *why* an
 * option is on, which the amount cannot tell us, so it is taken from the
 * selection when given and inferred from the catalog default otherwise.
 */
function amountMode(amount: string, defaultAmount: string, selection?: DependentListSelection): AmountMode {
  if (amount === '0') return 'None'
  if (selection?.amountMode) return selection.amountMode
  return defaultAmount !== '0' ? 'Default' : 'UserChoice'
}

/** Options priced from the article catalog; a selector row has no article and costs nothing. */
function optionPrice(
  config: ElementValue,
  articleName: string,
  priceListName: string,
  exchangeRate: Dec,
  rules: ReturnType<typeof scanRoundingRules>,
  currencyIso: string
): { msrp: Dec; dp: Dec } {
  try {
    return priceArticle(findArticle(config, articleName), priceListName, exchangeRate, rules, currencyIso)
  } catch {
    return { msrp: fromInt(0), dp: fromInt(0) }
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
