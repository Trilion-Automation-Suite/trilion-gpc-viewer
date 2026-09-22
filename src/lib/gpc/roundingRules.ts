/**
 * The catalog's price rounding rules.
 *
 * Catalog prices are in euro; an order carries them in its own currency, and the
 * converted figure is *not* simply the product. Each PDB ships a RoundingRules
 * table that quantises the result per currency, per price kind (list or
 * distributor) and per product group, and that table is what decides both the
 * value and how many decimal places it is written with.
 *
 * Without it the arithmetic is close but wrong: 2270 x 1.15 is 2610.5, and the
 * USD list-price rule rounds *down* to a multiple of 10, giving 2610 — which is
 * what the configurator writes, where naive rounding gives 2611.
 */
import type { Dec, RoundingMode } from './decimal.ts'
import { compare, divide, multiply, parseDecimal, parseDecimalOrNull, roundToQuantum } from './decimal.ts'
import { sliceSection } from '../configScan.ts'

/** Which price a rule applies to. */
export type PriceKind = 'MSRP' | 'DP'

export interface RoundingRule {
  mode: Mode
  condition: PriceKind
  currencyIso: string
  /** Product group, or `*` for any. */
  mpg: string
  rangeFrom: Dec
  rangeTo: Dec
  roundTo: Dec
}

/** Not a rule mode: the marker for "round to two places", handled separately. */
const TWO_DECIMALS = 'twoDecimals'
export type Mode = RoundingMode | typeof TWO_DECIMALS

/**
 * The mode a rule asks for. `RoundingRuleExt.Round` switches on the *first
 * character* of the rule's name and nothing else, so that is what is read here:
 * `'1'` is `Math.Round` (half to even), `'2'` `Math.Ceiling`, `'3'` `Math.Floor`.
 * Anything else — including a missing rule — falls through to two decimals.
 */
function toMode(rule: string): Mode {
  switch (rule.charAt(0)) {
    case '1': return 'even'
    case '2': return 'up'
    case '3': return 'down'
    default: return TWO_DECIMALS
  }
}

function tagText(block: string, tag: string): string {
  const open = `<${tag}>`
  const start = block.indexOf(open)
  if (start < 0) return ''
  const end = block.indexOf(`</${tag}>`, start + open.length)
  return end < 0 ? '' : block.slice(start + open.length, end).trim()
}

/** Reads the RoundingRules table out of config.xml. */
export function scanRoundingRules(configXml: string): RoundingRule[] {
  const section = sliceSection(configXml, 'RoundingRules')
  if (!section) return []

  const rules: RoundingRule[] = []
  const open = '<RoundingRule>'
  const close = '</RoundingRule>'
  let at = 0
  for (;;) {
    const start = section.indexOf(open, at)
    if (start < 0) break
    const end = section.indexOf(close, start + open.length)
    if (end < 0) break
    const block = section.slice(start + open.length, end)
    at = end + close.length

    const mode = toMode(tagText(block, 'Rule'))
    const condition = tagText(block, 'Condition').toUpperCase()
    const roundTo = parseDecimalOrNull(tagText(block, 'RoundTo'))
    if (!roundTo || (condition !== 'MSRP' && condition !== 'DP')) continue

    rules.push({
      mode,
      condition,
      currencyIso: tagText(block, 'CurrencyIso'),
      mpg: tagText(block, 'MPG') || '*',
      // Bounds are decimal.MinValue/MaxValue when unrestricted.
      rangeFrom: parseDecimalOrNull(tagText(block, 'RangeFrom')) ?? parseDecimal('-79228162514264337593543950335'),
      rangeTo: parseDecimalOrNull(tagText(block, 'RangeTo')) ?? parseDecimal('79228162514264337593543950335'),
      roundTo,
    })
  }
  return rules
}

/**
 * The rule that applies, or null when none does — `CurrenciesDataExt.FindRoundingRule`.
 *
 * Two details decide real prices. A rule naming the product group wins over the
 * `*` catch-all, in a *separate pass*, so a `*` rule earlier in the table never
 * shadows a group rule later in it. And the upper bound is **exclusive**:
 * `RangeFrom <= price && RangeTo > price`.
 */
export function selectRule(
  rules: RoundingRule[],
  value: Dec,
  kind: PriceKind,
  currencyIso: string,
  mpg: string
): RoundingRule | null {
  const matches = (rule: RoundingRule, group: string): boolean =>
    rule.condition === kind &&
    rule.currencyIso === currencyIso &&
    rule.mpg === group &&
    compare(rule.rangeFrom, value) <= 0 &&
    compare(rule.rangeTo, value) > 0
  return rules.find((r) => matches(r, mpg)) ?? rules.find((r) => matches(r, '*')) ?? null
}

const HUNDRED = parseDecimal('100')
const ZERO = parseDecimal('0')
const ONE = parseDecimal('1')

/**
 * Applies the catalog's rounding.
 *
 * The fallback when no rule covers a value is **two decimal places**, half to
 * even — `Math.Round(price * 100m) / 100m`, the default arm of
 * `RoundingRuleExt.Round`. Not the whole unit: the USD list rule starts at 100,
 * so every accessory below that price is rounded here, and the file records
 * them with their cents.
 */
export function applyRounding(
  rules: RoundingRule[],
  value: Dec,
  kind: PriceKind,
  currencyIso: string,
  mpg: string
): Dec {
  const rule = selectRule(rules, value, kind, currencyIso, mpg)
  if (!rule || rule.mode === TWO_DECIMALS) return roundToTwoDecimals(value)
  return roundToQuantum(value, rule.roundTo, rule.mode)
}

/** `Math.Round(price * 100m) / 100m`, trailing zeros dropped as .NET drops them. */
export function roundToTwoDecimals(value: Dec): Dec {
  return divide(roundToQuantum(multiply(value, HUNDRED), ONE, 'even'), HUNDRED)
}


/**
 * Distributor discount by product group and price list.
 *
 * This is what actually sets the distributor price. Deriving it from the
 * catalog's own euro Dp/Msrp pair looks right and is not: that pair is itself
 * rounded, so the quotient is an approximation. Consumables on the Partner list
 * discount 30%, but the euro prices 193/275 give 0.70182 — enough to turn a
 * 217 into a 218.
 */
export function scanDiscounts(configXml: string): Map<string, Dec> {
  const section = sliceSection(configXml, 'DiscountsData')
  if (!section) return new Map()

  const out = new Map<string, Dec>()
  const open = '<Discount>'
  const close = '</Discount>'
  let at = 0
  for (;;) {
    const start = section.indexOf(open, at)
    if (start < 0) break
    const end = section.indexOf(close, start + open.length)
    if (end < 0) break
    const block = section.slice(start + open.length, end)
    at = end + close.length
    const factor = parseDecimalOrNull(tagText(block, 'Factor'))
    // Rows with no discount defined carry a decimal.MinValue sentinel rather
    // than being absent, e.g. -792281625142643375935439503.35. A real discount
    // is a fraction of the list price, so anything outside 0..1 is not one.
    if (!factor || compare(factor, ZERO) < 0 || compare(factor, ONE) >= 0) continue
    const priceList = tagText(block, 'PriceListName')
    // A row can name a single article instead of a whole product group, and the
    // configurator looks for that one first (`AdministrationDataExt.GetDiscount`).
    const article = tagText(block, 'ArticleLongName')
    const key = article ? articleDiscountKey(article, priceList) : discountKey(tagText(block, 'MPG'), priceList)
    if (!out.has(key)) out.set(key, factor)
  }
  return out
}

export function discountKey(mpg: string, priceListName: string): string {
  return `mpg\u0000${mpg}\u0000${priceListName}`
}

export function articleDiscountKey(longName: string, priceListName: string): string {
  return `article\u0000${longName}\u0000${priceListName}`
}

/**
 * The discount for one article: by its own name first, then by its product
 * group, with a blank group meaning the `*` row.
 */
export function findDiscount(
  discounts: Map<string, Dec> | undefined,
  longName: string,
  mpg: string,
  priceListName: string
): Dec | undefined {
  if (!discounts) return undefined
  return (
    discounts.get(articleDiscountKey(longName, priceListName)) ??
    discounts.get(discountKey(mpg.trim() === '' ? '*' : mpg, priceListName))
  )
}
