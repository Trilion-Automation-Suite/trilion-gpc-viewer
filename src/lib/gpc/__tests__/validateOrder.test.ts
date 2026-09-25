import { describe, expect, it } from 'vitest'
import { createBlankOrderXml } from '../../createBlankOrder.js'
import { parseOrder } from '../../parseOrder.js'
import { currencyRow, readPdbConfig } from '../blankOrder.ts'
import { catalogContainer } from '../catalogContainer.ts'
import { catalogBlankOrder } from '../../newOrderXml.ts'
import { METHOD_DEFLATE } from '../container.ts'
import type { GpcContainer } from '../container.ts'
import { patchOrderXml } from '../../patchOrder.js'
import { describeViolations, validateOrderXml } from '../validateOrder.ts'
import { MEMBER_ORDER } from '../memberOrder.ts'
import { dotNetLocalTimestamp, startOrderFromCatalogBlank } from '../../newOrderXml.js'

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

describe('a new order starts from the catalog, not a template', () => {
  it('dates a blank order the way .NET does', () => {
    const stamp = dotNetLocalTimestamp(new Date(2026, 8, 18, 11, 28, 10, 738))
    // Local time with an offset and seven fractional digits, as every
    // reference file writes it — not toISOString's UTC with three.
    expect(stamp).toMatch(/^2026-09-18T11:28:10\.7380000[-+]\d{2}:\d{2}$/)
  })

  it('changes GPC\'s own blank order only where a new order must', () => {
    const blank = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<OrderData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
      '  <AccountDetailsData>',
      '    <IsDistributor>false</IsDistributor>',
      '    <IsNewCustomer>false</IsNewCustomer>',
      '  </AccountDetailsData>',
      '  <CleanOrder>false</CleanOrder>',
      '  <CreationDate>2026-09-18T11:28:10.7381171-07:00</CreationDate>',
      '  <DiscountSplitCurrencyShare xsi:nil="true" />',
      '  <EndDate xsi:nil="true" />',
      '  <LastModified>2026-09-18T11:28:10.7381171-07:00</LastModified>',
      '  <OrderStatus>Editing</OrderStatus>',
      '  <PriceList>Partner</PriceList>',
      '  <Username>Direct_Solutions_Partner</Username>',
      '</OrderData>',
    ].join('\r\n')

    const started = startOrderFromCatalogBlank(blank, {
      catalog: 'PDB290_09-2026',
      root: { Distributor: '2104995' },
      now: new Date(2026, 8, 22, 9, 0, 0, 0),
    })

    expect(describeViolations(validateOrderXml(started))).toBe('')
    // Distributor belongs after DiscountSplitCurrencyShare and before EndDate.
    expect(started.indexOf('<Distributor>')).toBeGreaterThan(started.indexOf('<DiscountSplitCurrencyShare'))
    expect(started.indexOf('<Distributor>')).toBeLessThan(started.indexOf('<EndDate'))
    // SourceFileName belongs before Username.
    expect(started.indexOf('<SourceFileName>')).toBeLessThan(started.indexOf('<Username>'))
    // Everything else is untouched, xsi:nil included.
    expect(started).toContain('<EndDate xsi:nil="true" />')
    expect(started).toContain('<Username>Direct_Solutions_Partner</Username>')
    expect(started).not.toContain('2026-09-18T11:28:10')
  })
})

describe('a new order is not the partner\'s own account', () => {
  it('leaves AccountNumber alone, as GPC does', () => {
    // GPC writes no AccountNumber — not in any reference file, nor in the
    // blank order a catalog ships. It is the *customer's* number at GOM; the
    // distributor's id belongs in <Distributor>, which is set separately.
    const blank = createBlankOrderXml()
    const order = parseOrder(blank)
    expect(order.account.accountNumber).toBe('')
    expect(order.account.isGomPartner).toBe(false)
  })

  it('still flags one when an account number is present', () => {
    // The Account tab's checkbox sets the number; the flag follows from it.
    const withNumber = createBlankOrderXml().replace(
      '<Country>United States of America</Country>',
      '<AccountNumber>2104995</AccountNumber>\r\n    <Country>United States of America</Country>'
    )
    expect(parseOrder(withNumber).account.isGomPartner).toBe(true)
  })
})

describe('the currency an order is quoted in', () => {
  /**
   * A catalog's blank order carries the currency the catalog was built with.
   * PDB290 as shipped to this office says EUR at an exchange rate of 1.00, so
   * every new order was priced in euros while being quoted in dollars — which
   * looks entirely normal on screen.
   */
  it('takes the house currency from the catalog, not the blank order', () => {
    const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CurrenciesData>
    <Currencies>
      <Currency>
        <Iso>EUR</Iso>
        <Display>EUR</Display>
        <Description>Euro</Description>
        <ExchangeRate>1.00</ExchangeRate>
        <ValidFrom>639131976000000000</ValidFrom>
      </Currency>
      <Currency>
        <Iso>USD</Iso>
        <Display>USD</Display>
        <Description>US Dollar</Description>
        <ExchangeRate>1.10</ExchangeRate>
        <ValidFrom>639000000000000000</ValidFrom>
      </Currency>
      <Currency>
        <Iso>USD</Iso>
        <Display>USD</Display>
        <Description>US Dollar</Description>
        <ExchangeRate>1.15</ExchangeRate>
        <ValidFrom>639131976000000000</ValidFrom>
      </Currency>
    </Currencies>
  </CurrenciesData>
</AdministrationData>`
    const row = currencyRow(readPdbConfig(catalogContainer(CONFIG)), 'USD')
    const value = (name: string) => {
      const m = row.members.find((x) => x.name === name)
      return m && m.value.kind === 'text' ? m.value.value : undefined
    }
    // Newest by ValidFrom, which is .NET ticks as a plain long — not a date.
    expect(value('ExchangeRate')).toBe('1.15')
    expect(value('ValidFrom')).toBe('639131976000000000')
  })
})

describe('what counts as a blank order to start from', () => {
  const PACKAGE = (orderXml: string): GpcContainer => ({
    entries: [{ name: 'order.xml', data: new TextEncoder().encode(orderXml), method: METHOD_DEFLATE }],
    dosTime: 0,
    dosDate: 0,
  })

  const BLANK = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<OrderData>',
    '  <DependentListsData />',
    '  <FreeListArticlesData />',
    '  <AccountDetailsData>',
    '    <IsDistributor>false</IsDistributor>',
    '  </AccountDetailsData>',
    '  <PriceList>Partner</PriceList>',
    '</OrderData>',
  ].join('\r\n')

  it('accepts a catalog\'s own blank order', () => {
    expect(catalogBlankOrder(PACKAGE(BLANK))).toContain('<PriceList>Partner</PriceList>')
  })

  it('refuses one that carries line items', () => {
    // loadPdbFile takes a .gconfiguration as a source of config.xml, which is
    // legitimate — but it stores the whole package. Using that order.xml as
    // the template made every new order a copy of somebody else's.
    const withItems = BLANK.replace(
      '  <FreeListArticlesData />',
      '  <FreeListArticlesData>\r\n    <FreeListScreenData>\r\n      <No>1</No>\r\n    </FreeListScreenData>\r\n  </FreeListArticlesData>'
    )
    expect(catalogBlankOrder(PACKAGE(withItems))).toBeNull()
  })

  it('refuses one that names a customer', () => {
    const withCustomer = BLANK.replace(
      '    <IsDistributor>false</IsDistributor>',
      '    <CompanyName>Zimmer Biomet</CompanyName>\r\n    <IsDistributor>false</IsDistributor>'
    )
    expect(catalogBlankOrder(PACKAGE(withCustomer))).toBeNull()
  })

  it('is not fooled by an empty CompanyName element', () => {
    const empty = BLANK.replace(
      '    <IsDistributor>false</IsDistributor>',
      '    <CompanyName />\r\n    <IsDistributor>false</IsDistributor>'
    )
    expect(catalogBlankOrder(PACKAGE(empty))).not.toBeNull()
  })

  it('refuses a package with no order at all', () => {
    expect(catalogBlankOrder({ entries: [], dosTime: 0, dosDate: 0 })).toBeNull()
  })
})
