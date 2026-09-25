import type { LicenseCatalogEntry } from '../lib/parseLicenseCatalog.js'

export interface AccountDetails {
  companyName: string
  companyNameTwo: string
  companyType: string
  department: string
  departmentTwo: string
  street: string
  streetTwo: string
  streetThree: string
  hpcPoBox: string
  city: string
  stateProvince: string
  zipPostalCode: string
  country: string
  phone: string
  phonePrefix: string
  phoneCountryCode: string
  email: string
  website: string
  accountNumber: string
  vatId: string
  customerIdAtGom: string
  reference: string
  isGomPartner: boolean
  isDistributor: boolean
  isNewCustomer: boolean
}

export interface TechnicalContact {
  firstName: string
  lastName: string
  title: string
  academicDegree: string
  gender: string
  position: string
  department: string
  source: string
  email: string
  additionalEmail: string
  businessPhone: string
  businessPhonePrefix: string
  businessPhoneCountryCode: string
  mobilePhone: string
  mobilePhonePrefix: string
  mobilePhoneCountryCode: string
  additionalPhone: string
  additionalPhonePrefix: string
  additionalPhoneCountryCode: string
}

export interface OrderAdministration {
  // Invoice
  invoiceAddressType: string
  invoiceAccountNumber: string
  invoiceCompanyName: string
  invoiceCompanyNameTwo: string
  invoiceDepartment: string
  invoiceDepartmentTwo: string
  invoiceStreet: string
  invoiceStreetTwo: string
  invoiceStreetThree: string
  invoiceHpcPoBox: string
  invoiceCity: string
  invoiceState: string
  invoiceZip: string
  invoiceCountry: string
  invoicePaymentTerm: string
  invoiceNewCustomer: boolean
  // Shipping
  shippingAddressType: string
  shippingAccountNumber: string
  shippingCompanyName: string
  shippingCompanyNameTwo: string
  shippingDepartment: string
  shippingDepartmentTwo: string
  shippingContactPerson: string
  shippingStreet: string
  shippingStreetTwo: string
  shippingStreetThree: string
  shippingHpcPoBox: string
  shippingCity: string
  shippingState: string
  shippingZip: string
  shippingCountry: string
  shippingFreightTerm: string
  shippingMethod: string
  specialShippingInstructions: string
  shippingNewCustomer: boolean
}

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
  contractType: string
  orderStatus: string
  creationDate: string
  comments: string
  // Totals
  msrp: number | null
  dp: number | null
  discountForCustomer: number | null  // decimal 0–1, e.g. 0.25 = 25%
  finalPriceForEndCustomer: number | null
  orderValueToGom: number | null
  // Sections
  account: AccountDetails
  contact: TechnicalContact
  administration: OrderAdministration
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

export interface SmaSoftwareArticle {
  name: string
  dongleId: string
  startNewContract: string       // ISO date
  endNewContract: string         // ISO date
  endOldContract: string         // ISO date
  msrp: number | null
  dp: number | null
}

export interface SmaDependentList {
  name: string
  dongleId: string
  startNewContract: string
  endNewContract: string
  endOldContract: string
  /** Whole months the new term covers — what GPC prices the agreement by. */
  months: number
  /** Months of lapsed cover before the new term, which are not charged for. */
  gapMonths: number
  totalMsrp: number | null
  totalDp: number | null
}

export interface SmaDetails {
  email: string                  // Reply1 — ZEISS ID / email
  userName: string               // Reply2 — license user name
  softwareArticles: SmaSoftwareArticle[]
  dependentLists: SmaDependentList[]
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
  /**
   * What the catalog asks about this line, from the configuration item's
   * Question1/2/3. A spare-parts line asks for the dongle or sensor serial the
   * part belongs to; an SMA line asks for the licence user. The answers are
   * Reply1/2/3 below, and the question is what the operator should be shown.
   */
  question1?: string
  question2?: string
  question3?: string
  /**
   * Patterns the answer must match, from the item's Question1/2/3 Formats. An
   * empty list means any answer will do — GPC's own rule.
   */
  question1Formats?: string[]
  question2Formats?: string[]
  question3Formats?: string[]
  /** Reply3, for the rare item that asks a third question. */
  reply3?: string
  userZeissId?: string     // Reply1 — the answer to Question1
  userName?: string       // Reply2 — the answer to Question2        // license user name
  isNew?: boolean          // true for items created in this session (not from XML)
  sma?: SmaDetails         // SMA contract/dongle/article details (when applicable)
}

export interface ParseResult {
  order: OrderSummary
  gpcVersion: string       // from version.xml
  pdbVersion: string       // order.xml <SourceFileName>, e.g. "PDB285_01-2026"; '' when absent
  sourceFile: string
  rawOrderXml: string      // original order.xml text — used to patch + repack on save
  rawDecryptedBuffer: ArrayBuffer  // decrypted ZIP bytes — used to repack on save
  originalItemNos: string[]   // nos of all items as parsed (for delete diffing)
  /**
   * config.xml, kept so the search catalog can be built on demand. Building it
   * eagerly meant scanning ~45 MB on every open for a list only the product
   * search uses.
   */
  configXml: string
  licenseCatalog: LicenseCatalogEntry[]
  currencyRates: Record<string, number>  // ISO → EUR-based exchange rate from PDB
  fileHandle?: FileSystemFileHandle
  openInEditMode?: boolean
}
