import { describe, it, expect } from 'vitest'
import { patchOrderXml } from '../patchOrder.js'
import { parseOrder } from '../parseOrder.js'
import type { OrderSummary } from '../../types/order.js'

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
