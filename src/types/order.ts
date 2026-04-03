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
  rawOrderXml: string      // original order.xml text — used to patch + repack on save
  rawDecryptedBuffer: ArrayBuffer  // decrypted ZIP bytes — used to repack on save
  fileHandle?: FileSystemFileHandle
}
