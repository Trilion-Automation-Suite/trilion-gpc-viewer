/**
 * Parses the PDB DependentList catalog embedded in order.xml to build a
 * searchable list of software license items.
 *
 * In GPC order files, the full product database is embedded as a <Database>
 * element. Within it, DependentListsData contains <DependentList> children
 * (not DependentListScreenData) that describe available configuration items.
 * We filter to those with GroupLevel1 = "Software License".
 */

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
