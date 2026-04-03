import type { AccountDetails, ArticleRow, ConfigItem, OrderAdministration, OrderSummary, SectionDetail, TechnicalContact } from '../types/order.js'
import { parseItemNo } from './pricing.js'

// ---------------------------------------------------------------------------
// XML helpers — direct-child traversal only
//
// We deliberately avoid querySelector with CSS child combinators ('>') and
// ':scope' because DOMParser in application/xml mode has inconsistent support
// for those selectors across browsers. All lookups use direct .children
// iteration to be safe and explicit.
// ---------------------------------------------------------------------------

/** Return the first direct child element with the given tag name. */
function directChild(parent: Element, tagName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) return child
  }
  return null
}

/** Return all direct children with the given tag name. */
function directChildren(parent: Element, tagName: string): Element[] {
  return Array.from(parent.children).filter((c) => c.tagName === tagName)
}

/** Return text of a direct child, or '' if absent. */
function childText(parent: Element, tagName: string): string {
  return directChild(parent, tagName)?.textContent?.trim() ?? ''
}


function childFloat(parent: Element, tagName: string): number | null {
  const text = childText(parent, tagName)
  if (text === '') return null
  const v = parseFloat(text)
  return isNaN(v) ? null : v
}

function childBool(parent: Element, tagName: string): boolean {
  return childText(parent, tagName).toLowerCase() === 'true'
}

/** Find the first element with tagName anywhere in the document (not scoped). */
function docText(doc: Document, tagName: string): string {
  return doc.getElementsByTagName(tagName)[0]?.textContent?.trim() ?? ''
}

function docFloat(doc: Document, tagName: string): number | null {
  const text = docText(doc, tagName)
  if (text === '') return null
  const v = parseFloat(text)
  return isNaN(v) ? null : v
}

/** Read a direct child of the document root only — avoids matching tags buried
 *  inside the embedded PDB <Database> catalog that older files carry. */
function rootText(doc: Document, tagName: string): string {
  return directChild(doc.documentElement, tagName)?.textContent?.trim() ?? ''
}

function rootFloat(doc: Document, tagName: string): number | null {
  const text = rootText(doc, tagName)
  if (text === '') return null
  const v = parseFloat(text)
  return isNaN(v) ? null : v
}

// ---------------------------------------------------------------------------
// Section/article parsing
// ---------------------------------------------------------------------------

function parseSections(itemEl: Element): SectionDetail[] {
  const sectionsEl = directChild(itemEl, 'Sections')
  if (!sectionsEl) return []

  return directChildren(sectionsEl, 'SectionScreenData').flatMap((sec): SectionDetail[] => {
    const articlesEl = directChild(sec, 'SectionArticles')
    if (!articlesEl) return []

    const articles: ArticleRow[] = directChildren(articlesEl, 'SectionArticleScreenData')
      .map((a): ArticleRow => ({
        name: childText(a, 'Name'),
        amount: parseInt(childText(a, 'Amount') || '0', 10),
        unit: childText(a, 'Unit'),
        priceOnRequest: childText(a, 'PriceOnRequest').toLowerCase() === 'true',
        // Msrp/Dp are serialised directly on SectionArticleScreenData (inherited from OrderArticle)
        unitMsrp: childFloat(a, 'Msrp'),
        unitDp: childFloat(a, 'Dp'),
        sapNr: '',  // Article is not serialised for section articles; enriched later from config.xml
      }))
      .filter((a) => a.amount > 0 && a.name !== '')

    // Skip sections with no selected articles
    if (articles.length === 0) return []

    return [{
      name: childText(sec, 'Name'),
      articles,
      comments: childText(sec, 'Comments'),
    }]
  })
}

function extractSystemType(itemEl: Element): string {
  const sectionsEl = directChild(itemEl, 'Sections')
  if (!sectionsEl) return ''
  for (const sec of directChildren(sectionsEl, 'SectionScreenData')) {
    if (childText(sec, 'Name').toLowerCase() === 'system type') {
      const articlesEl = directChild(sec, 'SectionArticles')
      if (!articlesEl) continue
      const firstArticle = articlesEl.children[0]
      if (firstArticle) return childText(firstArticle, 'Name')
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// Item parsers
// ---------------------------------------------------------------------------

function parseDependentItem(el: Element, itemType: 'dependent' | 'sub'): ConfigItem {
  const no = childText(el, 'No')
  const ciEl = directChild(el, 'ConfigurationItem')
  return {
    no,
    label: no ? `Configuration item ${no}` : '',
    category: ciEl ? childText(ciEl, 'GroupLevel1') : '',
    name: ciEl ? childText(ciEl, 'Name') : '',
    systemType: extractSystemType(el),
    totalMsrp: childFloat(el, 'TotalMsrp'),
    totalDp: childFloat(el, 'TotalDp'),
    discountOverride: childFloat(el, 'Discount'),
    isHidden: childBool(el, 'IsHidden'),
    isSub: no.includes('.'),
    itemType,
    sections: parseSections(el),
  }
}

function collectSubItems(parentEl: Element): ConfigItem[] {
  const items: ConfigItem[] = []
  const subConf = directChild(parentEl, 'SubConfigurations')
  if (!subConf) return items
  // SubConfigurations can contain any ConfigurationItemData subtype
  for (const el of Array.from(subConf.children)) {
    items.push(parseDependentItem(el, 'sub'))
    items.push(...collectSubItems(el))
  }
  return items
}

function collectDependentItems(doc: Document): ConfigItem[] {
  const items: ConfigItem[] = []
  // Older GPC files embed a full PDB <Database> element whose own
  // DependentListsData contains the catalog (DependentLists > DependentList).
  // The *order* items live in a separate DependentListsData that holds
  // DependentListScreenData children.  Walk all matches to find the right one.
  const candidates = doc.getElementsByTagName('DependentListsData')
  for (let i = 0; i < candidates.length; i++) {
    const container = candidates[i]
    const screenDataChildren = directChildren(container, 'DependentListScreenData')
    if (screenDataChildren.length === 0) continue
    for (const el of screenDataChildren) {
      items.push(parseDependentItem(el, 'dependent'))
      items.push(...collectSubItems(el))
    }
  }
  return items
}

// ---------------------------------------------------------------------------
// Article-list parsers for FreeList and Free items
// ---------------------------------------------------------------------------

/** Parse a FreeListArticle or FreeArticle element into an ArticleRow. */
function parseFlatArticle(a: Element, nameTag: 'Article' | null): ArticleRow {
  const articleEl = nameTag === 'Article' ? directChild(a, 'Article') : null
  const name = articleEl ? childText(articleEl, 'LongName') : childText(a, 'LongName')
  const sapNr =
    childText(a, 'SapNr') || (articleEl ? childText(articleEl, 'SapNr') : '')
  const amount = parseInt(childText(a, 'Amount') || '0', 10)
  return {
    name,
    amount,
    unit: childText(a, 'Unit') || (articleEl ? childText(articleEl, 'Unit') : ''),
    priceOnRequest: childText(a, 'PriceOnRequest').toLowerCase() === 'true',
    unitMsrp: childFloat(a, 'Msrp'),
    unitDp: childFloat(a, 'Dp'),
    sapNr,
  }
}

function parseFreeListSections(el: Element): SectionDetail[] {
  const listEl = directChild(el, 'FreeListArticles')
  if (!listEl) return []
  const articles = directChildren(listEl, 'FreeListArticle')
    .map((a) => parseFlatArticle(a, 'Article'))
    .filter((a) => a.amount > 0 && a.name !== '')
  if (articles.length === 0) return []
  return [{ name: '', articles, comments: childText(el, 'Comments') }]
}

function parseFreeArticleSections(el: Element): SectionDetail[] {
  const listEl = directChild(el, 'FreeArticles')
  if (!listEl) return []
  const articles = directChildren(listEl, 'FreeArticle')
    .map((a) => parseFlatArticle(a, 'Article'))
    .filter((a) => a.amount > 0 && a.name !== '')
  if (articles.length === 0) return []
  return [{ name: '', articles, comments: childText(el, 'Comments') }]
}

function parseSimpleItems(
  doc: Document,
  containerTag: string,
  rowTag: string,
  itemType: 'free' | 'freeList' | 'support'
): ConfigItem[] {
  // Like collectDependentItems, older files may have a Database-embedded copy
  // of the container that lacks order screen data.  Walk all matches.
  const candidates = doc.getElementsByTagName(containerTag)
  const items: ConfigItem[] = []
  for (let ci = 0; ci < candidates.length; ci++) {
    const rows = directChildren(candidates[ci], rowTag)
    if (rows.length === 0) continue
    items.push(...rows.flatMap((el): ConfigItem[] => {
    const no = childText(el, 'No')
    const ciEl = directChild(el, 'ConfigurationItem')
    const sections =
      itemType === 'freeList' ? parseFreeListSections(el) :
      itemType === 'free'     ? parseFreeArticleSections(el) :
      []
    const item: ConfigItem = {
      no,
      label: no ? `Configuration item ${no}` : '',
      category: ciEl ? childText(ciEl, 'GroupLevel1') : '',
      name: ciEl ? childText(ciEl, 'Name') : '',
      systemType: '',
      totalMsrp: childFloat(el, 'TotalMsrp'),
      totalDp: childFloat(el, 'TotalDp'),
      discountOverride: childFloat(el, 'Discount'),
      isHidden: childBool(el, 'IsHidden'),
      isSub: no.includes('.'),
      itemType,
      sections,
    }
    return [item, ...collectSubItems(el)]
  }))
  }
  return items
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function sortItems(items: ConfigItem[]): ConfigItem[] {
  return [...items].sort((a, b) => {
    const na = parseItemNo(a.no)
    const nb = parseItemNo(b.no)
    for (let i = 0; i < Math.max(na.length, nb.length); i++) {
      const va = na[i] ?? -1
      const vb = nb[i] ?? -1
      if (va !== vb) return va - vb
    }
    return 0
  })
}

// ---------------------------------------------------------------------------
// Section parsers: Account, Contact, Administration
// ---------------------------------------------------------------------------

function parseAccountDetails(doc: Document): AccountDetails {
  const el = doc.getElementsByTagName('AccountDetailsData')[0]
  const t = (tag: string) => (el ? childText(el, tag) : '')
  const b = (tag: string) => (el ? childBool(el, tag) : false)
  return {
    companyName: t('CompanyName'),
    companyNameTwo: t('CompanyNameTwo'),
    companyType: t('CompanyType'),
    department: t('Department'),
    departmentTwo: t('DepartmentTwo'),
    street: t('Street'),
    streetTwo: t('StreetTwo'),
    streetThree: t('StreetThree'),
    hpcPoBox: t('HpcPoBox'),
    city: t('City'),
    stateProvince: t('StateProvince'),
    zipPostalCode: t('ZipPostalCode'),
    country: t('Country'),
    phone: t('Phone'),
    phonePrefix: t('PhonePrefix'),
    phoneCountryCode: t('PhoneCountryCode'),
    email: t('Email'),
    website: t('Website'),
    accountNumber: t('AccountNumber'),
    vatId: t('VatId'),
    customerIdAtGom: t('CustomerIdAtGom'),
    reference: t('Reference'),
    isGomPartner: b('IsGomPartner'),
    isDistributor: b('IsDistributor'),
    isNewCustomer: b('IsNewCustomer'),
  }
}

function parseTechnicalContact(doc: Document): TechnicalContact {
  const el = doc.getElementsByTagName('LocalTechnicalContact')[0]
  const t = (tag: string) => (el ? childText(el, tag) : '')
  return {
    firstName: t('FirstName'),
    lastName: t('LastName'),
    title: t('Title'),
    academicDegree: t('AcademicDegree'),
    gender: t('Gender'),
    position: t('Position'),
    department: t('Department'),
    source: t('Source'),
    email: t('Email'),
    additionalEmail: t('AdditionalEmail'),
    businessPhone: t('BusinessPhone'),
    businessPhonePrefix: t('BusinessPhonePrefix'),
    businessPhoneCountryCode: t('BusinessPhoneCountryCode'),
    mobilePhone: t('MobilePhone'),
    mobilePhonePrefix: t('MobilePhonePrefix'),
    mobilePhoneCountryCode: t('MobilePhoneCountryCode'),
    additionalPhone: t('AdditionalPhone'),
    additionalPhonePrefix: t('AdditionalPhonePrefix'),
    additionalPhoneCountryCode: t('AdditionalPhoneCountryCode'),
  }
}

function parseOrderAdministration(doc: Document): OrderAdministration {
  const el = doc.getElementsByTagName('OrderAdministration')[0]
  const t = (tag: string) => (el ? childText(el, tag) : '')
  const b = (tag: string) => (el ? childBool(el, tag) : false)
  return {
    invoiceAddressType: t('InvoiceAddressType'),
    invoiceAccountNumber: t('InvoiceAccountNumber'),
    invoiceCompanyName: t('InvoiceCompanyName'),
    invoiceCompanyNameTwo: t('InvoiceCompanyNameTwo'),
    invoiceDepartment: t('InvoiceDepartment'),
    invoiceDepartmentTwo: t('InvoiceDepartmentTwo'),
    invoiceStreet: t('InvoiceStreet'),
    invoiceStreetTwo: t('InvoiceStreetTwo'),
    invoiceStreetThree: t('InvoiceStreetThree'),
    invoiceHpcPoBox: t('InvoiceHPCPOBox'),
    invoiceCity: t('InvoiceCity'),
    invoiceState: t('InvoiceState'),
    invoiceZip: t('InvoiceZIP'),
    invoiceCountry: t('InvoiceCountry'),
    invoicePaymentTerm: t('InvoicePaymentTerm'),
    invoiceNewCustomer: b('InvoiceNewCustomer'),
    shippingAddressType: t('ShippingAddressType'),
    shippingAccountNumber: t('ShippingAccountNumber'),
    shippingCompanyName: t('ShippingCompanyName'),
    shippingCompanyNameTwo: t('ShippingCompanyNameTwo'),
    shippingDepartment: t('ShippingDepartment'),
    shippingDepartmentTwo: t('ShippingDepartmentTwo'),
    shippingContactPerson: t('ShippingContactPerson'),
    shippingStreet: t('ShippingStreet'),
    shippingStreetTwo: t('ShippingStreetTwo'),
    shippingStreetThree: t('ShippingStreetThree'),
    shippingHpcPoBox: t('ShippingHPCPOBox'),
    shippingCity: t('ShippingCity'),
    shippingState: t('ShippingState'),
    shippingZip: t('ShippingZIP'),
    shippingCountry: t('ShippingCountry'),
    shippingFreightTerm: t('ShippingFreightTerm'),
    shippingMethod: t('ShippingMethod'),
    specialShippingInstructions: t('SpecialShippingInstructions'),
    shippingNewCustomer: b('ShippingNewCustomer'),
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseOrder(xml: string): OrderSummary {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`parseOrder: XML parse error — ${parseError.textContent?.trim()}`)
  }

  // Currency: <Currency><Display>...</Display> or fall back to <GomCurrency>
  const currencyEl = doc.getElementsByTagName('Currency')[0]
  const currency =
    (currencyEl ? childText(currencyEl, 'Display') : '') ||
    docText(doc, 'GomCurrency')

  // Destination: <DestinationNew><Country>...</Country></DestinationNew>
  const destEl = doc.getElementsByTagName('DestinationNew')[0]
  const destination = destEl ? childText(destEl, 'Country') : ''

  const items = sortItems([
    ...collectDependentItems(doc),
    ...parseSimpleItems(doc, 'FreeArticlesData', 'FreeArticlesScreenData', 'free'),
    ...parseSimpleItems(doc, 'FreeListArticlesData', 'FreeListScreenData', 'freeList'),
    ...parseSimpleItems(doc, 'SupportArticlesData', 'SupportScreenData', 'support'),
  ])

  // Comments: direct child of OrderData only (section-level Comments are excluded)
  const root = doc.documentElement
  let comments = ''
  for (const child of Array.from(root.children)) {
    if (child.tagName === 'Comments') {
      comments = child.textContent?.trim() ?? ''
      break
    }
  }

  // Use rootText/rootFloat for order-level fields so we read from the
  // OrderData root element, not from identically-named tags buried inside
  // the embedded PDB <Database> that older .gconfiguration files carry.
  return {
    orderNumber: rootText(doc, 'OrderNumber') || docText(doc, 'OrderNumber'),
    caseId: rootText(doc, 'CaseId') || docText(doc, 'CaseId'),
    opportunityId: rootText(doc, 'OpportunityID') || docText(doc, 'OpportunityID'),
    distributor: rootText(doc, 'Distributor'),
    homCenter: rootText(doc, 'HOMCenter') || docText(doc, 'HOMCenter'),
    priceList: rootText(doc, 'PriceList') || docText(doc, 'PriceList'),
    username: rootText(doc, 'Username') || docText(doc, 'Username'),
    orderDate: rootText(doc, 'OrderDate') || docText(doc, 'OrderDate'),
    currency,
    destination,
    contractType: rootText(doc, 'ContractType') || docText(doc, 'ContractType'),
    orderStatus: rootText(doc, 'OrderStatus') || docText(doc, 'OrderStatus'),
    creationDate: rootText(doc, 'CreationDate') || docText(doc, 'CreationDate'),
    comments,
    msrp: rootFloat(doc, 'Msrp') ?? docFloat(doc, 'Msrp'),
    dp: rootFloat(doc, 'Dp') ?? docFloat(doc, 'Dp'),
    discountForCustomer: rootFloat(doc, 'DiscountForCustomer') ?? docFloat(doc, 'DiscountForCustomer'),
    finalPriceForEndCustomer: rootFloat(doc, 'FinalPriceForEndCustomer') ?? docFloat(doc, 'FinalPriceForEndCustomer'),
    orderValueToGom: rootFloat(doc, 'OrderValueToGom') ?? docFloat(doc, 'OrderValueToGom'),
    account: parseAccountDetails(doc),
    contact: parseTechnicalContact(doc),
    administration: parseOrderAdministration(doc),
    items,
  }
}
