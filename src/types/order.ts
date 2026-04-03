export interface OrderSummary {
  // Header
  orderNumber: string
  caseId: string
  opportunityId: string
  distributor: string
  homCenter: string
  priceList: string
  username: string
  orderDate: string
  currency: string
  destination: string
  // Totals
  msrp: number | null
  dp: number | null
  discountForCustomer: number | null  // decimal 0–1, e.g. 0.25 = 25%
  finalPriceForEndCustomer: number | null
  orderValueToGom: number | null
  // Line items
  items: ConfigItem[]
}

export interface ArticleRow {
  name: string
  amount: number
  unit: string
  priceOnRequest: boolean
  // Enriched from config.xml price lookup (null = not found or not applicable)
  unitMsrp: number | null
  unitDp: number | null
  sapNr: string
}

export interface SectionDetail {
  name: string
  articles: ArticleRow[]   // only articles where amount > 0
  comments: string
}

export interface ConfigItem {
  no: string               // "1", "1.1", "2.3" etc.
  label: string            // "Configuration item 1"
  category: string         // ConfigurationItem.GroupLevel1
  name: string             // ConfigurationItem.Name
  systemType: string       // first article in "System type" section
  totalMsrp: number | null
  totalDp: number | null
  discountOverride: number | null  // per-item discount if set
  isHidden: boolean
  isSub: boolean           // true if no contains "."
  itemType: 'dependent' | 'free' | 'freeList' | 'support' | 'sub'
  sections: SectionDetail[] // article-level breakdown (empty for non-dependent types)
}

export interface ParseResult {
  order: OrderSummary
  gpcVersion: string       // from version.xml
  sourceFile: string
}
