import { describe, it, expect } from 'vitest'
import { patchOrderXml } from '../patchOrder.js'
import { parseOrder } from '../parseOrder.js'
import { createBlankOrderXml } from '../createBlankOrder.js'
import type { ConfigItem, OrderSummary } from '../../types/order.js'

// ---------------------------------------------------------------------------
// Fixture: order.xml with all patchable sections present
// ---------------------------------------------------------------------------

const ORDER_XML = `<?xml version="1.0" encoding="utf-8"?>
<OrderData>
  <OrderNumber>ORD-ORIGINAL</OrderNumber>
  <CaseId>CASE-ORIGINAL</CaseId>
  <OpportunityID>OPP-ORIGINAL</OpportunityID>
  <Distributor>Acme Corp</Distributor>
  <PriceList>PL-2025</PriceList>
  <Username>john.doe</Username>
  <OrderDate>2025-01-15</OrderDate>
  <Currency><Display>EUR</Display></Currency>
  <DestinationNew><Country>Germany</Country></DestinationNew>
  <Msrp>200000.00</Msrp>
  <Dp>150000.00</Dp>
  <DiscountForCustomer>0.25</DiscountForCustomer>
  <FinalPriceForEndCustomer>150000.00</FinalPriceForEndCustomer>
  <OrderValueToGom>120000.00</OrderValueToGom>
  <DependentListsData />
  <FreeArticlesData />
  <FreeListArticlesData />
  <SupportArticlesData />

  <AccountDetailsData>
    <CompanyName>Original Co</CompanyName>
    <CompanyNameTwo></CompanyNameTwo>
    <CompanyType>Customer</CompanyType>
    <Department>Engineering</Department>
    <DepartmentTwo></DepartmentTwo>
    <Street>123 Main St</Street>
    <StreetTwo></StreetTwo>
    <StreetThree></StreetThree>
    <HpcPoBox></HpcPoBox>
    <City>Springfield</City>
    <StateProvince>IL</StateProvince>
    <ZipPostalCode>62701</ZipPostalCode>
    <Country>USA</Country>
    <Phone>5551234</Phone>
    <PhonePrefix>312</PhonePrefix>
    <PhoneCountryCode>+1</PhoneCountryCode>
    <Email>orig@example.com</Email>
    <Website>http://orig.example.com</Website>
    <AccountNumber>ACC-001</AccountNumber>
    <VatId>VAT-001</VatId>
    <CustomerIdAtGom>GOM-001</CustomerIdAtGom>
    <Reference>REF-001</Reference>
    <IsDistributor>false</IsDistributor>
    <IsNewCustomer>false</IsNewCustomer>
  </AccountDetailsData>

  <LocalTechnicalContact>
    <FirstName>John</FirstName>
    <LastName>Doe</LastName>
    <Title>Mr</Title>
    <AcademicDegree></AcademicDegree>
    <Gender>Male</Gender>
    <Position>Engineer</Position>
    <Department>R&amp;D</Department>
    <Source>Direct</Source>
    <Email>john@orig.com</Email>
    <AdditionalEmail></AdditionalEmail>
    <BusinessPhone>5551000</BusinessPhone>
    <BusinessPhonePrefix>312</BusinessPhonePrefix>
    <BusinessPhoneCountryCode>+1</BusinessPhoneCountryCode>
    <MobilePhone>5552000</MobilePhone>
    <MobilePhonePrefix>312</MobilePhonePrefix>
    <MobilePhoneCountryCode>+1</MobilePhoneCountryCode>
    <AdditionalPhone></AdditionalPhone>
    <AdditionalPhonePrefix></AdditionalPhonePrefix>
    <AdditionalPhoneCountryCode></AdditionalPhoneCountryCode>
  </LocalTechnicalContact>

  <OrderAdministration>
    <InvoiceAddressType>Standard</InvoiceAddressType>
    <InvoiceAccountNumber>INV-ACC-001</InvoiceAccountNumber>
    <InvoiceCompanyName>Invoice Co</InvoiceCompanyName>
    <InvoiceCompanyNameTwo></InvoiceCompanyNameTwo>
    <InvoiceDepartment>Finance</InvoiceDepartment>
    <InvoiceDepartmentTwo></InvoiceDepartmentTwo>
    <InvoiceStreet>456 Invoice Ave</InvoiceStreet>
    <InvoiceStreetTwo></InvoiceStreetTwo>
    <InvoiceStreetThree></InvoiceStreetThree>
    <InvoiceHPCPOBox></InvoiceHPCPOBox>
    <InvoiceCity>Chicago</InvoiceCity>
    <InvoiceState>IL</InvoiceState>
    <InvoiceZIP>60601</InvoiceZIP>
    <InvoiceCountry>USA</InvoiceCountry>
    <InvoicePaymentTerm>Net30</InvoicePaymentTerm>
    <InvoiceNewCustomer>false</InvoiceNewCustomer>
    <ShippingAddressType>Standard</ShippingAddressType>
    <ShippingAccountNumber>SHIP-ACC-001</ShippingAccountNumber>
    <ShippingCompanyName>Ship To Co</ShippingCompanyName>
    <ShippingCompanyNameTwo></ShippingCompanyNameTwo>
    <ShippingDepartment>Receiving</ShippingDepartment>
    <ShippingDepartmentTwo></ShippingDepartmentTwo>
    <ShippingContactPerson>Jane Smith</ShippingContactPerson>
    <ShippingStreet>789 Ship St</ShippingStreet>
    <ShippingStreetTwo></ShippingStreetTwo>
    <ShippingStreetThree></ShippingStreetThree>
    <ShippingHPCPOBox></ShippingHPCPOBox>
    <ShippingCity>Rockford</ShippingCity>
    <ShippingState>IL</ShippingState>
    <ShippingZIP>61101</ShippingZIP>
    <ShippingCountry>USA</ShippingCountry>
    <ShippingFreightTerm>FOB</ShippingFreightTerm>
    <ShippingMethod>UPS Ground</ShippingMethod>
    <SpecialShippingInstructions>Leave at dock</SpecialShippingInstructions>
    <ShippingNewCustomer>false</ShippingNewCustomer>
  </OrderAdministration>
</OrderData>`

// Parse once to get a base OrderSummary to mutate in tests
const BASE_ORDER: OrderSummary = parseOrder(ORDER_XML)

// ---------------------------------------------------------------------------
// Helper: patch → re-parse to get the new OrderSummary
// ---------------------------------------------------------------------------
function patchAndReparse(order: OrderSummary): OrderSummary {
  const patched = patchOrderXml(ORDER_XML, order)
  return parseOrder(patched)
}

// ---------------------------------------------------------------------------
// Header field tests
// ---------------------------------------------------------------------------

describe('patchOrderXml — header fields', () => {
  it('patches OrderNumber', () => {
    const order = { ...BASE_ORDER, orderNumber: 'ORD-NEW-999' }
    expect(patchAndReparse(order).orderNumber).toBe('ORD-NEW-999')
  })

  it('patches CaseId', () => {
    const order = { ...BASE_ORDER, caseId: 'CASE-UPDATED' }
    expect(patchAndReparse(order).caseId).toBe('CASE-UPDATED')
  })

  it('patches OpportunityID', () => {
    const order = { ...BASE_ORDER, opportunityId: 'OPP-NEW-789' }
    expect(patchAndReparse(order).opportunityId).toBe('OPP-NEW-789')
  })

  it('clears a header field to empty string', () => {
    const order = { ...BASE_ORDER, caseId: '' }
    expect(patchAndReparse(order).caseId).toBe('')
  })

  it('preserves non-patched header fields (Distributor, OrderDate, etc.)', () => {
    const order = { ...BASE_ORDER, orderNumber: 'NEW' }
    const result = patchAndReparse(order)
    expect(result.distributor).toBe('Acme Corp')
    expect(result.orderDate).toBe('2025-01-15')
    expect(result.msrp).toBe(200000)
  })
})

// ---------------------------------------------------------------------------
// Account details tests
// ---------------------------------------------------------------------------

describe('patchOrderXml — account details', () => {
  it('patches company name', () => {
    const order = { ...BASE_ORDER, account: { ...BASE_ORDER.account, companyName: 'New Corp Ltd' } }
    expect(patchAndReparse(order).account.companyName).toBe('New Corp Ltd')
  })

  it('patches city', () => {
    const order = { ...BASE_ORDER, account: { ...BASE_ORDER.account, city: 'Austin' } }
    expect(patchAndReparse(order).account.city).toBe('Austin')
  })

  it('patches email', () => {
    const order = { ...BASE_ORDER, account: { ...BASE_ORDER.account, email: 'new@example.com' } }
    expect(patchAndReparse(order).account.email).toBe('new@example.com')
  })

  it('patches VAT ID', () => {
    const order = { ...BASE_ORDER, account: { ...BASE_ORDER.account, vatId: 'EU123456789' } }
    expect(patchAndReparse(order).account.vatId).toBe('EU123456789')
  })

  it('patches isDistributor boolean to true', () => {
    const order = { ...BASE_ORDER, account: { ...BASE_ORDER.account, isDistributor: true } }
    expect(patchAndReparse(order).account.isDistributor).toBe(true)
  })

  it('patches isNewCustomer boolean to true', () => {
    const order = { ...BASE_ORDER, account: { ...BASE_ORDER.account, isNewCustomer: true } }
    expect(patchAndReparse(order).account.isNewCustomer).toBe(true)
  })

  it('patches all address sub-fields independently', () => {
    const order = {
      ...BASE_ORDER,
      account: {
        ...BASE_ORDER.account,
        street: '1 New St',
        city: 'Dallas',
        stateProvince: 'TX',
        zipPostalCode: '75001',
        country: 'USA',
      },
    }
    const result = patchAndReparse(order).account
    expect(result.street).toBe('1 New St')
    expect(result.city).toBe('Dallas')
    expect(result.stateProvince).toBe('TX')
    expect(result.zipPostalCode).toBe('75001')
  })
})

// ---------------------------------------------------------------------------
// Technical contact tests
// ---------------------------------------------------------------------------

describe('patchOrderXml — technical contact', () => {
  it('patches first name', () => {
    const order = { ...BASE_ORDER, contact: { ...BASE_ORDER.contact, firstName: 'Alice' } }
    expect(patchAndReparse(order).contact.firstName).toBe('Alice')
  })

  it('patches last name', () => {
    const order = { ...BASE_ORDER, contact: { ...BASE_ORDER.contact, lastName: 'Smith' } }
    expect(patchAndReparse(order).contact.lastName).toBe('Smith')
  })

  it('patches email', () => {
    const order = { ...BASE_ORDER, contact: { ...BASE_ORDER.contact, email: 'alice@new.com' } }
    expect(patchAndReparse(order).contact.email).toBe('alice@new.com')
  })

  it('patches business phone', () => {
    const order = { ...BASE_ORDER, contact: { ...BASE_ORDER.contact, businessPhone: '9998887777' } }
    expect(patchAndReparse(order).contact.businessPhone).toBe('9998887777')
  })

  it('patches department', () => {
    const order = { ...BASE_ORDER, contact: { ...BASE_ORDER.contact, department: 'Sales' } }
    expect(patchAndReparse(order).contact.department).toBe('Sales')
  })
})

// ---------------------------------------------------------------------------
// Order administration tests
// ---------------------------------------------------------------------------

describe('patchOrderXml — order administration', () => {
  it('patches invoice company name', () => {
    const order = { ...BASE_ORDER, administration: { ...BASE_ORDER.administration, invoiceCompanyName: 'Patched Invoice LLC' } }
    expect(patchAndReparse(order).administration.invoiceCompanyName).toBe('Patched Invoice LLC')
  })

  it('patches invoice city', () => {
    const order = { ...BASE_ORDER, administration: { ...BASE_ORDER.administration, invoiceCity: 'Houston' } }
    expect(patchAndReparse(order).administration.invoiceCity).toBe('Houston')
  })

  it('patches invoice ZIP (tag is InvoiceZIP)', () => {
    const order = { ...BASE_ORDER, administration: { ...BASE_ORDER.administration, invoiceZip: '77001' } }
    expect(patchAndReparse(order).administration.invoiceZip).toBe('77001')
  })

  it('patches shipping company name', () => {
    const order = { ...BASE_ORDER, administration: { ...BASE_ORDER.administration, shippingCompanyName: 'Fast Ship Inc' } }
    expect(patchAndReparse(order).administration.shippingCompanyName).toBe('Fast Ship Inc')
  })

  it('patches shipping city', () => {
    const order = { ...BASE_ORDER, administration: { ...BASE_ORDER.administration, shippingCity: 'Denver' } }
    expect(patchAndReparse(order).administration.shippingCity).toBe('Denver')
  })

  it('patches shipping ZIP (tag is ShippingZIP)', () => {
    const order = { ...BASE_ORDER, administration: { ...BASE_ORDER.administration, shippingZip: '80201' } }
    expect(patchAndReparse(order).administration.shippingZip).toBe('80201')
  })

  it('patches special shipping instructions', () => {
    const order = { ...BASE_ORDER, administration: { ...BASE_ORDER.administration, specialShippingInstructions: 'Fragile — handle with care' } }
    expect(patchAndReparse(order).administration.specialShippingInstructions).toBe('Fragile — handle with care')
  })

  it('patches invoiceNewCustomer boolean to true', () => {
    const order = { ...BASE_ORDER, administration: { ...BASE_ORDER.administration, invoiceNewCustomer: true } }
    expect(patchAndReparse(order).administration.invoiceNewCustomer).toBe(true)
  })

  it('patches shippingNewCustomer boolean to true', () => {
    const order = { ...BASE_ORDER, administration: { ...BASE_ORDER.administration, shippingNewCustomer: true } }
    expect(patchAndReparse(order).administration.shippingNewCustomer).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Preservation and error tests
// ---------------------------------------------------------------------------

describe('patchOrderXml — preservation and errors', () => {
  it('preserves line items (DependentListsData) unchanged', () => {
    const order = { ...BASE_ORDER, orderNumber: 'X' }
    const result = patchAndReparse(order)
    expect(result.items).toEqual(BASE_ORDER.items)
  })

  it('preserves price totals unchanged', () => {
    const order = { ...BASE_ORDER, orderNumber: 'X' }
    const result = patchAndReparse(order)
    expect(result.msrp).toBe(200000)
    expect(result.dp).toBe(150000)
    expect(result.discountForCustomer).toBe(0.25)
  })

  it('throws on invalid original XML', () => {
    const bad = '<broken><xml'
    expect(() => patchOrderXml(bad, BASE_ORDER)).toThrow('patchOrderXml: XML parse error')
  })

  it('patchOrderXml output is valid XML that parseOrder can consume', () => {
    const patched = patchOrderXml(ORDER_XML, BASE_ORDER)
    expect(() => parseOrder(patched)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Reference-based tests: verify XML structure matches GPC format
// ---------------------------------------------------------------------------

/** Helper: parse XML string and return child tag names of first matching element */
function childTagNames(xml: string, parentTag: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const el = doc.getElementsByTagName(parentTag)[0]
  if (!el) return []
  return Array.from(el.children).map(c => c.tagName)
}

/** Helper: get text of a tag inside another tag */
function textInTag(xml: string, parentTag: string, childTag: string): string | null {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const el = doc.getElementsByTagName(parentTag)[0]
  if (!el) return null
  for (const child of Array.from(el.children)) {
    if (child.tagName === childTag) return child.textContent ?? ''
  }
  return null
}

describe('patchOrderXml — add license item matches GPC reference format', () => {
  function blankOrderWithLicense(opts: { zeissId: string; userName: string; name?: string }) {
    const blankXml = createBlankOrderXml()
    const blankOrder = parseOrder(blankXml)

    const licenseItem: ConfigItem = {
      no: '1',
      label: 'Configuration item 1',
      category: 'Software License',
      name: opts.name ?? 'ZEISS INSPECT Pro',
      systemType: '',
      totalMsrp: null,
      totalDp: null,
      discountOverride: null,
      isHidden: false,
      isSub: false,
      itemType: 'dependent',
      sections: [],
      isNew: true,
    }
    const smaItem: ConfigItem = {
      no: '1.1',
      label: 'SMA',
      category: 'SMA',
      name: 'SMA',
      systemType: '',
      totalMsrp: null,
      totalDp: null,
      discountOverride: null,
      isHidden: false,
      isSub: true,
      itemType: 'sub',
      sections: [],
      userZeissId: opts.zeissId,
      userName: opts.userName,
      isNew: true,
    }

    const order: OrderSummary = {
      ...blankOrder,
      items: [licenseItem, smaItem],
    }
    return patchOrderXml(blankXml, order)
  }

  it('DependentListScreenData has correct element order matching C# serialization', () => {
    const xml = blankOrderWithLicense({ zeissId: 'test@trilion.com', userName: 'Test User' })
    // Reference order from GPC: ConfigurationItem, UseInCalculation, No, Reply1, Reply2,
    // TotalDp, TotalMsrp, Discount, IsDiscountPercentage, IsHidden, Sections, SubConfigurations
    const tags = childTagNames(xml, 'DependentListScreenData')
    expect(tags).toEqual([
      'ConfigurationItem',
      'UseInCalculation',
      'No',
      'Reply1',
      'Reply2',
      'TotalDp',
      'TotalMsrp',
      'Discount',
      'IsDiscountPercentage',
      'IsHidden',
      'Sections',
      'SubConfigurations',
    ])
  })

  it('Reply1 and Reply2 are set on parent license item', () => {
    const xml = blankOrderWithLicense({ zeissId: 'licensing@trilion.com', userName: 'Trilion Licensing' })
    expect(textInTag(xml, 'DependentListScreenData', 'Reply1')).toBe('licensing@trilion.com')
    expect(textInTag(xml, 'DependentListScreenData', 'Reply2')).toBe('Trilion Licensing')
  })

  it('SMA sub-item has Reply1 and Reply2 set', () => {
    const xml = blankOrderWithLicense({ zeissId: 'licensing@trilion.com', userName: 'Trilion Licensing' })
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const subConf = doc.getElementsByTagName('SubConfigurations')[0]
    expect(subConf).toBeDefined()
    const smaEl = subConf?.children[0]
    expect(smaEl).toBeDefined()
    const reply1 = Array.from(smaEl!.children).find(c => c.tagName === 'Reply1')
    const reply2 = Array.from(smaEl!.children).find(c => c.tagName === 'Reply2')
    expect(reply1?.textContent).toBe('licensing@trilion.com')
    expect(reply2?.textContent).toBe('Trilion Licensing')
  })

  it('SMA sub-item element order matches C# serialization', () => {
    const xml = blankOrderWithLicense({ zeissId: 'x@y.com', userName: 'X Y' })
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    const subConf = doc.getElementsByTagName('SubConfigurations')[0]
    const smaEl = subConf?.children[0]
    const tags = Array.from(smaEl!.children).map(c => c.tagName)
    expect(tags).toEqual([
      'ConfigurationItem',
      'UseInCalculation',
      'No',
      'Reply1',
      'Reply2',
      'TotalDp',
      'TotalMsrp',
      'Discount',
      'IsDiscountPercentage',
      'IsHidden',
      'Sections',
      'SubConfigurations',
    ])
  })

  it('ConfigurationItem block has correct element order', () => {
    const xml = blankOrderWithLicense({ zeissId: '', userName: '' })
    const tags = childTagNames(xml, 'ConfigurationItem')
    expect(tags).toEqual([
      'ApplicableFee',
      'IsHidden',
      'AsSubItemOnly',
      'Flatten',
      'UserBlacklist',
      'RegionalRestrictionNotInTheseCountriesRegions',
      'GroupLevel1',
      'GroupLevel2',
      'GroupLevel3',
      'Name',
      'Parameter',
      'WorksheetArticleFilter',
      'ItemType',
      'AdditionalMandatoryFields',
      'IsOppIdMandatory',
      'Question1',
      'Question2',
      'Question3',
      'Question1Formats',
      'Question2Formats',
      'Question3Formats',
      'SapNr',
      'SapItemCategory',
      'ProductionArticles',
      'Discounts',
      'Unclean',
    ])
  })

  it('round-trips through parseOrder correctly', () => {
    const xml = blankOrderWithLicense({ zeissId: 'licensing@trilion.com', userName: 'Trilion Licensing' })
    const parsed = parseOrder(xml)
    expect(parsed.items.length).toBe(2)
    const parent = parsed.items.find(i => i.no === '1')
    const sma = parsed.items.find(i => i.no === '1.1')
    expect(parent).toBeDefined()
    expect(parent!.name).toBe('ZEISS INSPECT Pro')
    expect(parent!.itemType).toBe('dependent')
    expect(sma).toBeDefined()
    expect(sma!.name).toBe('SMA')
    expect(sma!.isSub).toBe(true)
  })
})

describe('patchOrderXml — add free article item matches GPC reference format', () => {
  it('FreeArticlesScreenData has correct element order with Reply fields', () => {
    const blankXml = createBlankOrderXml()
    const blankOrder = parseOrder(blankXml)

    const freeItem: ConfigItem = {
      no: '1',
      label: 'Configuration item 1',
      category: 'Accessories',
      name: 'Training Day',
      systemType: '',
      totalMsrp: null,
      totalDp: null,
      discountOverride: null,
      isHidden: false,
      isSub: false,
      itemType: 'free',
      sections: [{
        name: 'Training Day',
        articles: [{ name: 'Training Day', amount: 2, unit: 'pcs', priceOnRequest: false, unitMsrp: 1000, unitDp: 750, sapNr: '000250-0001-001' }],
        comments: '',
      }],
      isNew: true,
    }

    const order: OrderSummary = { ...blankOrder, items: [freeItem] }
    const xml = patchOrderXml(blankXml, order)

    const tags = childTagNames(xml, 'FreeArticlesScreenData')
    expect(tags).toEqual([
      'ConfigurationItem',
      'UseInCalculation',
      'No',
      'Reply1',
      'Reply2',
      'Reply3',
      'TotalDp',
      'TotalMsrp',
      'Discount',
      'IsDiscountPercentage',
      'IsHidden',
      'FreeArticles',
    ])
  })

  it('FreeArticle has correct structure', () => {
    const blankXml = createBlankOrderXml()
    const blankOrder = parseOrder(blankXml)

    const freeItem: ConfigItem = {
      no: '1',
      label: '',
      category: 'Services',
      name: 'Training Day',
      systemType: '',
      totalMsrp: null,
      totalDp: null,
      discountOverride: null,
      isHidden: false,
      isSub: false,
      itemType: 'free',
      sections: [{
        name: 'Training Day',
        articles: [{ name: 'Training Day', amount: 3, unit: 'days', priceOnRequest: false, unitMsrp: null, unitDp: null, sapNr: '604001-0001-000' }],
        comments: '',
      }],
      isNew: true,
    }

    const order: OrderSummary = { ...blankOrder, items: [freeItem] }
    const xml = patchOrderXml(blankXml, order)
    const doc = new DOMParser().parseFromString(xml, 'application/xml')

    const freeArt = doc.getElementsByTagName('FreeArticle')[0]
    expect(freeArt).toBeDefined()
    const artTags = Array.from(freeArt!.children).map(c => c.tagName)
    expect(artTags).toEqual([
      'Amount', 'Step', 'Article',
      'OverwrittenDp', 'OverwrittenMrsp', 'PriceOnRequest',
      'EuroMsrp', 'Msrp', 'Dp', 'SumMsrp', 'SumDp', 'CustomQuantityDiscount',
    ])

    // Verify amount
    expect(freeArt!.getElementsByTagName('Amount')[0]?.textContent).toBe('3')
    // Verify article details
    expect(freeArt!.querySelector('Article > LongName')?.textContent).toBe('Training Day')
    expect(freeArt!.querySelector('Article > SapNr')?.textContent).toBe('604001-0001-000')
    expect(freeArt!.querySelector('Article > Unit')?.textContent).toBe('days')
  })
})
