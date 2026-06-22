/**
 * Build the EUC cross-check reference from the open GPC order, so the value
 * and address checks run automatically without manual entry.
 */
import type { OrderSummary } from '../../types/order.ts'
import type { EucReference } from './eucEngine.ts'

export interface DerivedInfo {
  consigneeCompany: string
  endUserCompany: string
  currency: string
  systemValueOrderCurrency: number | null
  fxFactorToEur: number | null
  suggestedEur: number | null
  systemItemLabel: string
}

const SYSTEM_DESCRIPTION = 'Complete ARAMIS system with all accessories'

/** Convert an amount in the order currency to EUR using the PDB currency rates. */
function fxToEur(currency: string, rates: Record<string, number>): number | null {
  if (!currency || currency.toUpperCase() === 'EUR') return 1
  const from = rates[currency] ?? rates[currency.toUpperCase()]
  const eur = rates['EUR'] ?? 1
  if (!from) return null
  return eur / from
}

/** Find the ARAMIS system line item and return its end-customer price + label. */
function findSystemValue(order: OrderSummary): { value: number | null; label: string } {
  const discount = order.discountForCustomer ?? 0
  const isAramis = (i: OrderSummary['items'][number]) =>
    /aramis/i.test(`${i.name} ${i.systemType} ${i.category}`)

  const sys = order.items.find((i) => !i.isSub && isAramis(i))
  if (sys && sys.totalMsrp != null) {
    const d = sys.discountOverride ?? discount
    return { value: sys.totalMsrp * (1 - d), label: sys.name || sys.label }
  }
  // Fallback: whole-order end-customer price
  const list = order.items.reduce((acc, i) => acc + (i.totalMsrp ?? 0), 0)
  if (list > 0) return { value: list * (1 - discount), label: 'Order total (no ARAMIS item identified)' }
  return { value: null, label: 'n/a' }
}

export function deriveReference(
  order: OrderSummary,
  currencyRates: Record<string, number>
): { reference: EucReference; info: DerivedInfo } {
  const admin = order.administration
  const account = order.account

  const consigneeCompany = admin.shippingCompanyName || account.companyName || ''
  const endUserCompany = account.companyName || admin.shippingCompanyName || ''
  const destinationCountry = account.country || admin.shippingCountry || ''

  const currency = order.currency || ''
  const { value: systemValue, label: systemItemLabel } = findSystemValue(order)
  const fxFactorToEur = fxToEur(currency, currencyRates)
  const suggestedEur =
    systemValue != null && fxFactorToEur != null
      ? Math.round((systemValue * fxFactorToEur) / 1000) * 1000
      : null

  const reference: EucReference = {
    expected: { destinationCountry, itemDescription: SYSTEM_DESCRIPTION },
    order: { consigneeCompany, endUserCompany, systemValue },
    fx: { orderToEur: fxFactorToEur ?? undefined },
  }

  const info: DerivedInfo = {
    consigneeCompany,
    endUserCompany,
    currency,
    systemValueOrderCurrency: systemValue,
    fxFactorToEur,
    suggestedEur,
    systemItemLabel,
  }
  return { reference, info }
}
