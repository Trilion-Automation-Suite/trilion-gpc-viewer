import type { ArticleRow, ConfigItem, OrderSummary, SectionDetail } from '../types/order.js'
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
        unitMsrp: null,
        unitDp: null,
        sapNr: '',
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
  const container = doc.getElementsByTagName('DependentListsData')[0]
  if (!container) return items
  for (const el of directChildren(container, 'DependentListScreenData')) {
    items.push(parseDependentItem(el, 'dependent'))
    items.push(...collectSubItems(el))
  }
  return items
}

function parseSimpleItems(
  doc: Document,
  containerTag: string,
  rowTag: string,
  itemType: 'free' | 'freeList' | 'support'
): ConfigItem[] {
  const container = doc.getElementsByTagName(containerTag)[0]
  if (!container) return []
  return directChildren(container, rowTag).flatMap((el): ConfigItem[] => {
    const no = childText(el, 'No')
    const ciEl = directChild(el, 'ConfigurationItem')
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
      sections: [],
    }
    return [item, ...collectSubItems(el)]
  })
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

  return {
    orderNumber: docText(doc, 'OrderNumber'),
    caseId: docText(doc, 'CaseId'),
    opportunityId: docText(doc, 'OpportunityID'),
    distributor: docText(doc, 'Distributor'),
    homCenter: docText(doc, 'HOMCenter'),
    priceList: docText(doc, 'PriceList'),
    username: docText(doc, 'Username'),
    orderDate: docText(doc, 'OrderDate'),
    currency,
    destination,
    msrp: docFloat(doc, 'Msrp'),
    dp: docFloat(doc, 'Dp'),
    discountForCustomer: docFloat(doc, 'DiscountForCustomer'),
    finalPriceForEndCustomer: docFloat(doc, 'FinalPriceForEndCustomer'),
    orderValueToGom: docFloat(doc, 'OrderValueToGom'),
    items,
  }
}
