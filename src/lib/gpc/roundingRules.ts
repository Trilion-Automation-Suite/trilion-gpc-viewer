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
import { compare, parseDecimal, parseDecimalOrNull, roundToQuantum } from './decimal.ts'
import { sliceSection } from '../configScan.ts'

/** Which price a rule applies to. */
export type PriceKind = 'MSRP' | 'DP'

export interface RoundingRule {
  mode: RoundingMode
  condition: PriceKind
  currencyIso: string
  /** Product group, or `*` for any. */
  mpg: string
  rangeFrom: Dec
  rangeTo: Dec
  roundTo: Dec
}

/** The catalog spells the mode out; these are the three it uses. */
function toMode(rule: string): RoundingMode | null {
  const text = rule.toLowerCase()
  if (text.includes('commercial')) return 'commercial'
  if (text.includes('round up')) return 'up'
  if (text.includes('round down')) return 'down'
  return null
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
    if (!mode || !roundTo || (condition !== 'MSRP' && condition !== 'DP')) continue

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
 * The rule that applies, or null when none does.
 *
 * A rule naming the product group wins over the `*` catch-all; that is what
 * makes spare parts round to a tenth in their low band while everything else
 * rounds to a whole unit.
 */
export function selectRule(
  rules: RoundingRule[],
  value: Dec,
  kind: PriceKind,
  currencyIso: string,
  mpg: string
): RoundingRule | null {
  let fallback: RoundingRule | null = null
  for (const rule of rules) {
    if (rule.condition !== kind) continue
    if (rule.currencyIso !== currencyIso) continue
    if (compare(value, rule.rangeFrom) < 0 || compare(value, rule.rangeTo) > 0) continue
    if (rule.mpg === mpg) return rule
    if (rule.mpg === '*' && !fallback) fallback = rule
  }
  return fallback
}

/**
 * The whole unit, used when no rule covers a value.
 *
 * That happens for real prices: the USD list rule starts at 100, so a zero-priced
 * carrier article matches nothing. The configurator still writes `0`, not `0.00`,
 * so an unmatched value is not left at whatever scale the conversion gave it.
 */
const WHOLE_UNIT = parseDecimal('1')
const ZERO = parseDecimal('0')
const ONE = parseDecimal('1')

/** Applies the catalog's rounding, falling back to the whole unit. */
export function applyRounding(
  rules: RoundingRule[],
  value: Dec,
  kind: PriceKind,
  currencyIso: string,
  mpg: string
): Dec {
  const rule = selectRule(rules, value, kind, currencyIso, mpg)
  return rule
    ? roundToQuantum(value, rule.roundTo, rule.mode)
    : roundToQuantum(value, WHOLE_UNIT, 'commercial')
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
    out.set(discountKey(tagText(block, 'MPG'), tagText(block, 'PriceListName')), factor)
  }
  return out
}

export function discountKey(mpg: string, priceListName: string): string {
  return `${mpg}\u0000${priceListName}`
}
