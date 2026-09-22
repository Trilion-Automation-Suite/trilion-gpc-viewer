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

/** Applies the catalog's rounding, or leaves the value alone when no rule fits. */
export function applyRounding(
  rules: RoundingRule[],
  value: Dec,
  kind: PriceKind,
  currencyIso: string,
  mpg: string
): Dec {
  const rule = selectRule(rules, value, kind, currencyIso, mpg)
  return rule ? roundToQuantum(value, rule.roundTo, rule.mode) : value
}
