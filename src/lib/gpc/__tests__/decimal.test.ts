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

  it('divides to 28 places, half away from zero', () => {
    expect(f(divide(d('1'), d('2'), 2))).toBe('0.50')
    expect(f(divide(d('1'), d('3'), 5))).toBe('0.33333')
    expect(f(divide(d('2'), d('3'), 5))).toBe('0.66667')
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
  it('commercial rounding is half away from zero, not banker\'s', () => {
    expect(f(roundToQuantum(d('2.5'), d('1'), 'commercial'))).toBe('3')
    expect(f(roundToQuantum(d('3.5'), d('1'), 'commercial'))).toBe('4')
    expect(f(roundToQuantum(d('-2.5'), d('1'), 'commercial'))).toBe('-3')
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

  it('ignores rules for another currency, leaving the value untouched', () => {
    expect(f(applyRounding(rules, d('2610.50'), 'MSRP', 'EUR', '*'))).toBe('2610.50')
  })
})
