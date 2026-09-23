/**
 * Reading a GPC Order Block.
 *
 * One pasted block carries a whole order — customer, addresses, contact and
 * configuration — from whatever system already holds it. The format is
 * specified in `docs/order-block-format.md`; this reads it, resolves every item
 * against the open catalog, and reports what it could not resolve rather than
 * guessing.
 *
 * Nothing here applies anything. Parsing and resolving are separate from
 * applying so the UI can show the operator exactly what is about to change,
 * and so a block that is half wrong can be seen to be half wrong before any of
 * it lands on the order.
 */
import type { GpcContainer } from './container.ts'
import type { ElementValue } from './orderXml.ts'
import { readPdbConfig } from './blankOrder.ts'
import { findArticle } from './addItem.ts'
import { licenseOptions } from './licenses.ts'
import type { LicenseOption } from './licenses.ts'
import { MINIMUM_CONTRACT_MONTHS } from './contractTerm.ts'

/**
 * The only values GPC accepts for an address type.
 *
 * `applyOrderBlockFields` copies these strings through verbatim — they are
 * free text in the file — so a generator that invents one produces an order
 * the configurator cannot read back. Checked here rather than trusted, because
 * the two sides of this format are written by different people.
 */
const ADDRESS_TYPES = ['Customer', 'GOM Partner', 'Order Process Center', 'Other Address']

const BEGIN = '-----BEGIN GPC ORDER-----'
const END = '-----END GPC ORDER-----'

/** The only format version this viewer understands. */
export const ORDER_BLOCK_VERSION = 1

export interface OrderBlockSource {
  system?: string
  ref?: string
  url?: string
  generated?: string
}

export interface ArticleItem {
  type: 'article'
  sapNr?: string
  name?: string
  amount?: number
}

export interface LicenseItem {
  type: 'license'
  name: string
  sapNr?: string
  userEmail?: string
  userName?: string
}

export interface SmaItem {
  type: 'sma'
  dongleId: string
  endOldContract: string
  startNewContract?: string
  months?: number
  articles: string[]
  licenseUserEmail?: string
  licenseUserName?: string
}

export type OrderBlockItem = ArticleItem | LicenseItem | SmaItem

export interface OrderBlock {
  gpcOrder: number
  source?: OrderBlockSource
  catalog?: string
  priceList?: string
  currency?: string
  destination?: { country?: string; iso?: string }
  orderNumber?: string
  caseId?: string
  opportunityId?: string
  comment?: string
  account?: Record<string, string | boolean>
  contact?: Record<string, string>
  administration?: Record<string, string | boolean>
  items?: OrderBlockItem[]
}

export class OrderBlockError extends Error {}

/**
 * Pulls the JSON out of a pasted block.
 *
 * The envelope exists because raw JSON does not survive being copied through
 * mail or chat — a line wrap inside a string, or a quote turned into a smart
 * quote, breaks the paste invisibly. Base64 has neither problem. Bare JSON is
 * still accepted, because a generator being written needs to be readable.
 */
export function decodeOrderBlock(text: string): OrderBlock {
  const trimmed = text.trim()
  if (!trimmed) throw new OrderBlockError('Nothing pasted.')

  const fromBase64 = (body: string): string =>
    new TextDecoder().decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)))

  let json = trimmed
  const begin = trimmed.indexOf(BEGIN)
  if (begin >= 0) {
    const end = trimmed.indexOf(END, begin)
    if (end < 0) throw new OrderBlockError(`The block is missing its ${END} line — was it cut short?`)
    const body = trimmed.slice(begin + BEGIN.length, end).replace(/\s+/g, '')
    try {
      json = fromBase64(body)
    } catch {
      throw new OrderBlockError('The block is not valid base64. Copy it again, whole.')
    }
  } else if (!trimmed.startsWith('{')) {
    // The envelope lines go missing more easily than one would think — a chat
    // client that strips a leading dash, a selection that started on the second
    // line. The body alone is still unambiguous, so read it rather than
    // complain about a marker the person never saw. Be exact about what we
    // write, tolerant about what we read.
    try {
      json = fromBase64(trimmed.replace(/\s+/g, ''))
    } catch {
      throw new OrderBlockError(
        `This does not look like a GPC order block — it has no ${BEGIN} line and is not base64.`
      )
    }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new OrderBlockError(`The block is not valid JSON: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!parsed || typeof parsed !== 'object') throw new OrderBlockError('The block is not an object.')

  const block = parsed as OrderBlock
  if (typeof block.gpcOrder !== 'number') {
    throw new OrderBlockError('The block has no "gpcOrder" version. It may not be a GPC order block.')
  }
  if (block.gpcOrder !== ORDER_BLOCK_VERSION) {
    throw new OrderBlockError(
      `This block is format version ${block.gpcOrder}; this viewer reads version ${ORDER_BLOCK_VERSION}. Update the viewer.`
    )
  }
  if (block.items !== undefined && !Array.isArray(block.items)) {
    throw new OrderBlockError('"items" must be a list.')
  }
  return block
}

/** One item, matched against the catalog — or not. */
export interface ResolvedItem {
  /** Position in the block's `items`, so a report can point at it. */
  index: number
  item: OrderBlockItem
  /** What the viewer will add. Absent when `problem` is set. */
  resolved?:
    | { kind: 'article'; articleName: string; amount: number }
    | { kind: 'license'; option: LicenseOption; userEmail?: string; userName?: string }
    | { kind: 'sma'; item: SmaItem; articleNames: string[] }
  /** Why it could not be matched. Shown to the operator; never silently dropped. */
  problem?: string
}

export interface OrderBlockPlan {
  block: OrderBlock
  items: ResolvedItem[]
  /** Fields that will change, as `label` / `from` / `to`, for the preview. */
  warnings: string[]
  get ok(): boolean
}

function articlesBySap(config: ElementValue): Map<string, string[]> {
  const index = new Map<string, string[]>()
  const data = config.members.find((m) => m.name === 'ArticlesData')?.value
  const list = data && data.kind === 'element'
    ? data.members.find((m) => m.name === 'Articles')?.value
    : null
  if (!list || list.kind !== 'element') return index
  for (const member of list.members) {
    const article = member.value
    if (article.kind !== 'element') continue
    const sap = article.members.find((m) => m.name === 'SapNr')?.value
    const name = article.members.find((m) => m.name === 'LongName')?.value
    if (!sap || sap.kind !== 'text' || !sap.value) continue
    if (!name || name.kind !== 'text' || !name.value) continue
    const existing = index.get(sap.value)
    if (existing) existing.push(name.value)
    else index.set(sap.value, [name.value])
  }
  return index
}

/**
 * Matches an article by SAP number first, falling back to the long name.
 *
 * The SAP number is preferred because it is what an ERP already holds and it
 * survives a rename; catalogs do rename articles between releases. A SAP
 * number shared by several articles is disambiguated by the name when one was
 * given, and reported when it cannot be.
 */
function resolveArticle(
  config: ElementValue,
  bySap: Map<string, string[]>,
  item: ArticleItem
): { articleName: string } | { problem: string } {
  const label = item.sapNr ?? item.name ?? '(no name or SAP number)'
  if (item.sapNr) {
    const candidates = bySap.get(item.sapNr)
    if (candidates && candidates.length === 1) return { articleName: candidates[0] }
    if (candidates && candidates.length > 1) {
      if (item.name && candidates.includes(item.name)) return { articleName: item.name }
      return {
        problem: `SAP ${item.sapNr} matches ${candidates.length} articles in this catalog and the block gives no name to choose between them.`,
      }
    }
  }
  if (item.name) {
    try {
      findArticle(config, item.name)
      return { articleName: item.name }
    } catch {
      return {
        problem: item.sapNr
          ? `Neither SAP ${item.sapNr} nor the name "${item.name}" is in this catalog.`
          : `"${item.name}" is not in this catalog.`,
      }
    }
  }
  return { problem: `${label} — the item has neither a SAP number that matches nor a name.` }
}

/**
 * Works out what a block would do to the open order, without doing it.
 *
 * `catalog` is checked rather than enforced: a block built against another
 * product database usually still resolves, but its prices and SAP numbers come
 * from that one, so the operator is told.
 */
export function planOrderBlock(block: OrderBlock, pdb: GpcContainer, openCatalog?: string): OrderBlockPlan {
  const config = readPdbConfig(pdb)
  const bySap = articlesBySap(config)
  const licences = licenseOptions(config)
  const warnings: string[] = []

  if (block.catalog && openCatalog && block.catalog !== openCatalog) {
    warnings.push(
      `The block was built against ${block.catalog}; this order is on ${openCatalog}. Prices and SAP numbers differ between catalogs.`
    )
  }
  if (block.priceList) {
    warnings.push(`Price list: ${block.priceList}`)
  }
  for (const field of ['invoiceAddressType', 'shippingAddressType'] as const) {
    const value = block.administration?.[field]
    if (typeof value === 'string' && value !== '' && !ADDRESS_TYPES.includes(value)) {
      warnings.push(
        `${field} is ${JSON.stringify(value)}, which GPC does not know. It accepts ${ADDRESS_TYPES.join(', ')}.`
      )
    }
  }

  const items: ResolvedItem[] = (block.items ?? []).map((item, index): ResolvedItem => {
    if (!item || typeof item !== 'object' || typeof (item as OrderBlockItem).type !== 'string') {
      return { index, item: item as OrderBlockItem, problem: 'Item has no "type".' }
    }
    switch (item.type) {
      case 'article': {
        const found = resolveArticle(config, bySap, item)
        if ('problem' in found) return { index, item, problem: found.problem }
        const amount = Number(item.amount ?? 1)
        if (!Number.isFinite(amount) || amount < 1) {
          return { index, item, problem: `Amount ${JSON.stringify(item.amount)} is not a positive number.` }
        }
        return { index, item, resolved: { kind: 'article', articleName: found.articleName, amount } }
      }
      case 'license': {
        if (!item.name) return { index, item, problem: 'A license item needs a "name".' }
        const option = licences.find((o) => o.articleName === item.name)
        if (!option) {
          return { index, item, problem: `"${item.name}" is not offered by any software-licence list in this catalog.` }
        }
        return {
          index,
          item,
          resolved: { kind: 'license', option, userEmail: item.userEmail, userName: item.userName },
        }
      }
      case 'sma': {
        if (!item.dongleId) return { index, item, problem: 'A maintenance agreement needs a "dongleId".' }
        if (!item.endOldContract) return { index, item, problem: 'A maintenance agreement needs "endOldContract".' }
        const names = Array.isArray(item.articles) ? item.articles.filter(Boolean) : []
        if (names.length === 0) return { index, item, problem: 'A maintenance agreement needs at least one entry in "articles".' }
        if (item.months !== undefined && (!Number.isFinite(item.months) || item.months < MINIMUM_CONTRACT_MONTHS)) {
          return { index, item, problem: `A term is at least ${MINIMUM_CONTRACT_MONTHS} months; the block says ${JSON.stringify(item.months)}.` }
        }
        return { index, item, resolved: { kind: 'sma', item, articleNames: names } }
      }
      default:
        return { index, item, problem: `Unknown item type ${JSON.stringify((item as { type: string }).type)}.` }
    }
  })

  return {
    block,
    items,
    warnings,
    get ok() {
      return items.every((i) => i.resolved !== undefined)
    },
  }
}

/** A one-line description of an item, for the preview list. */
export function describeItem(entry: ResolvedItem): string {
  const { item, resolved } = entry
  if (resolved?.kind === 'article') {
    return `${resolved.amount} × ${resolved.articleName}`
  }
  if (resolved?.kind === 'license') {
    return `Licence: ${resolved.option.articleName} (${resolved.option.itemName})`
  }
  if (resolved?.kind === 'sma') {
    const term = resolved.item.months ? `, ${resolved.item.months} months` : ''
    return `SMA on ${resolved.item.dongleId}${term}: ${resolved.articleNames.join(', ')}`
  }
  if (item && typeof item === 'object' && 'type' in item) {
    const named = (item as ArticleItem).name ?? (item as ArticleItem).sapNr ?? (item as SmaItem).dongleId
    return `${item.type}${named ? ` ${named}` : ''}`
  }
  return 'item'
}
