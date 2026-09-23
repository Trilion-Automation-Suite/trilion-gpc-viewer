import { describe, expect, it } from 'vitest'
import { createBlankOrderXml } from '../../createBlankOrder.js'
import { parseOrder } from '../../parseOrder.js'
import { patchOrderXml } from '../../patchOrder.js'
import { describeViolations, validateOrderXml } from '../validateOrder.ts'
import { MEMBER_ORDER } from '../memberOrder.ts'

/**
 * The failure these guard against shipped three times. Every version wrote an
 * order.xml the webapp could read back perfectly and GPC refused outright,
 * because .NET's XmlSerializer reads a class as a sequence and we had three
 * nested classes in the wrong order. Nothing caught it, because an order GPC
 * itself writes leaves those members null — they are simply absent — so the
 * reference files agreed with us right up until someone filled in an address.
 */
describe('order.xml must match the declarations', () => {
  it('passes a blank new order', () => {
    const violations = validateOrderXml(createBlankOrderXml())
    expect(describeViolations(violations)).toBe('')
  })

  it('passes a blank order that has been saved', () => {
    const blank = createBlankOrderXml()
    const saved = patchOrderXml(blank, parseOrder(blank), [])
    expect(describeViolations(validateOrderXml(saved))).toBe('')
  })

  it('passes an order with every contact and address field filled in', () => {
    const blank = createBlankOrderXml()
    const order = parseOrder(blank)
    order.account = {
      ...order.account,
      companyName: 'Acme Metrology', companyNameTwo: 'Division Two', companyType: 'End Customer',
      department: 'QA', departmentTwo: 'Lab', street: '1 Example Way', streetTwo: 'Building 3',
      streetThree: 'Suite 7', hpcPoBox: 'PO 12', city: 'Portland', stateProvince: 'OR',
      zipPostalCode: '97205', country: 'United States of America', phone: '5035550100',
      phonePrefix: '503', phoneCountryCode: '+1', email: 'qa@example.com',
      website: 'example.com', accountNumber: '2104995', vatId: 'US123', customerIdAtGom: 'C-1',
      reference: 'PO-9',
    }
    order.contact = {
      ...order.contact,
      firstName: 'Alex', lastName: 'Rivera', title: 'Dr', academicDegree: 'PhD', gender: 'x',
      position: 'Engineer', department: 'QA', source: 'Web', email: 'alex@example.com',
      additionalEmail: 'alex2@example.com', businessPhone: '5035550101', businessPhonePrefix: '503',
      businessPhoneCountryCode: '+1', mobilePhone: '5035550102', mobilePhonePrefix: '503',
      mobilePhoneCountryCode: '+1', additionalPhone: '5035550103', additionalPhonePrefix: '503',
      additionalPhoneCountryCode: '+1',
    }
    order.administration = {
      ...order.administration,
      invoiceAccountNumber: '2104995', invoiceCompanyName: 'Acme', invoiceCompanyNameTwo: 'Two',
      invoiceDepartment: 'AP', invoiceDepartmentTwo: 'AP2', invoiceStreet: '1 Example Way',
      invoiceStreetTwo: 'B3', invoiceStreetThree: 'S7', invoiceHpcPoBox: 'PO 12',
      invoiceCity: 'Portland', invoiceState: 'OR', invoiceZip: '97205',
      invoiceCountry: 'United States of America', shippingAccountNumber: '2104995',
      shippingCompanyName: 'Acme', shippingCompanyNameTwo: 'Two', shippingDepartment: 'Recv',
      shippingDepartmentTwo: 'Recv2', shippingContactPerson: 'Alex Rivera',
      shippingStreet: '1 Example Way', shippingStreetTwo: 'B3', shippingStreetThree: 'S7',
      shippingHpcPoBox: 'PO 12', shippingCity: 'Portland', shippingState: 'OR',
      shippingZip: '97205', shippingCountry: 'United States of America',
      specialShippingInstructions: 'Call ahead',
    }

    const saved = patchOrderXml(blank, order, [])
    expect(describeViolations(validateOrderXml(saved))).toBe('')
    // The fields really were written — a validator that passes an empty
    // document would prove nothing.
    expect(saved).toContain('<CompanyName>Acme Metrology</CompanyName>')
    expect(saved).toContain('<ShippingContactPerson>Alex Rivera</ShippingContactPerson>')
  })

  it('reports an element that names no member', () => {
    const xml = createBlankOrderXml().replace('</OrderData>', '  <IsGomPartner>true</IsGomPartner>\r\n</OrderData>')
    expect(describeViolations(validateOrderXml(xml))).toContain('<IsGomPartner> names no member')
  })

  it('reports a member written out of order', () => {
    const xml = createBlankOrderXml().replace(
      '<Country>United States of America</Country>\r\n    <CountryCode>+1</CountryCode>\r\n    <ExportControl>false</ExportControl>',
      '<Country>United States of America</Country>\r\n    <CountryCode>+1</CountryCode>\r\n    <Iso>US</Iso>\r\n    <ExportControl>false</ExportControl>'
    )
    expect(describeViolations(validateOrderXml(xml))).toContain('<ExportControl> comes after <Iso>')
  })

  it('keeps the declaration table honest about what GPC actually writes', () => {
    // Spot-check against the artifacts' own ordering: these three classes were
    // each wrong before, and each is ordered unlike anything one would guess.
    expect(MEMBER_ORDER.CountryAndIso).toEqual(['Country', 'CountryCode', 'ExportControl', 'Iso', 'PriceFactor'])
    expect(MEMBER_ORDER.AccountDetailsData[0]).toBe('AccountNumber')
    expect(MEMBER_ORDER.LocalTechnicalContact[0]).toBe('AcademicDegree')
    expect(MEMBER_ORDER.OrderAdministration[0]).toBe('InvoiceAccountNumber')
  })
})
