/**
 * Where an article can be chosen from.
 *
 * Most of the catalog's interesting articles are not free-standing: they are
 * options inside a dependent list, reachable only through the configuration
 * item that opens that list. A maintenance agreement is an option in `SMA_EXT`;
 * a software licence is an option in `SASW2025`, `SWDL` or `EDU_LIC`. Adding
 * one means creating — or extending — the line that owns it, with that option
 * switched on.
 *
 * So a picker needs to answer "which list and which section offers this?", and
 * that is what this index is for.
 */
import type { ElementValue } from './orderXml.ts'
import { findDependentList } from './dependentList.ts'

export interface DependentListOption {
  /** The dependent list's own name, e.g. `SMA_EXT`. */
  listName: string
  /** The section within it, which a selection must name. */
  sectionName: string
  /** The article, by long name. */
  articleName: string
  /** Non-zero when the catalog turns this option on by itself. */
  defaultAmount: string
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

/** Every option a dependent list offers, section by section, in catalog order. */
export function listOptions(config: ElementValue, listName: string): DependentListOption[] {
  const out: DependentListOption[] = []
  for (const section of kids(sub(findDependentList(config, listName), 'Sections'))) {
    const sectionName = text(section, 'LongName')
    if (!sectionName) continue
    for (const entry of kids(sub(section, 'Articles'))) {
      const articleName = text(entry, 'LongName')
      if (!articleName) continue
      out.push({
        listName,
        sectionName,
        articleName,
        defaultAmount: text(entry, 'DefaultAmount') ?? '0',
      })
    }
  }
  return out
}

/**
 * The section of `listName` that offers `articleName`.
 *
 * A name can appear in more than one section — "Automatic SMA extension" does —
 * so the first match wins, which is the order the configurator presents them in.
 */
export function findOption(
  config: ElementValue,
  listName: string,
  articleName: string
): DependentListOption {
  const found = listOptions(config, listName).find((o) => o.articleName === articleName)
  if (!found) {
    throw new Error(
      `catalogIndex: ${JSON.stringify(listName)} does not offer ${JSON.stringify(articleName)}`
    )
  }
  return found
}

/** The option a section turns on by itself, if it has one. */
export function sectionDefault(
  config: ElementValue,
  listName: string,
  sectionName: string
): DependentListOption | null {
  const inSection = listOptions(config, listName).filter((o) => o.sectionName === sectionName)
  return inSection.find((o) => o.defaultAmount !== '0') ?? inSection[0] ?? null
}

/**
 * The configuration items that open a dependent list, with the options each
 * one leads to — what a picker shows when the operator wants a licence.
 *
 * `category` filters on `GroupLevel1`: "Software License" for licences,
 * "ZEISS Metrology Care" for maintenance.
 */
export interface DependentListLine {
  /** The configuration item's `Name`, which is what `addDependentList` takes. */
  itemName: string
  subCategory: string
  sapNr: string
  listName: string
  options: DependentListOption[]
}

export function dependentListLines(config: ElementValue, category: string): DependentListLine[] {
  const section = config.members.find((m) => m.name === 'ConfigurationItemsData')?.value
  const items = section && section.kind === 'element' ? kids(sub(section, 'ConfigurationItems')) : []
  const out: DependentListLine[] = []
  for (const item of items) {
    if (text(item, 'GroupLevel1') !== category) continue
    if (text(item, 'ItemType') !== 'DependentList') continue
    const itemName = text(item, 'Name')
    const listName = text(item, 'WorksheetArticleFilter')
    if (!itemName || !listName) continue
    let options: DependentListOption[] = []
    try {
      options = listOptions(config, listName)
    } catch {
      // A configuration item can name a list the catalog does not ship.
      continue
    }
    out.push({
      itemName,
      subCategory: text(item, 'GroupLevel2') ?? '',
      sapNr: text(item, 'SapNr') ?? '',
      listName,
      options,
    })
  }
  return out
}
