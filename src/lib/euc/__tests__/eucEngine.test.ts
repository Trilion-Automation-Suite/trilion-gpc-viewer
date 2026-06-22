import { describe, it, expect } from 'vitest'
import { EUC_RULES } from '../eucRules.ts'
import { evaluateEuc, type EucReference } from '../eucEngine.ts'
import { deriveReference } from '../deriveReference.ts'
import type { OrderSummary } from '../../../types/order.ts'

const reference: EucReference = {
  expected: { destinationCountry: 'United States' },
  order: {
    consigneeCompany: 'Lockheed Martin Corporation',
    endUserCompany: 'Lockheed Martin Corporation',
    systemValue: 154000,
  },
  fx: { orderToEur: 0.92 },
}

const GOOD = `
END-USE CERTIFICATE (EUC) for presentation to the Export Control Authorities of the Federal Republic of Germany
Section A – Parties
Consignee (name, address, contact details and website in block letters)
Lockheed Martin Corporation, 1 Lockheed Boulevard, Fort Worth, TX 76101, USA. Contact: jane.doe@lmco.com
End-user (name, address) if different from consignee
Lockheed Martin Corporation, Fort Worth, TX 76101. jane.doe@lmco.com
Supplier (name, address, contact details and website in block letters)
Carl Zeiss GOM Metrology GmbH, Schmitzstr. 2, 38122 Braunschweig, Germany
Section B – Items
Description of items: Complete ARAMIS system with all accessories
Quantity/Weight: [1] Set
Value (EUR): EUR 142,000
Section C – Final destination
Country and physical address: Lockheed Martin Corporation, Fort Worth, TX 76101, United States of America
Section D – End-use
Intended end-use: Testing of materials and structures. X
Section E – Declaration of commitment with regard to goods and software
the items will remain in country UNITED STATES OF AMERICA
Section F – Declaration of commitment with regard to technology
goods derived will remain in country UNITED STATES OF AMERICA
`

const BAD = `
END-USE CERTIFICATE (EUC)
Section A – Parties
Consignee (name, address, contact details and website in block letters)
End-user (name, address) if different from consignee
Supplier (name, address, contact details and website in block letters)
Trilion Quality Systems, Plymouth Meeting, PA
Section B – Items
Description of items: Camera system
Value: USD 154,000
Section C – Final destination
Country and physical address:
Section D – End-use
Section E – Declaration of commitment with regard to goods and software
the items will remain in country
Section F – Declaration of commitment with regard to technology
goods derived will remain in country
`

describe('evaluateEuc', () => {
  it('passes a correctly completed EUC', () => {
    const r = evaluateEuc(GOOD, EUC_RULES, reference)
    expect(r.overall).toBe('READY')
    expect(r.summary.fail).toBe(0)
    expect(r.sectionsFound).toContain('E')
    expect(r.sectionsFound).toContain('F')
  })

  it('fails a broken EUC and flags the key problems', () => {
    const r = evaluateEuc(BAD, EUC_RULES, reference)
    expect(r.overall).toBe('FAIL')
    const fail = (id: string) => r.results.find((x) => x.id === id)?.status
    expect(fail('A-supplier-name')).toBe('fail')
    expect(fail('A-consignee-present')).toBe('fail')
    expect(fail('B-value-eur')).toBe('fail')
    expect(fail('C-destination-present')).toBe('fail')
    expect(fail('E-country-blank')).toBe('fail')
    expect(fail('F-country-blank')).toBe('fail')
  })

  it('detects a likely scanned/empty document', () => {
    const r = evaluateEuc('   ', EUC_RULES, reference)
    expect(r.isLikelyScan).toBe(true)
  })
})

describe('deriveReference', () => {
  const order = {
    currency: 'USD',
    discountForCustomer: 0,
    account: { companyName: 'Lockheed Martin Corporation', country: 'United States' },
    administration: { shippingCompanyName: 'Lockheed Martin Corporation', shippingCountry: 'United States' },
    items: [
      { no: '1', name: 'Complete ARAMIS system', systemType: 'ARAMIS', category: 'System', isSub: false, totalMsrp: 154000, discountOverride: null },
    ],
  } as unknown as OrderSummary

  it('derives consignee, system value, and EUR suggestion from the order', () => {
    const { reference: ref, info } = deriveReference(order, { EUR: 1, USD: 1.087 })
    expect(info.consigneeCompany).toBe('Lockheed Martin Corporation')
    expect(ref.order.systemValue).toBe(154000)
    // 154000 / 1.087 ≈ 141,674 -> rounded to nearest 1,000
    expect(info.suggestedEur).toBe(142000)
  })

  it('returns no fx factor when the order currency rate is missing', () => {
    const { info } = deriveReference(order, { EUR: 1 })
    expect(info.fxFactorToEur).toBeNull()
    expect(info.suggestedEur).toBeNull()
  })
})
