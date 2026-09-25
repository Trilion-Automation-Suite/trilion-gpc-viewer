import { describe, expect, it } from 'vitest'
import { isUntitled, orderFileName, UNTITLED_ORDER } from '../orderFileName.ts'

describe('naming a pasted order', () => {
  it('joins the order number and the customer', () => {
    expect(orderFileName('Q2608-181JG', 'Zimmer Biomet')).toBe('Q2608-181JG_Zimmer Biomet.gconfiguration')
  })

  it('uses whichever part it has', () => {
    expect(orderFileName('Q2608-181JG', '')).toBe('Q2608-181JG.gconfiguration')
    expect(orderFileName('', 'Zimmer Biomet')).toBe('Zimmer Biomet.gconfiguration')
  })

  it('leaves the name alone when it knows nothing', () => {
    expect(orderFileName('', '')).toBeNull()
    expect(orderFileName('  ', ' . ')).toBeNull()
  })

  it('removes what a file system will not take', () => {
    // Windows forbids these outright; a name carrying one cannot be saved.
    expect(orderFileName('Q1/2', 'Acme: A*B?"C<D>E|F')).toBe('Q1 2_Acme A B C D E F.gconfiguration')
  })

  it('will not end on a dot or a space, which Windows silently drops', () => {
    expect(orderFileName('Q1.', 'Acme Inc. ')).toBe('Q1_Acme Inc.gconfiguration')
  })

  it('keeps the name short enough to survive a duplicate suffix', () => {
    const name = orderFileName('Q'.repeat(200), 'C'.repeat(200))!
    expect(name.length).toBeLessThanOrEqual(120 + '.gconfiguration'.length)
    expect(name.endsWith('.gconfiguration')).toBe(true)
  })

  it('renames only an order nobody has named', () => {
    expect(isUntitled(UNTITLED_ORDER)).toBe(true)
    expect(isUntitled('New Order (4).gconfiguration')).toBe(true)
    expect(isUntitled('')).toBe(true)
    // Opened from disk: the operator chose this, and a save must not move it.
    expect(isUntitled('Zimmer 2026 renewal.gconfiguration')).toBe(false)
    expect(isUntitled('calibrationobjectexample.gconfiguration')).toBe(false)
  })
})
