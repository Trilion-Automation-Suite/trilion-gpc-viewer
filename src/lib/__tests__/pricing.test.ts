import { describe, it, expect } from 'vitest'
import {
  calcEndCustomerPrice,
  formatPrice,
  formatPercent,
  parseItemNo,
} from '../pricing.js'

describe('calcEndCustomerPrice', () => {
  it('applies 25% discount to MSRP', () => {
    expect(calcEndCustomerPrice(111380, 0.25)).toBe(83535)
  })

  it('applies 0% discount (no change)', () => {
    expect(calcEndCustomerPrice(100, 0)).toBe(100)
  })

  it('applies 100% discount (free)', () => {
    expect(calcEndCustomerPrice(100, 1)).toBe(0)
  })

  it('applies partial discount', () => {
    expect(calcEndCustomerPrice(200, 0.1)).toBeCloseTo(180, 5)
  })
})

describe('formatPrice', () => {
  it('formats a typical price with commas', () => {
    expect(formatPrice(111380)).toBe('111,380.00')
  })

  it('returns empty string for null', () => {
    expect(formatPrice(null)).toBe('')
  })

  it('formats zero', () => {
    expect(formatPrice(0)).toBe('0.00')
  })

  it('formats small number without commas', () => {
    expect(formatPrice(999.9)).toBe('999.90')
  })

  it('respects custom decimal places', () => {
    expect(formatPrice(1234.5, 0)).toBe('1,235')
  })

  it('formats large number with multiple comma groups', () => {
    expect(formatPrice(1234567.89)).toBe('1,234,567.89')
  })
})

describe('formatPercent', () => {
  it('formats 0.25 as "25.00%"', () => {
    expect(formatPercent(0.25)).toBe('25.00%')
  })

  it('returns empty string for null', () => {
    expect(formatPercent(null)).toBe('')
  })

  it('formats 0 as "0.00%"', () => {
    expect(formatPercent(0)).toBe('0.00%')
  })

  it('formats 1 as "100.00%"', () => {
    expect(formatPercent(1)).toBe('100.00%')
  })

  it('formats fractional percentage correctly', () => {
    expect(formatPercent(0.1234)).toBe('12.34%')
  })
})

describe('parseItemNo', () => {
  it('parses single number', () => {
    expect(parseItemNo('1')).toEqual([1])
  })

  it('parses dotted number', () => {
    expect(parseItemNo('1.2.3')).toEqual([1, 2, 3])
  })

  it('parses two-segment number', () => {
    expect(parseItemNo('2.3')).toEqual([2, 3])
  })

  it('parses large number', () => {
    expect(parseItemNo('10')).toEqual([10])
  })

  it('handles empty string', () => {
    expect(parseItemNo('')).toEqual([0])
  })

  it('produces correct sort order: 1 < 1.1 < 1.2 < 2 < 10', () => {
    const nos = ['10', '2', '1.2', '1', '1.1']
    const sorted = [...nos].sort((a, b) => {
      const na = parseItemNo(a)
      const nb = parseItemNo(b)
      for (let i = 0; i < Math.max(na.length, nb.length); i++) {
        const va = na[i] ?? -1
        const vb = nb[i] ?? -1
        if (va !== vb) return va - vb
      }
      return 0
    })
    expect(sorted).toEqual(['1', '1.1', '1.2', '2', '10'])
  })
})
