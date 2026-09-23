/**
 * Software Maintenance Agreements.
 *
 * An SMA line is not a single article. The catalog's `SMA_EXT` dependent list
 * says what one is made of: a **License model** section, `ExactlyOne`,
 * defaulting to "External Dongle without System", followed by the extension
 * sections that hold the actual agreements.
 *
 * That license-model article is the row the configurator's UI groups
 * everything else under. Adding an extension on its own produces a line that
 * opens in GPC as an empty category — there is nothing for the extension to
 * hang from. The reference file shows the shape plainly: a zero-priced
 * "External Dongle without System" entry, then the extensions, every one of
 * them repeating the same `SensorSnDongleId` and the same three contract dates.
 *
 * The dongle id and the dates are operator input. Nothing in the catalog knows
 * them, and GPC asks for them on the screen — along with the licence user's
 * email and name, which it stores as the line's `Reply1` and `Reply2` and
 * prompts for through the configuration item's `Question1` and `Question2`.
 */
import type { GpcContainer } from './container.ts'
import type { ElementValue, OrderDocument } from './orderXml.ts'
import { readPdbConfig } from './blankOrder.ts'
import { addSupportArticle, ensureSupportScreen, findSupportItem, plainSupportFilter } from './addItem.ts'

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
  /** Stored as `Reply1` / `Reply2`; GPC prompts for both. */
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
  const at = new Date(Date.UTC(y, m - 1, d + days))
  return at.toISOString().slice(0, 10)
}

function addYear(day: string): string {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y + 1, m - 1, d)).toISOString().slice(0, 10)
}

/** The three dates a support line carries, derived from the old contract's end. */
export function contractDates(contract: SmaContract): {
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

function sectionsOf(list: ElementValue): ElementValue[] {
  const sections = list.members.find((m) => m.name === 'Sections')?.value
  if (!sections || sections.kind !== 'element') return []
  return sections.members
    .map((m) => m.value)
    .filter((v): v is ElementValue => v.kind === 'element')
}

function text(e: ElementValue, name: string): string | null {
  const v = e.members.find((m) => m.name === name)?.value
  return v && v.kind === 'text' ? (v.value ?? null) : null
}

/**
 * The licence-model article the catalog defaults to — the one section article
 * with a non-zero `DefaultAmount`.
 *
 * Read rather than hard-coded: "External Dongle without System" is PDB290's
 * default, not a law, and the section also offers "PC bound" and
 * "Floating License".
 */
export function defaultLicenseModel(config: ElementValue, supportItem: ElementValue): string {
  const wanted = plainSupportFilter(supportItem)
  const data = config.members.find((m) => m.name === 'DependentListsData')?.value
  const lists = data && data.kind === 'element'
    ? data.members.find((m) => m.name === 'DependentLists')?.value
    : null
  if (!lists || lists.kind !== 'element') throw new Error('sma: catalog has no DependentLists')

  for (const member of lists.members) {
    const list = member.value
    if (list.kind !== 'element' || text(list, 'DependentListName') !== wanted) continue
    for (const section of sectionsOf(list)) {
      if (text(section, 'LongName') !== LICENSE_MODEL_SECTION) continue
      const articles = section.members.find((m) => m.name === 'Articles')?.value
      if (!articles || articles.kind !== 'element') break
      let first: string | null = null
      for (const entry of articles.members) {
        if (entry.value.kind !== 'element') continue
        const name = text(entry.value, 'LongName')
        if (!name) continue
        first ??= name
        if ((text(entry.value, 'DefaultAmount') ?? '0') !== '0') return name
      }
      if (first) return first
    }
  }
  throw new Error(`sma: ${wanted} has no ${JSON.stringify(LICENSE_MODEL_SECTION)} section`)
}

/** Every dongle id already covered by a line in the support screen. */
export function donglesInScreen(screen: ElementValue): string[] {
  const list = screen.members.find((m) => m.name === 'SoftwareSupportArticles')?.value
  if (!list || list.kind !== 'element') return []
  const ids: string[] = []
  for (const member of list.members) {
    if (member.value.kind !== 'element') continue
    const id = text(member.value, 'SensorSnDongleId')
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Adds one or more SMA extensions for a dongle, creating the licence-model row
 * the first time that dongle appears.
 *
 * Returns the order. Adding a second extension for a dongle already on the
 * order does not repeat its licence-model row, which is what the reference
 * file shows: one row per dongle group, extensions after it.
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
  const dates = contractDates(contract)
  const options = {
    list: 'SoftwareSupportArticles' as const,
    sensorSnDongleId: contract.dongleId,
    ...dates,
    replyEmail: contract.licenseUserEmail,
    replyName: contract.licenseUserName,
  }

  // Creating the screen here rather than letting the first add do it, so the
  // licence-model row can be placed before anything else on a new line.
  const screen = ensureSupportScreen(order, config, options)
  if (!donglesInScreen(screen).includes(contract.dongleId)) {
    const model = contract.licenseModel ?? defaultLicenseModel(config, findSupportItem(config))
    addSupportArticle(order, pdb, model, options)
  }

  for (const name of names) addSupportArticle(order, pdb, name, options)
  return order
}
