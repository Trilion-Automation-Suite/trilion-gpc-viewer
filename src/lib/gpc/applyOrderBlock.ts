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
import { addLicense } from './licenses.ts'
import { addSmaExtension } from './sma.ts'
import type { OrderBlockPlan } from './orderBlock.ts'

/** What went in, and what would not. */
export interface ApplyReport {
  added: string[]
  failed: Array<{ what: string; problem: string }>
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
  const report: ApplyReport = { added: [], failed: [] }

  for (const entry of plan.items) {
    const resolved = entry.resolved
    if (!resolved) {
      report.failed.push({ what: describe(entry.index), problem: entry.problem ?? 'unresolved' })
      continue
    }
    try {
      if (resolved.kind === 'article') {
        addCatalogArticle(order, pdb, resolved.articleName, { amount: resolved.amount })
        report.added.push(`${resolved.amount} × ${resolved.articleName}`)
      } else if (resolved.kind === 'license') {
        addLicense(order, pdb, resolved.option, {
          userZeissId: resolved.userEmail,
          userName: resolved.userName,
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
