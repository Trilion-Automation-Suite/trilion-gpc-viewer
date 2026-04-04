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

import type { AccountDetails, ConfigItem, OrderAdministration, OrderSummary, TechnicalContact } from '../types/order.js'

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
// Item-level helpers
// ---------------------------------------------------------------------------

/** Find or create a direct child element with the given tagName on doc root. */
function findOrCreateRootChild(doc: Document, tagName: string): Element {
  for (const child of Array.from(doc.documentElement.children)) {
    if (child.tagName === tagName) return child
  }
  const el = doc.createElement(tagName)
  doc.documentElement.appendChild(el)
  return el
}

/** Return the text content of a direct child element, or null if absent. */
function directChildText(parent: Element, tagName: string): string | null {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) return child.textContent?.trim() ?? ''
  }
  return null
}

/**
 * Walk a container element's direct children (and optionally recurse into
 * SubConfigurations) looking for a row whose <No> text matches one of the
 * given nos. Remove matching rows.
 */
function removeMatchingRows(container: Element, deletedNos: Set<string>, recurse: boolean): void {
  const toRemove: Element[] = []
  for (const child of Array.from(container.children)) {
    const no = directChildText(child, 'No')
    if (no !== null && deletedNos.has(no)) {
      toRemove.push(child)
    } else if (recurse) {
      // Check SubConfigurations recursively
      for (const subChild of Array.from(child.children)) {
        if (subChild.tagName === 'SubConfigurations') {
          removeMatchingRows(subChild, deletedNos, true)
        }
      }
    }
  }
  for (const el of toRemove) {
    el.parentElement?.removeChild(el)
  }
}

/**
 * Remove items whose nos are in deletedNos from all item containers and
 * their SubConfigurations descendants.
 */
function removeItemsFromXml(doc: Document, deletedNos: Set<string>): void {
  if (deletedNos.size === 0) return
  const containerTags = [
    'DependentListsData',
    'FreeArticlesData',
    'FreeListArticlesData',
    'SupportArticlesData',
  ]
  for (const tag of containerTags) {
    const candidates = doc.getElementsByTagName(tag)
    for (let i = 0; i < candidates.length; i++) {
      removeMatchingRows(candidates[i], deletedNos, true)
    }
  }
}

/**
 * Build the full ConfigurationItem XML block matching .NET's XmlSerializer output.
 * Element order must match the C# class property declaration order exactly.
 */
function buildConfigurationItemXml(name: string, category: string, itemType: string, sapNr: string): string {
  return `<ConfigurationItem>` +
    `<ApplicableFee>-2147483648</ApplicableFee>` +
    `<IsHidden>false</IsHidden>` +
    `<AsSubItemOnly>false</AsSubItemOnly>` +
    `<Flatten>false</Flatten>` +
    `<UserBlacklist />` +
    `<RegionalRestrictionNotInTheseCountriesRegions />` +
    `<GroupLevel1>${escapeXml(category)}</GroupLevel1>` +
    `<GroupLevel2 />` +
    `<GroupLevel3 />` +
    `<Name>${escapeXml(name)}</Name>` +
    `<Parameter />` +
    `<WorksheetArticleFilter />` +
    `<ItemType>${escapeXml(itemType)}</ItemType>` +
    `<AdditionalMandatoryFields>false</AdditionalMandatoryFields>` +
    `<IsOppIdMandatory>false</IsOppIdMandatory>` +
    `<Question1 />` +
    `<Question2 />` +
    `<Question3 />` +
    `<Question1Formats />` +
    `<Question2Formats />` +
    `<Question3Formats />` +
    `<SapNr>${escapeXml(sapNr)}</SapNr>` +
    `<SapItemCategory />` +
    `<ProductionArticles />` +
    `<Discounts />` +
    `<Unclean>false</Unclean>` +
    `</ConfigurationItem>`
}

const XSI = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
const NIL = 'xsi:nil="true"'

/** Append a new FreeArticlesScreenData element for a free-article item.
 *  Element order matches the C# ConfigurationItemData base → FreeArticlesScreenData hierarchy. */
function insertFreeArticleItems(doc: Document, newItems: ConfigItem[]): void {
  if (newItems.length === 0) return
  const container = findOrCreateRootChild(doc, 'FreeArticlesData')
  for (const item of newItems) {
    const art = item.sections[0]?.articles[0]
    const artName = art?.name ?? item.name
    const artAmount = art?.amount ?? 1
    const artUnit = art?.unit ?? 'pcs'
    const artSapNr = art?.sapNr ?? ''

    const rowXml = `<FreeArticlesScreenData ${XSI}>` +
      buildConfigurationItemXml(item.name, item.category, 'FreeArticle', artSapNr) +
      `<UseInCalculation>true</UseInCalculation>` +
      `<No>${item.no}</No>` +
      `<TotalDp ${NIL} />` +
      `<TotalMsrp ${NIL} />` +
      `<Discount ${NIL} />` +
      `<IsDiscountPercentage>false</IsDiscountPercentage>` +
      `<IsHidden>false</IsHidden>` +
      `<FreeArticles>` +
        `<FreeArticle>` +
          `<Amount>${artAmount}</Amount>` +
          `<Step>1</Step>` +
          `<Article><LongName>${escapeXml(artName)}</LongName><SapNr>${escapeXml(artSapNr)}</SapNr><Unit>${escapeXml(artUnit)}</Unit></Article>` +
          `<OverwrittenDp ${NIL} />` +
          `<OverwrittenMrsp ${NIL} />` +
          `<PriceOnRequest>false</PriceOnRequest>` +
          `<EuroMsrp ${NIL} />` +
          `<Msrp ${NIL} />` +
          `<Dp ${NIL} />` +
          `<SumMsrp ${NIL} />` +
          `<SumDp ${NIL} />` +
          `<CustomQuantityDiscount ${NIL} />` +
        `</FreeArticle>` +
      `</FreeArticles>` +
      `</FreeArticlesScreenData>`
    const frag = new DOMParser().parseFromString(rowXml, 'application/xml')
    const imported = doc.importNode(frag.documentElement, true)
    container.appendChild(imported)
  }
}

/** Append a new DependentListScreenData element for a software license item.
 *  Element order matches the C# ConfigurationItemData base → DependentListScreenData hierarchy. */
function insertLicenseItems(doc: Document, newItems: ConfigItem[], allItems: ConfigItem[] = []): void {
  if (newItems.length === 0) return
  const container = findOrCreateRootChild(doc, 'DependentListsData')
  for (const item of newItems) {
    const smaNo = `${item.no}.1`
    const smaItem = allItems.find(i => i.no === smaNo)
    const smaUserZeissId = smaItem?.userZeissId ?? ''
    const smaUserName = smaItem?.userName ?? ''

    const rowXml = `<DependentListScreenData ${XSI}>` +
      buildConfigurationItemXml(item.name, 'Software License', 'DependentList', '') +
      `<UseInCalculation>true</UseInCalculation>` +
      `<No>${item.no}</No>` +
      `<TotalDp ${NIL} />` +
      `<TotalMsrp ${NIL} />` +
      `<Discount ${NIL} />` +
      `<IsDiscountPercentage>false</IsDiscountPercentage>` +
      `<IsHidden>false</IsHidden>` +
      `<Sections />` +
      `<SubConfigurations>` +
        `<ConfigurationItemData ${XSI}>` +
          buildConfigurationItemXml('SMA', 'SMA', 'DependentList', '') +
          `<UseInCalculation>true</UseInCalculation>` +
          `<No>${smaNo}</No>` +
          `<Reply1>${escapeXml(smaUserZeissId)}</Reply1>` +
          `<Reply2>${escapeXml(smaUserName)}</Reply2>` +
          `<TotalDp ${NIL} />` +
          `<TotalMsrp ${NIL} />` +
          `<Discount ${NIL} />` +
          `<IsDiscountPercentage>false</IsDiscountPercentage>` +
          `<IsHidden>false</IsHidden>` +
          `<Sections />` +
          `<SubConfigurations />` +
        `</ConfigurationItemData>` +
      `</SubConfigurations>` +
      `</DependentListScreenData>`
    const frag = new DOMParser().parseFromString(rowXml, 'application/xml')
    const imported = doc.importNode(frag.documentElement, true)
    container.appendChild(imported)
  }
}

/**
 * Find an element in a container (or recursively in SubConfigurations)
 * whose <No> direct child matches the given no.
 */
function findElementByNo(container: Element, no: string): Element | null {
  for (const child of Array.from(container.children)) {
    const childNo = directChildText(child, 'No')
    if (childNo === no) return child
    // Recurse into SubConfigurations
    for (const grandchild of Array.from(child.children)) {
      if (grandchild.tagName === 'SubConfigurations') {
        const found = findElementByNo(grandchild, no)
        if (found) return found
      }
    }
  }
  return null
}

/** Patch Reply1 (email) and Reply2 (name) for SMA sub-items that have user fields set. */
function patchLicenseUserFields(doc: Document, items: ConfigItem[]): void {
  const relevantItems = items.filter(i => i.userZeissId !== undefined || i.userName !== undefined)
  if (relevantItems.length === 0) return

  // Search in DependentListsData containers (findElementByNo recurses into SubConfigurations)
  const candidates = doc.getElementsByTagName('DependentListsData')
  for (const item of relevantItems) {
    for (let i = 0; i < candidates.length; i++) {
      const el = findElementByNo(candidates[i], item.no)
      if (el) {
        if (item.userZeissId !== undefined) setChildTag(el, 'Reply1', item.userZeissId)
        if (item.userName !== undefined) setChildTag(el, 'Reply2', item.userName)
        break
      }
    }
  }
}

/** Escape special XML characters in text content. */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Applies all editable-field changes from `order` into the original XML
 * string and returns the modified XML.  Non-editable fields (prices, line
 * items, configuration data) are left completely untouched.
 */
export function patchOrderXml(originalXml: string, order: OrderSummary, originalItemNos: string[] = []): string {
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

  // Compute deleted nos: in originalItemNos but not in current order.items
  const currentNos = new Set(order.items.map(i => i.no))
  const deletedNos = new Set(originalItemNos.filter(n => !currentNos.has(n)))
  removeItemsFromXml(doc, deletedNos)
  insertFreeArticleItems(doc, order.items.filter(i => i.isNew === true && i.itemType === 'free'))
  insertLicenseItems(doc, order.items.filter(i => i.isNew === true && i.itemType === 'dependent'), order.items)
  patchLicenseUserFields(doc, order.items)

  return new XMLSerializer().serializeToString(doc)
}
