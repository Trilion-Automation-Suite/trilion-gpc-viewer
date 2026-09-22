/**
 * The searchable list of software licence items.
 *
 * Two sources, because the format moved. Current files keep the catalog in
 * config.xml and that is where this looks first. Older ones embedded a
 * <Database> element inside order.xml, and buildLicenseCatalog still reads
 * that — but modern files omit it, so relying on it alone left the licence
 * picker empty with nothing to choose from.
 *
 * Parses the PDB DependentList catalog embedded in order.xml to build a
 * searchable list of software license items.
 *
 * In GPC order files, the full product database is embedded as a <Database>
 * element. Within it, DependentListsData contains <DependentList> children
 * (not DependentListScreenData) that describe available configuration items.
 * We filter to those with GroupLevel1 = "Software License".
 */

import { sliceSection } from './configScan.js'

export interface LicenseCatalogEntry {
  name: string
  category: string     // GroupLevel1 (e.g. "Software License")
  subCategory: string  // GroupLevel2
  sapNr: string
}

function directChild(parent: Element, tagName: string): Element | null {
  for (const child of Array.from(parent.children)) {
    if (child.tagName === tagName) return child
  }
  return null
}

function childText(parent: Element, tagName: string): string {
  return directChild(parent, tagName)?.textContent?.trim() ?? ''
}

/**
 * Build a sorted list of software license catalog entries from order.xml.
 * Returns an empty array if no catalog is present (modern files may omit it).
 */
export function buildLicenseCatalog(orderXml: string): LicenseCatalogEntry[] {
  const parser = new DOMParser()
  const doc = parser.parseFromString(orderXml, 'application/xml')
  if (doc.querySelector('parsererror')) return []

  const entries: LicenseCatalogEntry[] = []

  // Walk all DependentListsData containers; the catalog one contains
  // <DependentList> children (not DependentListScreenData).
  const containers = doc.getElementsByTagName('DependentListsData')
  for (let ci = 0; ci < containers.length; ci++) {
    const container = containers[ci]
    // Only process catalog containers (no DependentListScreenData children)
    let hasScreenData = false
    for (const child of Array.from(container.children)) {
      if (child.tagName === 'DependentListScreenData') { hasScreenData = true; break }
    }
    if (hasScreenData) continue

    for (const el of Array.from(container.children)) {
      if (el.tagName !== 'DependentList') continue
      const ciEl = directChild(el, 'ConfigurationItem')
      if (!ciEl) continue
      const category = childText(ciEl, 'GroupLevel1')
      if (category !== 'Software License') continue
      const name = childText(ciEl, 'Name')
      if (!name) continue
      entries.push({
        name,
        category,
        subCategory: childText(ciEl, 'GroupLevel2'),
        sapNr: childText(ciEl, 'SapNr') || childText(el, 'SapNr'),
      })
    }
  }

  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}

/**
 * Software-licence configuration items from config.xml.
 *
 * Scanned rather than parsed into a DOM: config.xml is around 45 MB and this
 * runs on every file open.
 */
export function buildLicenseCatalogFromConfig(configXml: string): LicenseCatalogEntry[] {
  const section = sliceSection(configXml, 'ConfigurationItemsData')
  if (!section) return []

  const entries: LicenseCatalogEntry[] = []
  const open = '<ConfigurationItem>'
  const close = '</ConfigurationItem>'
  let at = 0
  for (;;) {
    const start = section.indexOf(open, at)
    if (start < 0) break
    const end = section.indexOf(close, start + open.length)
    if (end < 0) break
    const block = section.slice(start + open.length, end)
    at = end + close.length

    const category = tagText(block, 'GroupLevel1')
    if (category !== 'Software License') continue
    const name = tagText(block, 'Name')
    if (!name) continue
    entries.push({
      name,
      category,
      subCategory: tagText(block, 'GroupLevel2'),
      sapNr: tagText(block, 'SapNr'),
    })
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  return entries
}

function tagText(block: string, tag: string): string {
  const open = `<${tag}>`
  const start = block.indexOf(open)
  if (start < 0) return ''
  const end = block.indexOf(`</${tag}>`, start + open.length)
  return end < 0 ? '' : block.slice(start + open.length, end).trim()
}
