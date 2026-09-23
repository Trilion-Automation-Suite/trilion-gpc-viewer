/**
 * Software Maintenance Agreements.
 *
 * A maintenance agreement is a **dongle row**, and a dongle row is a
 * `DependentListSupportScreenData`: a synthetic `DongleList` configuration item
 * holding the whole `SMA_EXT` option tree, plus the dongle id and the contract
 * term. The `SupportArticle` entries under `SoftwareSupportArticles` are
 * derived from it — `refreshSupportArticles` rebuilds them from the selections
 * every time, which is what the configurator does.
 *
 * Writing those article rows without the dongle row, as this module first did,
 * gives GPC a category with nothing in it: the rows exist but the row that owns
 * them, carries the dongle and draws the group does not.
 *
 * Several agreements on one dongle are several selected options in one dongle
 * row, not several rows. Two rows means two dongles — or the same dongle
 * deliberately configured twice, which the reference file also shows.
 */
import type { GpcContainer } from './container.ts'
import type { ElementValue, OrderDocument } from './orderXml.ts'
import { readPdbConfig } from './blankOrder.ts'
import { findSupportItem, plainSupportFilter, refreshSupportArticles } from './addItem.ts'
import { addDependentListSupport } from './dependentList.ts'
import type { DependentListSelection } from './dependentList.ts'
import { findOption, sectionDefault } from './catalogIndex.ts'

/** The section of `SMA_EXT` that chooses how the licence is held. */
const LICENSE_MODEL_SECTION = 'License model'

export interface SmaContract {
  /** Dongle or sensor serial the agreement covers. Operator input. */
  dongleId: string
  /**
   * End of the agreement being replaced, `YYYY-MM-DD`. The new one runs from
   * the next day for a year, which is how every reference line is dated.
   */
  endOldContract: string
  /** Overrides the derived dates when a line does not follow the usual term. */
  startNewContract?: string
  endNewContract?: string
  /** Stored as the support screen's `Reply1` / `Reply2`; GPC prompts for both. */
  licenseUserEmail?: string
  licenseUserName?: string
  /** Defaults to the licence model the catalog marks as default. */
  licenseModel?: string
}

/** `2026-05-01` -> `2026-05-01T00:00:00`, the form GPC writes. */
function dateTime(day: string): string {
  return /T/.test(day) ? day : `${day}T00:00:00`
}

function shiftDays(day: string, days: number): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function addYear(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10)
}

/** The three dates a dongle row carries, derived from the old contract's end. */
export function contractDates(contract: Pick<SmaContract, 'endOldContract' | 'startNewContract' | 'endNewContract'>): {
  startNewContract: string
  endNewContract: string
  endOldContract: string
} {
  const endOld = contract.endOldContract.slice(0, 10)
  return {
    endOldContract: dateTime(endOld),
    startNewContract: dateTime(contract.startNewContract ?? shiftDays(endOld, 1)),
    endNewContract: dateTime(contract.endNewContract ?? addYear(endOld)),
  }
}

function sub(e: ElementValue, name: string): ElementValue | null {
  const v = e.members.find((m) => m.name === name)?.value
  return v && v.kind === 'element' ? v : null
}

function text(e: ElementValue, name: string): string | null {
  const v = e.members.find((m) => m.name === name)?.value
  return v && v.kind === 'text' ? (v.value ?? null) : null
}

function kids(e: ElementValue | null): ElementValue[] {
  if (!e) return []
  return e.members.map((m) => m.value).filter((v): v is ElementValue => v.kind === 'element')
}

/** The order's support screen, or null before one exists. */
function supportScreen(order: OrderDocument): ElementValue | null {
  const list = order.root.members.find((m) => m.name === 'SupportArticlesData')?.value
  if (!list || list.kind !== 'element') return null
  return kids(list)[0] ?? null
}

/** The dongle rows in the order, in file order. */
export function smaDongleRows(order: OrderDocument): ElementValue[] {
  const screen = supportScreen(order)
  return screen ? kids(sub(screen, 'DependentListSupportScreenDatas')) : []
}

/** One dongle row, flattened for display and editing. */
export interface SmaDongleView {
  /** Position in `DependentListSupportScreenDatas`; how the editors address it. */
  index: number
  dongleId: string
  startNewContract: string
  endNewContract: string
  endOldContract: string
  totalMsrp: string
  totalDp: string
  /** The options switched on, licence model included. */
  selected: Array<{ sectionName: string; articleName: string; amount: string }>
}

export function smaDongles(order: OrderDocument): SmaDongleView[] {
  return smaDongleRows(order).map((row, index) => {
    const selected: SmaDongleView['selected'] = []
    for (const section of kids(sub(row, 'Sections'))) {
      const sectionName = text(section, 'Name') ?? ''
      for (const option of kids(sub(section, 'SectionArticles'))) {
        const amount = text(option, 'Amount') ?? '0'
        if (amount !== '0') {
          selected.push({ sectionName, articleName: text(option, 'Name') ?? '', amount })
        }
      }
    }
    return {
      index,
      dongleId: text(row, 'DongleId') ?? '',
      startNewContract: text(row, 'StartNewContract') ?? '',
      endNewContract: text(row, 'EndNewContract') ?? '',
      endOldContract: text(row, 'EndOldContract') ?? '',
      totalMsrp: text(row, 'TotalMsrp') ?? '0',
      totalDp: text(row, 'TotalDp') ?? '0',
      selected,
    }
  })
}

/** The `SMA_EXT` list name, taken from the catalog's support item. */
export function smaListName(config: ElementValue): string {
  return plainSupportFilter(findSupportItem(config))
}

/**
 * Turns an option on or off inside a dongle row.
 *
 * `UserChoice` is what the configurator writes for anything the operator picked
 * and `None` for anything left alone; the licence model keeps `Default`,
 * because the catalog is what turned it on.
 */
function setOption(row: ElementValue, sectionName: string, articleName: string, amount: string, mode: string): boolean {
  for (const section of kids(sub(row, 'Sections'))) {
    if (text(section, 'Name') !== sectionName) continue
    for (const option of kids(sub(section, 'SectionArticles'))) {
      if (text(option, 'Name') !== articleName) continue
      for (const member of option.members) {
        if (member.name === 'Amount') member.value = { kind: 'text', type: null, value: amount }
        if (member.name === 'AmountMode') member.value = { kind: 'text', type: null, value: mode }
      }
      return true
    }
  }
  return false
}

function setText(e: ElementValue, name: string, value: string): void {
  const member = e.members.find((m) => m.name === name)
  if (member) member.value = { kind: 'text', type: null, value }
}

/**
 * Adds a dongle row with the given agreements on it.
 *
 * `dongleIndex` adds to an existing row instead, which is how a second
 * agreement joins a dongle already on the order.
 */
export function addSmaExtension(
  order: OrderDocument,
  pdb: GpcContainer,
  articleNames: string | string[],
  contract: SmaContract
): OrderDocument {
  if (!contract.dongleId) throw new Error('sma: a software maintenance agreement needs a dongle id')
  const names = Array.isArray(articleNames) ? articleNames : [articleNames]
  if (names.length === 0) throw new Error('sma: no articles to add')

  const config = readPdbConfig(pdb)
  const listName = smaListName(config)
  const dates = contractDates(contract)

  const model =
    contract.licenseModel ?? sectionDefault(config, listName, LICENSE_MODEL_SECTION)?.articleName
  const selections: DependentListSelection[] = []
  if (model) {
    selections.push({
      sectionName: LICENSE_MODEL_SECTION,
      articleName: model,
      amount: '1',
      // The catalog turned this on, not the operator — unless they changed it.
      amountMode: contract.licenseModel ? 'UserChoice' : 'Default',
    })
  }
  for (const name of names) {
    const option = findOption(config, listName, name)
    selections.push({
      sectionName: option.sectionName,
      articleName: option.articleName,
      amount: '1',
      amountMode: 'UserChoice',
    })
  }

  addDependentListSupport(order, pdb, {
    ...dates,
    dongleId: contract.dongleId,
    selections,
    replyEmail: contract.licenseUserEmail,
    replyName: contract.licenseUserName,
  })
  return order
}

/**
 * Adds agreements to a dongle row already on the order.
 *
 * The row's option tree is edited in place and the article rows rebuilt from
 * it, so the result is the same as if both had been chosen at once.
 */
export function addSmaExtensionToDongle(
  order: OrderDocument,
  pdb: GpcContainer,
  dongleIndex: number,
  articleNames: string | string[]
): OrderDocument {
  const rows = smaDongleRows(order)
  const row = rows[dongleIndex]
  if (!row) throw new Error(`sma: the order has no dongle row ${dongleIndex}`)
  const config = readPdbConfig(pdb)
  const listName = smaListName(config)

  for (const name of Array.isArray(articleNames) ? articleNames : [articleNames]) {
    const option = findOption(config, listName, name)
    if (!setOption(row, option.sectionName, option.articleName, '1', 'UserChoice')) {
      throw new Error(`sma: dongle row has no option ${JSON.stringify(name)}`)
    }
  }
  rebuild(order, pdb, config)
  return order
}

/** Switches an agreement off. The licence model cannot be removed this way. */
export function removeSmaExtension(
  order: OrderDocument,
  pdb: GpcContainer,
  dongleIndex: number,
  articleName: string
): OrderDocument {
  const row = smaDongleRows(order)[dongleIndex]
  if (!row) throw new Error(`sma: the order has no dongle row ${dongleIndex}`)
  const config = readPdbConfig(pdb)
  const option = findOption(config, smaListName(config), articleName)
  if (option.sectionName === LICENSE_MODEL_SECTION) {
    throw new Error('sma: the licence model is what the agreement hangs from and cannot be removed')
  }
  setOption(row, option.sectionName, option.articleName, '0', 'None')
  rebuild(order, pdb, config)
  return order
}

/** Removes a dongle row and everything on it. */
export function removeSmaDongle(order: OrderDocument, pdb: GpcContainer, dongleIndex: number): OrderDocument {
  const screen = supportScreen(order)
  const list = screen ? sub(screen, 'DependentListSupportScreenDatas') : null
  if (!screen || !list) throw new Error('sma: the order has no support screen')
  const elements = list.members.filter((m) => m.value.kind === 'element')
  const target = elements[dongleIndex]
  if (!target) throw new Error(`sma: the order has no dongle row ${dongleIndex}`)
  list.members = list.members.filter((m) => m !== target)
  rebuild(order, pdb, readPdbConfig(pdb))
  return order
}

export interface SmaContractEdit {
  dongleId?: string
  endOldContract?: string
  startNewContract?: string
  endNewContract?: string
  licenseUserEmail?: string
  licenseUserName?: string
}

/**
 * Changes a dongle row's serial or its term.
 *
 * The dates live on the dongle row *and* on every article row derived from it,
 * so the article rows are rebuilt rather than patched — the single place they
 * come from is the row itself.
 */
export function setSmaContract(
  order: OrderDocument,
  pdb: GpcContainer,
  dongleIndex: number,
  edit: SmaContractEdit
): OrderDocument {
  const row = smaDongleRows(order)[dongleIndex]
  if (!row) throw new Error(`sma: the order has no dongle row ${dongleIndex}`)

  if (edit.dongleId !== undefined) setText(row, 'DongleId', edit.dongleId)
  if (edit.endOldContract !== undefined || edit.startNewContract !== undefined || edit.endNewContract !== undefined) {
    const dates = contractDates({
      endOldContract: edit.endOldContract ?? (text(row, 'EndOldContract') ?? '').slice(0, 10),
      startNewContract: edit.startNewContract,
      endNewContract: edit.endNewContract,
    })
    setText(row, 'StartNewContract', dates.startNewContract)
    setText(row, 'EndNewContract', dates.endNewContract)
    setText(row, 'EndOldContract', dates.endOldContract)
  }

  const screen = supportScreen(order)
  if (screen) {
    if (edit.licenseUserEmail !== undefined) setText(screen, 'Reply1', edit.licenseUserEmail)
    if (edit.licenseUserName !== undefined) setText(screen, 'Reply2', edit.licenseUserName)
  }
  rebuild(order, pdb, readPdbConfig(pdb))
  return order
}

/** Rebuilds the derived article rows and the screen totals. */
function rebuild(order: OrderDocument, _pdb: GpcContainer, config: ElementValue): void {
  const screen = supportScreen(order)
  if (screen) refreshSupportArticles(screen, config)
}

/** Kept for callers that only want to know which dongles are already covered. */
export function donglesInScreen(screen: ElementValue): string[] {
  const ids: string[] = []
  for (const row of kids(sub(screen, 'DependentListSupportScreenDatas'))) {
    const id = text(row, 'DongleId')
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** The licence-model option the catalog defaults to. */
export function defaultLicenseModel(config: ElementValue): string {
  const option = sectionDefault(config, smaListName(config), LICENSE_MODEL_SECTION)
  if (!option) throw new Error(`sma: SMA_EXT has no ${JSON.stringify(LICENSE_MODEL_SECTION)} section`)
  return option.articleName
}

/** Everything `SMA_EXT` offers, for a picker. */
export { listOptions as smaOptions } from './catalogIndex.ts'
