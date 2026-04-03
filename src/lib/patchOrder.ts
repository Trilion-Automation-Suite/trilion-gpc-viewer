/**
 * Patches editable fields in an order.xml string using DOM manipulation,
 * then serialises back to XML.
 *
 * Strategy: parse the original XML into a Document, mutate only the elements
 * that correspond to user-edited fields, and re-serialise.  This preserves
 * every other element and attribute in the file exactly as-is, including
 * any fields the viewer does not parse.
 *
 * The XML tag names used here are the canonical names found in GPC order.xml
 * files and verified against parseOrder.ts.
 */

import type { AccountDetails, OrderAdministration, OrderSummary, TechnicalContact } from '../types/order.js'

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

/** Sets the text content of the first document-level element with tagName. */
function setDocTag(doc: Document, tagName: string, value: string): void {
  const el = doc.getElementsByTagName(tagName)[0]
  if (el) {
    el.textContent = value
  } else {
    // Safety: create if absent (shouldn't happen for known fields)
    const created = doc.createElement(tagName)
    created.textContent = value
    doc.documentElement.appendChild(created)
  }
}

/** Sets a direct child of the document root, creating it if absent. */
function setRootChildTag(doc: Document, tagName: string, value: string): void {
  for (const child of Array.from(doc.documentElement.children)) {
    if (child.tagName === tagName) {
      child.textContent = value
      return
    }
  }
  const created = doc.createElement(tagName)
  created.textContent = value
  doc.documentElement.appendChild(created)
}

/** Sets the text content of a direct child element with tagName inside parent. */
function setChildTag(parent: Element, tagName: string, value: string): void {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) {
      child.textContent = value
      return
    }
  }
  // Create if absent
  const created = parent.ownerDocument!.createElement(tagName)
  created.textContent = value
  parent.appendChild(created)
}

// ---------------------------------------------------------------------------
// Section patchers — mirror the parsing logic in parseOrder.ts exactly
// ---------------------------------------------------------------------------

function patchHeaderFields(doc: Document, order: OrderSummary): void {
  setDocTag(doc, 'OrderNumber', order.orderNumber)
  setDocTag(doc, 'CaseId', order.caseId)
  setDocTag(doc, 'OpportunityID', order.opportunityId)  // note: ID not Id
  setRootChildTag(doc, 'Comments', order.comments)
}

function patchAccountDetails(doc: Document, account: AccountDetails): void {
  const el = doc.getElementsByTagName('AccountDetailsData')[0]
  if (!el) return
  setChildTag(el, 'CompanyName', account.companyName)
  setChildTag(el, 'CompanyNameTwo', account.companyNameTwo)
  setChildTag(el, 'CompanyType', account.companyType)
  setChildTag(el, 'Department', account.department)
  setChildTag(el, 'DepartmentTwo', account.departmentTwo)
  setChildTag(el, 'Street', account.street)
  setChildTag(el, 'StreetTwo', account.streetTwo)
  setChildTag(el, 'StreetThree', account.streetThree)
  setChildTag(el, 'HpcPoBox', account.hpcPoBox)
  setChildTag(el, 'City', account.city)
  setChildTag(el, 'StateProvince', account.stateProvince)
  setChildTag(el, 'ZipPostalCode', account.zipPostalCode)
  setChildTag(el, 'Country', account.country)
  setChildTag(el, 'Phone', account.phone)
  setChildTag(el, 'PhonePrefix', account.phonePrefix)
  setChildTag(el, 'PhoneCountryCode', account.phoneCountryCode)
  setChildTag(el, 'Email', account.email)
  setChildTag(el, 'Website', account.website)
  setChildTag(el, 'AccountNumber', account.accountNumber)
  setChildTag(el, 'VatId', account.vatId)
  setChildTag(el, 'CustomerIdAtGom', account.customerIdAtGom)
  setChildTag(el, 'Reference', account.reference)
  setChildTag(el, 'IsGomPartner', String(account.isGomPartner))
  setChildTag(el, 'IsDistributor', String(account.isDistributor))
  setChildTag(el, 'IsNewCustomer', String(account.isNewCustomer))
}

function patchTechnicalContact(doc: Document, contact: TechnicalContact): void {
  const el = doc.getElementsByTagName('LocalTechnicalContact')[0]
  if (!el) return
  setChildTag(el, 'FirstName', contact.firstName)
  setChildTag(el, 'LastName', contact.lastName)
  setChildTag(el, 'Title', contact.title)
  setChildTag(el, 'AcademicDegree', contact.academicDegree)
  setChildTag(el, 'Gender', contact.gender)
  setChildTag(el, 'Position', contact.position)
  setChildTag(el, 'Department', contact.department)
  setChildTag(el, 'Source', contact.source)
  setChildTag(el, 'Email', contact.email)
  setChildTag(el, 'AdditionalEmail', contact.additionalEmail)
  setChildTag(el, 'BusinessPhone', contact.businessPhone)
  setChildTag(el, 'BusinessPhonePrefix', contact.businessPhonePrefix)
  setChildTag(el, 'BusinessPhoneCountryCode', contact.businessPhoneCountryCode)
  setChildTag(el, 'MobilePhone', contact.mobilePhone)
  setChildTag(el, 'MobilePhonePrefix', contact.mobilePhonePrefix)
  setChildTag(el, 'MobilePhoneCountryCode', contact.mobilePhoneCountryCode)
  setChildTag(el, 'AdditionalPhone', contact.additionalPhone)
  setChildTag(el, 'AdditionalPhonePrefix', contact.additionalPhonePrefix)
  setChildTag(el, 'AdditionalPhoneCountryCode', contact.additionalPhoneCountryCode)
}

function patchOrderAdministration(doc: Document, admin: OrderAdministration): void {
  const el = doc.getElementsByTagName('OrderAdministration')[0]
  if (!el) return
  // Invoice — tag names verified against parseOrder.ts
  setChildTag(el, 'InvoiceAddressType', admin.invoiceAddressType)
  setChildTag(el, 'InvoiceAccountNumber', admin.invoiceAccountNumber)
  setChildTag(el, 'InvoiceCompanyName', admin.invoiceCompanyName)
  setChildTag(el, 'InvoiceCompanyNameTwo', admin.invoiceCompanyNameTwo)
  setChildTag(el, 'InvoiceDepartment', admin.invoiceDepartment)
  setChildTag(el, 'InvoiceDepartmentTwo', admin.invoiceDepartmentTwo)
  setChildTag(el, 'InvoiceStreet', admin.invoiceStreet)
  setChildTag(el, 'InvoiceStreetTwo', admin.invoiceStreetTwo)
  setChildTag(el, 'InvoiceStreetThree', admin.invoiceStreetThree)
  setChildTag(el, 'InvoiceHPCPOBox', admin.invoiceHpcPoBox)   // note: HPCPOBOX not HpcPoBox
  setChildTag(el, 'InvoiceCity', admin.invoiceCity)
  setChildTag(el, 'InvoiceState', admin.invoiceState)
  setChildTag(el, 'InvoiceZIP', admin.invoiceZip)              // note: ZIP not Zip
  setChildTag(el, 'InvoiceCountry', admin.invoiceCountry)
  setChildTag(el, 'InvoicePaymentTerm', admin.invoicePaymentTerm)
  setChildTag(el, 'InvoiceNewCustomer', String(admin.invoiceNewCustomer))
  // Shipping
  setChildTag(el, 'ShippingAddressType', admin.shippingAddressType)
  setChildTag(el, 'ShippingAccountNumber', admin.shippingAccountNumber)
  setChildTag(el, 'ShippingCompanyName', admin.shippingCompanyName)
  setChildTag(el, 'ShippingCompanyNameTwo', admin.shippingCompanyNameTwo)
  setChildTag(el, 'ShippingDepartment', admin.shippingDepartment)
  setChildTag(el, 'ShippingDepartmentTwo', admin.shippingDepartmentTwo)
  setChildTag(el, 'ShippingContactPerson', admin.shippingContactPerson)
  setChildTag(el, 'ShippingStreet', admin.shippingStreet)
  setChildTag(el, 'ShippingStreetTwo', admin.shippingStreetTwo)
  setChildTag(el, 'ShippingStreetThree', admin.shippingStreetThree)
  setChildTag(el, 'ShippingHPCPOBox', admin.shippingHpcPoBox)  // note: HPCPOBOX
  setChildTag(el, 'ShippingCity', admin.shippingCity)
  setChildTag(el, 'ShippingState', admin.shippingState)
  setChildTag(el, 'ShippingZIP', admin.shippingZip)            // note: ZIP
  setChildTag(el, 'ShippingCountry', admin.shippingCountry)
  setChildTag(el, 'ShippingFreightTerm', admin.shippingFreightTerm)
  setChildTag(el, 'ShippingMethod', admin.shippingMethod)
  setChildTag(el, 'SpecialShippingInstructions', admin.specialShippingInstructions)
  setChildTag(el, 'ShippingNewCustomer', String(admin.shippingNewCustomer))
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Applies all editable-field changes from `order` into the original XML
 * string and returns the modified XML.  Non-editable fields (prices, line
 * items, configuration data) are left completely untouched.
 */
export function patchOrderXml(originalXml: string, order: OrderSummary): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(originalXml, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`patchOrderXml: XML parse error — ${parseError.textContent?.trim()}`)
  }

  patchHeaderFields(doc, order)
  patchAccountDetails(doc, order.account)
  patchTechnicalContact(doc, order.contact)
  patchOrderAdministration(doc, order.administration)

  return new XMLSerializer().serializeToString(doc)
}
