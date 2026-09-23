/**
 * Software licences.
 *
 * "Software License" is not a list of products. The catalog holds four
 * configuration items under that heading, three of which open a dependent list
 * — `SASW2025`, `SWDL`, `EDU_LIC` — and one of which is a free list. The
 * products live inside those lists as options, so a picker that reads the
 * configuration items alone finds four entries and no products, which is what
 * the licence button used to show.
 *
 * Adding a licence therefore means adding the line that owns the option, with
 * that option selected — the same shape as a maintenance agreement.
 */
import type { GpcContainer } from './container.ts'
import type { OrderDocument } from './orderXml.ts'
import { readPdbConfig } from './blankOrder.ts'
import { addDependentList } from './dependentList.ts'
import { dependentListLines } from './catalogIndex.ts'

/** `ConfigurationItem.GroupLevel1` for a licence line. */
export const LICENSE_CATEGORY = 'Software License'

export interface LicenseOption {
  /** The product, as the picker shows it. */
  articleName: string
  /** The configuration item that owns it — what the order line is named after. */
  itemName: string
  subCategory: string
  /** The dependent list and section the option sits in. */
  listName: string
  sectionName: string
}

/** Every licence a catalog offers, flattened out of its dependent lists. */
export function licenseOptions(config: Parameters<typeof dependentListLines>[0]): LicenseOption[] {
  const out: LicenseOption[] = []
  const seen = new Set<string>()
  for (const line of dependentListLines(config, LICENSE_CATEGORY)) {
    for (const option of line.options) {
      // A product can appear in more than one section of a list; the first
      // occurrence is the one the configurator presents.
      const key = `${line.itemName}\u0000${option.articleName}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        articleName: option.articleName,
        itemName: line.itemName,
        subCategory: line.subCategory,
        listName: line.listName,
        sectionName: option.sectionName,
      })
    }
  }
  out.sort((a, b) => a.articleName.localeCompare(b.articleName))
  return out
}

/** The same list, from raw config.xml, for callers that hold the text. */
export function licenseOptionsFromConfig(pdb: GpcContainer): LicenseOption[] {
  return licenseOptions(readPdbConfig(pdb))
}

export interface AddLicenseOptions {
  /** Stored as the line's `Reply1` / `Reply2`. */
  userZeissId?: string
  userName?: string
  amount?: number
}

/**
 * Adds a licence line with one product selected.
 *
 * The whole option tree of the owning list is written out, selected or not,
 * because that is what the configurator records and what lets the choice be
 * changed later.
 */
export function addLicense(
  order: OrderDocument,
  pdb: GpcContainer,
  option: LicenseOption,
  options: AddLicenseOptions = {}
): OrderDocument {
  return addDependentList(order, pdb, option.itemName, {
    reply1: options.userZeissId,
    reply2: options.userName,
    selections: [
      {
        sectionName: option.sectionName,
        articleName: option.articleName,
        amount: String(options.amount ?? 1),
        amountMode: 'UserChoice',
      },
    ],
  })
}
