/**
 * Applying a GPC Order Block to an open order.
 *
 * Two halves, because the order has two halves. The configuration — articles,
 * licences, agreements — is built on the XML document through the same
 * functions the UI uses. The customer, addresses and contact are plain fields
 * on the parsed summary, which the save path already knows how to write.
 *
 * Everything lands in one pass, and an item that did not resolve was already
 * reported by `planOrderBlock`; nothing is guessed at here.
 */
import type { GpcContainer } from './container.ts'
import type { OrderDocument } from './orderXml.ts'
import type { OrderSummary } from '../../types/order.js'
import { addCatalogArticle, recalculateOrder } from './addItem.ts'
import { parseOrderXml, serializeOrderXml, setMember } from './orderXml.ts'
import { EngineCatalog } from './dependentListEngine.ts'
import { assembleSystem } from './systemAssembly.ts'
import type { ArticleLine } from './systemAssembly.ts'
import { currencyRow, readPdbConfig } from './blankOrder.ts'
import { addLicense } from './licenses.ts'
import { addSmaExtension } from './sma.ts'
import type { OrderBlockPlan } from './orderBlock.ts'

/** What went in, and what would not. */
export interface ApplyReport {
  added: string[]
  failed: Array<{ what: string; problem: string }>
  /**
   * What the operator should know that is not a failure: a line kept beside a
   * system because its rules would not take it, sections left to pick.
   */
  notes: string[]
}

/**
 * Builds the block's configuration onto the document.
 *
 * An item that throws is recorded and the rest continue: a block of forty
 * lines should not be lost because one article was withdrawn from the catalog,
 * and the operator needs to see which one it was.
 */
export function applyOrderBlockItems(
  order: OrderDocument,
  pdb: GpcContainer,
  plan: OrderBlockPlan
): ApplyReport {
  const report: ApplyReport = { added: [], failed: [], notes: [] }

  // The block's price list governs, and it has to be on the document before
  // anything is priced: every article's Msrp and Dp are read from the row with
  // this name. It is written onto the order too, not merely passed to the
  // pricing, because `patchOrderXml` deliberately never touches PriceList — a
  // save must not rewrite it — so the document is the only place it can land.
  const priceList = plan.block.priceList
  if (priceList) {
    setMember(order.root, 'OrderData', 'PriceList', { kind: 'text', type: null, value: priceList })
  }

  // Same reasoning as the price list, and for the same reason it has to happen
  // first: every Msrp and Dp is computed at the order's exchange rate. The row
  // comes from the catalog, so the rate and its ValidFrom are GPC's own.
  const currency = plan.block.currency
  if (currency) {
    try {
      setMember(order.root, 'OrderData', 'Currency', currencyRow(readPdbConfig(pdb), currency))
    } catch {
      // The catalog does not carry it; planOrderBlock has already said so.
    }
  }

  // Complete systems first: each is built as one configured line, and the
  // article lines it took are not added again below. Each is tried on a copy,
  // so a system the rules cannot finish leaves its lines to fall back to
  // plain articles rather than half a system on the order.
  const consumed = new Set<number>()
  /** Everything the configured systems hold, and which system holds it. */
  const inSystem = new Map<string, string>()
  if (plan.systems.length > 0) {
    const catalog = new EngineCatalog(readPdbConfig(pdb))
    const lines: ArticleLine[] = []
    for (const entry of plan.items) {
      if (entry.resolved?.kind !== 'article') continue
      const item = entry.item as { sapNr?: string; name?: string }
      lines.push({
        index: entry.index,
        articleName: entry.resolved.articleName,
        amount: entry.resolved.amount,
        ...(item.sapNr ? { sapNr: item.sapNr } : {}),
        ...(item.name ? { name: item.name } : {}),
      })
    }
    for (const match of plan.systems) {
      const trial = parseOrderXml(serializeOrderXml(order))
      try {
        const result = assembleSystem(trial, pdb, catalog, match, lines)
        order.root.members = trial.root.members
        for (const i of result.placed) consumed.add(i)
        for (const name of result.contains) if (!inSystem.has(name)) inSystem.set(name, `${result.no} ${result.itemName}`)
        report.added.push(
          `${result.no} ${result.itemName}, configured from ${result.placed.length} line${result.placed.length === 1 ? '' : 's'}` +
          (result.addedByRules.length ? `; GPC's rules added ${result.addedByRules.join(', ')}` : '')
        )
        for (const r of result.refused) {
          report.notes.push(`${describe(r.index)} added as its own line: ${r.reason}`)
        }
        if (result.incomplete.length > 0) {
          report.notes.push(`${result.no} ${result.itemName} still needs a pick in Configure: ${result.incomplete.join(', ')}`)
        }
      } catch (err) {
        report.notes.push(
          `${match.itemName} could not be configured (${err instanceof Error ? err.message : String(err)}); its lines were added one by one`
        )
      }
    }
  }

  for (const entry of plan.items) {
    if (consumed.has(entry.index)) continue
    const resolved = entry.resolved
    // A licence the camera implies, the eLearning a system's Training carries:
    // already on the order inside the system, so adding it again would sell it
    // twice. Checked before "unresolved", because a licence that exists only
    // inside a system has nowhere else to resolve.
    const raw = entry.item as { name?: string }
    const named = resolved?.kind === 'article'
      ? resolved.articleName
      : resolved?.kind === 'license' ? resolved.option.articleName : raw?.name ?? null
    const heldBy = named ? inSystem.get(named) : undefined
    if (named && heldBy) {
      report.added.push(`${named}: already in ${heldBy}`)
      continue
    }
    if (!resolved) {
      report.failed.push({ what: describe(entry.index), problem: entry.problem ?? 'unresolved' })
      continue
    }
    try {
      if (resolved.kind === 'article') {
        addCatalogArticle(order, pdb, resolved.articleName, {
          amount: resolved.amount,
          ...(priceList ? { priceListName: priceList } : {}),
          ...(resolved.note ? { reply1: resolved.note } : {}),
        })
        report.added.push(`${resolved.amount} × ${resolved.articleName}`)
      } else if (resolved.kind === 'license') {
        addLicense(order, pdb, resolved.option, {
          userZeissId: resolved.userEmail,
          userName: resolved.userName,
          ...(priceList ? { priceListName: priceList } : {}),
        })
        report.added.push(`Licence ${resolved.option.articleName}`)
      } else {
        addSmaExtension(order, pdb, resolved.articleNames, {
          dongleId: resolved.item.dongleId,
          endOldContract: resolved.item.endOldContract,
          startNewContract: resolved.item.startNewContract,
          months: resolved.item.months,
          licenseUserEmail: resolved.item.licenseUserEmail,
          licenseUserName: resolved.item.licenseUserName,
        })
        report.added.push(`SMA on ${resolved.item.dongleId}: ${resolved.articleNames.join(', ')}`)
      }
    } catch (err) {
      report.failed.push({
        what: describe(entry.index),
        problem: err instanceof Error ? err.message : String(err),
      })
    }
  }

  recalculateOrder(order, pdb)
  return report
}

function describe(index: number): string {
  return `item ${index + 1}`
}

/** Copies a string field over only when the block actually carries one. */
function put<T extends object>(target: T, key: keyof T, value: unknown): void {
  if (typeof value === 'string' && value !== '') target[key] = value as T[keyof T]
  else if (typeof value === 'boolean') target[key] = value as T[keyof T]
}

/**
 * Fills the customer, contact and administration fields from the block.
 *
 * Returns a new summary rather than mutating, so the caller decides when the
 * order changes. Absent fields are left as they were: a block that carries
 * only a shipping address must not blank out the billing one.
 */
export function applyOrderBlockFields(order: OrderSummary, plan: OrderBlockPlan): OrderSummary {
  const { block } = plan
  const next: OrderSummary = {
    ...order,
    account: { ...order.account },
    contact: { ...order.contact },
    administration: { ...order.administration },
  }

  put(next, 'orderNumber', block.orderNumber)
  put(next, 'caseId', block.caseId)
  put(next, 'opportunityId', block.opportunityId)
  put(next, 'comments', block.comment)
  put(next, 'priceList', block.priceList)

  for (const [key, value] of Object.entries(block.account ?? {})) {
    if (key in next.account) put(next.account, key as keyof typeof next.account, value)
  }
  for (const [key, value] of Object.entries(block.contact ?? {})) {
    if (key in next.contact) put(next.contact, key as keyof typeof next.contact, value)
  }
  for (const [key, value] of Object.entries(block.administration ?? {})) {
    if (key in next.administration) put(next.administration, key as keyof typeof next.administration, value)
  }

  return next
}

/** Fields the block would change, as `label: from → to`, for the preview. */
export function fieldChanges(order: OrderSummary, plan: OrderBlockPlan): string[] {
  const next = applyOrderBlockFields(order, plan)
  const out: string[] = []
  const compare = (label: string, before: unknown, after: unknown) => {
    if (String(before ?? '') !== String(after ?? '')) {
      out.push(`${label}: ${String(before ?? '') || '(empty)'} → ${String(after ?? '') || '(empty)'}`)
    }
  }
  compare('Order number', order.orderNumber, next.orderNumber)
  compare('Case ID', order.caseId, next.caseId)
  compare('Opportunity', order.opportunityId, next.opportunityId)
  compare('Price list', order.priceList, next.priceList)
  for (const key of Object.keys(next.account) as Array<keyof typeof next.account>) {
    compare(`Account · ${key}`, order.account[key], next.account[key])
  }
  for (const key of Object.keys(next.contact) as Array<keyof typeof next.contact>) {
    compare(`Contact · ${key}`, order.contact[key], next.contact[key])
  }
  for (const key of Object.keys(next.administration) as Array<keyof typeof next.administration>) {
    compare(`Admin · ${key}`, order.administration[key], next.administration[key])
  }
  return out
}
