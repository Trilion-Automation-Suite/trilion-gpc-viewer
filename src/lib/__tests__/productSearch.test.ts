import { describe, it, expect } from 'vitest'
import { searchEntries } from '../productSearch.ts'

const names = (xs: Array<{ name: string }>) => xs.map((x) => x.name)

// Shaped like the catalog -- priced products, in-system components at 0, licences --
// with made-up numbers and prices.
const CATALOG = [
  { name: '0.125m CFK Scalebar Set 20x10mm - Coding 0-3', sapNr: '100001-0000-001', msrp: 100 },
  { name: '2026 Sensor Driver ARAMIS', sapNr: '100001-0000-002', msrp: 200 },
  { name: 'ARAMIS SRX Case for CF 600', sapNr: '100001-0000-003', msrp: 300 },
  { name: 'ARAMIS SRX 1200 Basic Unit (in-sys)', sapNr: '100001-0000-004', msrp: 0 },
  { name: 'MV1150 for SRX frame 1200', sapNr: '100001-0000-005', msrp: 400 },
  { name: 'Case for ARAMIS for Camera Frame 1200', sapNr: '100001-0000-006', msrp: 500 },
  { name: 'Paramiscellaneous Adapter', sapNr: '100001-0000-007', msrp: 10 },
]

describe('product search', () => {
  it('finds nothing the query does not name', () => {
    expect(names(searchEntries(CATALOG, 'aramis'))).not.toContain('0.125m CFK Scalebar Set 20x10mm - Coding 0-3')
  })

  it('puts a whole-word match above a match inside a word', () => {
    const hits = names(searchEntries(CATALOG, 'aramis'))
    expect(hits.at(-1)).toBe('Paramiscellaneous Adapter')
  })

  it('sinks in-system components and unpriced rows below sellable products', () => {
    const hits = names(searchEntries(CATALOG, 'srx 1200'))
    expect(hits).toEqual(['MV1150 for SRX frame 1200', 'ARAMIS SRX 1200 Basic Unit (in-sys)'])
  })

  it('matches every word, in any order', () => {
    expect(names(searchEntries(CATALOG, '1200 case'))).toEqual(['Case for ARAMIS for Camera Frame 1200'])
  })

  it('takes a SAP number typed in full straight to its article', () => {
    expect(names(searchEntries(CATALOG, '100001-0000-001'))).toEqual(['0.125m CFK Scalebar Set 20x10mm - Coding 0-3'])
  })

  it('prefers the name that starts with what was typed', () => {
    expect(names(searchEntries(CATALOG, 'mv1150'))[0]).toBe('MV1150 for SRX frame 1200')
  })
})
