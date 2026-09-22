import { describe, it, expect } from 'vitest'
import { add, compare, divide, formatDecimal, fromInt, multiply, parseDecimal, roundToQuantum } from '../decimal.ts'
import { applyRounding, scanRoundingRules } from '../roundingRules.ts'

const d = parseDecimal
const f = formatDecimal

describe('decimal keeps scale the way .NET does', () => {
  it('round-trips a value with its scale', () => {
    expect(f(d('4145.0000000000000000000000000'))).toBe('4145.0000000000000000000000000')
    expect(f(d('1771.0'))).toBe('1771.0')
    expect(f(d('2610'))).toBe('2610')
    expect(f(d('-0.05'))).toBe('-0.05')
  })

  it('adds scales on multiply and takes the larger on add', () => {
    expect(f(multiply(d('2270'), d('1.15')))).toBe('2610.50')
    expect(f(add(d('1.5'), d('2.25')))).toBe('3.75')
  })

  it('divides to a given number of places, half away from zero', () => {
    expect(f(divide(d('1'), d('2'), 2))).toBe('0.50')
    expect(f(divide(d('1'), d('3'), 5))).toBe('0.33333')
    expect(f(divide(d('2'), d('3'), 5))).toBe('0.66667')
  })

  // Changed 2026-09-22: a .NET decimal's scale field is 0..28, and an exact
  // quotient comes back normalized. Both are visible in artifacts — an order
  // records `1771.0` for the first and `41533.999999999999999999999999` for
  // the second, and a 29-place division produced `41534.000000000000000000000000`.
  it('divides at most 28 places and normalizes an exact quotient', () => {
    expect(f(divide(d('1771'), d('2530')))).toBe('0.7')
    expect(f(divide(d('1'), d('3'))).length).toBe('0.'.length + 28)
    expect(f(multiply(d('2530'), divide(d('1771'), d('2530'))))).toBe('1771.0')
    expect(f(multiply(d('56250'), divide(d('41534'), d('56250')))))
      .toBe('41533.999999999999999999999999')
  })

  it('compares across scales', () => {
    expect(compare(d('1.50'), d('1.5'))).toBe(0)
    expect(compare(d('1.5'), d('1.50001'))).toBe(-1)
  })
})

describe('roundToQuantum', () => {
  // The exact half that made a JS number get 2611 where the file says 2610.
  it('rounds down to a multiple of ten', () => {
    expect(f(roundToQuantum(d('2610.50'), d('10'), 'down'))).toBe('2610')
  })
  it('rounds up to a tenth', () => {
    expect(f(roundToQuantum(d('12.21'), d('0.1'), 'up'))).toBe('12.3')
  })
  it('commercial rounding is half away from zero', () => {
    expect(f(roundToQuantum(d('2.5'), d('1'), 'commercial'))).toBe('3')
    expect(f(roundToQuantum(d('3.5'), d('1'), 'commercial'))).toBe('4')
    expect(f(roundToQuantum(d('-2.5'), d('1'), 'commercial'))).toBe('-3')
  })
  // What rule "1 - commercial Rounding" actually does: RoundingRuleExt calls
  // Math.Round, which is MidpointRounding.ToEven whatever the rule is called.
  it('rule 1 is banker\'s rounding despite its name', () => {
    expect(f(roundToQuantum(d('2.5'), d('1'), 'even'))).toBe('2')
    expect(f(roundToQuantum(d('3.5'), d('1'), 'even'))).toBe('4')
    expect(f(roundToQuantum(d('-73.5'), d('1'), 'even'))).toBe('-74')
    expect(f(roundToQuantum(d('-12.764'), d('1'), 'even'))).toBe('-13')
  })
  it('takes the quantum\'s scale, which is what shapes the price', () => {
    expect(f(roundToQuantum(d('1827.35'), d('1'), 'commercial'))).toBe('1827')
    expect(f(roundToQuantum(d('1827.35'), d('0.1'), 'commercial'))).toBe('1827.4')
  })
  it('leaves the value alone for a zero quantum', () => {
    expect(f(roundToQuantum(d('1.234'), fromInt(0), 'down'))).toBe('1.234')
  })
})

describe('rounding rules from a catalog', () => {
  const CONFIG = `<AdministrationData><RoundingRules>
    <RoundingRule><Rule>3 - round down</Rule><Condition>MSRP</Condition><CurrencyIso>USD</CurrencyIso><MPG>*</MPG><RangeFrom>100</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>10</RoundTo></RoundingRule>
    <RoundingRule><Rule>2 - round up</Rule><Condition>DP</Condition><CurrencyIso>USD</CurrencyIso><MPG>Spareparts</MPG><RangeFrom>0.01</RangeFrom><RangeTo>100</RangeTo><RoundTo>0.1</RoundTo></RoundingRule>
    <RoundingRule><Rule>1 - commercial Rounding</Rule><Condition>DP</Condition><CurrencyIso>USD</CurrencyIso><MPG>*</MPG><RangeFrom>0</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>1</RoundTo></RoundingRule>
  </RoundingRules></AdministrationData>`
  const rules = scanRoundingRules(CONFIG)

  it('reads every rule', () => expect(rules).toHaveLength(3))

  it('rounds a list price down to ten', () => {
    expect(f(applyRounding(rules, d('2610.50'), 'MSRP', 'USD', 'Spareparts'))).toBe('2610')
  })

  it('prefers a product-group rule over the catch-all, inside its band', () => {
    expect(f(applyRounding(rules, d('12.21'), 'DP', 'USD', 'Spareparts'))).toBe('12.3')
  })

  it('falls back to the catch-all outside that band', () => {
    // 1771 is past the spare-parts band, so the whole-unit rule applies.
    expect(f(applyRounding(rules, d('1771.00'), 'DP', 'USD', 'Spareparts'))).toBe('1771')
  })

  // Changed 2026-09-22: the fallback is two decimal places, not the whole unit.
  // `RoundingRuleExt.Round`'s default arm is `Math.Round(price * 100m) / 100m`,
  // and an artifact records an accessory below the USD rule's band as `63.82`
  // — 55.5 x 1.15 = 63.825 rounded half to even — where the whole-unit fallback
  // gave 64. A zero still comes out `0` because the quotient normalizes.
  it('falls back to two decimal places when no rule covers the value', () => {
    expect(f(applyRounding(rules, d('63.825'), 'MSRP', 'USD', 'Accessories'))).toBe('63.82')
    expect(f(applyRounding(rules, d('2610.50'), 'MSRP', 'EUR', '*'))).toBe('2610.5')
    expect(f(applyRounding(rules, d('0.00'), 'MSRP', 'USD', 'No Discount'))).toBe('0')
  })

  // The upper bound is exclusive — `RangeFrom <= price && RangeTo > price` —
  // and the group pass runs before the catch-all pass, so a `*` rule earlier in
  // the table never shadows a group rule later in it.
  it('treats RangeTo as exclusive', () => {
    // 99.99 is still inside the spare-parts band, so it keeps the tenth's scale.
    expect(f(applyRounding(rules, d('99.99'), 'DP', 'USD', 'Spareparts'))).toBe('100.0')
    // 100 is the band's RangeTo, which excludes it: the catch-all takes over.
    expect(f(applyRounding(rules, d('100'), 'DP', 'USD', 'Spareparts'))).toBe('100')
  })
})
