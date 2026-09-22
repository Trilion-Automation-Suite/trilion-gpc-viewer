/**
 * Building the "new configuration" OrderData that GPC starts from.
 *
 * Most of a blank order is C# field defaults — `false`, `0`, `Editing`,
 * `Purchase`, and nulls that serialize either as omissions (reference types) or
 * `xsi:nil` (value types). Those are the model, taken from the 2.9.8 class
 * declarations. The rest is looked up in the PDB: the destination country row,
 * the current currency row, and the user's first price list.
 *
 * What is *not* derivable from the PDB is called out in BlankOrderInputs. Those
 * are operator/session state, not product data: the reference files all show the
 * same values because they came off one installation, but nothing in the PDB
 * says so.
 */
import type { GpcContainer } from './container.ts'
import type { ElementValue, OrderDocument, OrderValue } from './orderXml.ts'
import { parseOrderXml } from './orderXml.ts'

export interface BlankOrderInputs {
  /** Spec §0 pin: save-clock derived. */
  creationDate: string
  /** Spec §0 pin: save-clock derived. */
  lastModified: string
  /** Spec §4 M3 pin: which of the PDB's 19 users is logged in is not a PDB fact. */
  username: string
  /** Session state. Selects a row from the PDB's DestinationsData. */
  destinationCountry?: string
  /** Session state. Selects the newest CurrenciesData row with this ISO. */
  currencyIso?: string
  /**
   * Spec §0 pin: which exchange-rate row the order is using.
   *
   * Normally the newest row for the ISO. But a rate refresh replaces the
   * catalog's table while updating the order's own currency only when the rate
   * changed, so an order can hold a `ValidFrom` that appears nowhere in the
   * catalog it ships with. Unreachable by derivation, so it is injected.
   */
  currencyValidFrom?: string
}

const DEFAULT_DESTINATION = 'United States of America'
const DEFAULT_CURRENCY_ISO = 'USD'

/** The blank order.xml the PDB itself carries — M3's golden. */
export function readBlankOrderGolden(pdb: GpcContainer): Uint8Array {
  const entry = pdb.entries.find((e) => e.name === 'order.xml')
  if (!entry) throw new Error('blankOrder: PDB has no order.xml')
  return entry.data
}

/** The PDB's AdministrationData, parsed. */
export function readPdbConfig(pdb: GpcContainer): ElementValue {
  const entry = pdb.entries.find((e) => e.name === 'config.xml')
  if (!entry) throw new Error('blankOrder: PDB has no config.xml')
  return parseConfigRoot(entry.data)
}

function parseConfigRoot(bytes: Uint8Array): ElementValue {
  // config.xml shares order.xml's writer, so the same parser reads it; only the
  // root element name differs.
  const xml = new TextDecoder('utf-8').decode(bytes)
  // Both forms occur: with namespace attributes in a real PDB, bare in fixtures.
  const patched = xml
    .replace(/<AdministrationData(\s|>)/, '<OrderData$1')
    .replace('</AdministrationData>', '</OrderData>')
  return parseOrderXml(new TextEncoder().encode(patched)).root
}

// ── small constructors ────────────────────────────────────────────────────────

const txt = (value: string): OrderValue => ({ kind: 'text', type: null, value })
const nil = (): OrderValue => ({ kind: 'nil' })
const el = (members: Array<[string, OrderValue]>): ElementValue => ({
  kind: 'element',
  type: null,
  members: members.map(([name, value]) => ({ name, value })),
})
const empty = (): OrderValue => el([])

// ── lookups ───────────────────────────────────────────────────────────────────

function children(parent: ElementValue, name: string): ElementValue[] {
  const v = parent.members.find((m) => m.name === name)?.value
  if (!v || v.kind !== 'element') return []
  return v.members.map((m) => m.value).filter((x): x is ElementValue => x.kind === 'element')
}

function field(e: ElementValue, name: string): string | null {
  const v = e.members.find((m) => m.name === name)?.value
  return v && v.kind === 'text' ? v.value : null
}

function section(config: ElementValue, name: string): ElementValue {
  const v = config.members.find((m) => m.name === name)?.value
  if (!v || v.kind !== 'element') throw new Error(`blankOrder: PDB config has no <${name}>`)
  return v
}

/** The destination row, copied member-for-member from the PDB. */
function destinationRow(config: ElementValue, country: string): ElementValue {
  const rows = children(section(config, 'DestinationsData'), 'CountriesAndIsos')
  const row = rows.find((r) => field(r, 'Country') === country)
  if (!row) throw new Error(`blankOrder: PDB has no destination ${JSON.stringify(country)}`)
  return { kind: 'element', type: null, members: row.members.map((m) => ({ ...m })) }
}

/**
 * The newest CurrenciesData row for an ISO — newest by ValidFrom, which is a
 * plain `long` of .NET ticks (Currency.ValidFrom is not a DateTime).
 *
 * Confirmed against reference files: orders built from a given PDB all select
 * exactly this row.
 */
function currencyRow(config: ElementValue, iso: string, validFrom?: string): ElementValue {
  const rows = children(section(config, 'CurrenciesData'), 'Currencies').filter(
    (r) => field(r, 'Iso') === iso
  )
  if (!rows.length) throw new Error(`blankOrder: PDB has no currency ${iso}`)
  let newest = rows[0]
  for (const r of rows) {
    if (BigInt(field(r, 'ValidFrom') ?? '0') > BigInt(field(newest, 'ValidFrom') ?? '0')) newest = r
  }
  const row: ElementValue = {
    kind: 'element',
    type: null,
    members: newest.members.map((m) => ({ ...m })),
  }
  if (validFrom) {
    // Overwrites rather than selects: the pinned row may not be in this catalog
    // at all, which is precisely the case the pin exists for.
    const member = row.members.find((m) => m.name === 'ValidFrom')
    if (member) member.value = { kind: 'text', type: null, value: validFrom }
  }
  return row
}

/** A user's first configured price list. */
function priceListFor(config: ElementValue, username: string): string {
  const users = children(section(config, 'UsersData'), 'Users')
  const user = users.find((u) => field(u, 'Username') === username)
  if (!user) throw new Error(`blankOrder: PDB has no user ${JSON.stringify(username)}`)
  const lists = user.members.find((m) => m.name === 'PriceLists')?.value
  if (!lists || lists.kind !== 'element' || !lists.members.length) {
    throw new Error(`blankOrder: user ${username} has no price list`)
  }
  const first = lists.members[0].value
  if (first.kind !== 'text') throw new Error(`blankOrder: user ${username} price list is not text`)
  return first.value
}

// ── construction ──────────────────────────────────────────────────────────────

/** Builds the blank OrderData GPC starts a new configuration from. */
export function buildBlankOrder(pdb: GpcContainer, inputs: BlankOrderInputs): OrderDocument {
  const config = readPdbConfig(pdb)
  const country = inputs.destinationCountry ?? DEFAULT_DESTINATION
  const iso = inputs.currencyIso ?? DEFAULT_CURRENCY_ISO

  const root = el([
    ['DependentListsData', empty()],
    ['FreeArticlesData', empty()],
    ['FreeListArticlesData', empty()],
    ['SupportArticlesData', empty()],
    ['AccountDetailsData', el([
      ['IsDistributor', txt('false')],
      ['IsNewCustomer', txt('false')],
    ])],
    ['AttachedFiles', empty()],
    ['CleanOrder', txt('false')],
    ['CreationDate', txt(inputs.creationDate)],
    ['DestinationNew', destinationRow(config, country)],
    ['DiscountForCustomer', nil()],
    ['DiscountSplitPercentShare', nil()],
    ['DiscountSplitCurrencyShare', nil()],
    ['EndDate', nil()],
    ['OrderUsedInWeaponProduction', nil()],
    ['FinalPriceForEndCustomer', txt('0')],
    ['FinalPriceForEndCustomerLocalCurrency', nil()],
    ['FinalPriceForEndCustomerWithHandlingFee', nil()],
    ['Currency', currencyRow(config, iso, inputs.currencyValidFrom)],
    ['HandlingFee', nil()],
    ['HasPriceOnRequest', txt('false')],
    ['IsCustomerDiscountAcknowledged', txt('false')],
    ['DifferentFinalPriceForEndCustomerChecked', txt('false')],
    ['DirectSalesChecked', txt('false')],
    ['IsHandlingFeeApplicable', txt('false')],
    ['ContractType', txt('Purchase')],
    ['LastModified', txt(inputs.lastModified)],
    ['LocalTechnicalContact', el([
      ['IsOtherDepartment', txt('false')],
      ['IsOtherPosition', txt('false')],
      ['IsOtherSource', txt('false')],
    ])],
    ['Msrp', txt('0')],
    ['Dp', txt('0')],
    ['OrderAdministration', el([
      ['InvoiceAddressType', nil()],
      ['InvoiceNewCustomer', txt('false')],
      ['IsTarifNumberToggler', txt('false')],
      ['ShippingAddressType', nil()],
      ['ShippingNewCustomer', txt('false')],
    ])],
    ['OrderDate', nil()],
    ['OrderStatus', txt('Editing')],
    ['OrderValueToGom', nil()],
    ['OrderValueToGomWithHandlingFee', nil()],
    ['PriceList', txt(priceListFor(config, inputs.username))],
    ['SaleInformations', el([
      ['ClassificationProperty', empty()],
      ['CompetitionInformations', el([
        ['CompetitionInformation', competitionInformation()],
        ['CompetitionInformation', competitionInformation()],
        ['CompetitionInformation', competitionInformation()],
      ])],
      ['IsOtherPartSize', txt('false')],
    ])],
    ['Username', txt(inputs.username)],
    ['FinalizedDateTime', nil()],
  ])

  return { root }
}

/** GPC seeds three empty competitor slots on a new order. */
function competitionInformation(): OrderValue {
  return el([
    ['IsOtherCompetitor', txt('false')],
    ['IsOtherProductType', txt('false')],
  ])
}
