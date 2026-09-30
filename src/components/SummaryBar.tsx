import type { OrderSummary, SmaDetails } from '../types/order.ts'
import { itemTotals } from '../lib/gpc/reentry.ts'
import type { UpgradeLine } from '../lib/gpc/reentry.ts'
import { formatPrice, formatPercent, calcEndCustomerPrice, priceDecimals } from '../lib/pricing.ts'
import './SummaryBar.css'

interface SummaryBarProps {
  order: OrderSummary
  /** The lapsed-cover upgrades, which the stored totals leave out. */
  getUpgrades: (sma: SmaDetails) => UpgradeLine[]
}

export function SummaryBar({ order, getUpgrades }: SummaryBarProps) {
  const totals = order.items.map((item) => itemTotals(item, getUpgrades))
  const listPrice = totals.reduce<number>((acc, t) => acc + (t.msrp ?? 0), 0)
  const distributorPrice = totals.reduce<number>((acc, t) => acc + (t.dp ?? 0), 0)

  const discount = order.discountForCustomer ?? 0
  const endCustomerPrice = calcEndCustomerPrice(listPrice, discount)
  const margin = listPrice > 0 ? (listPrice - distributorPrice) / listPrice : null
  const dec = priceDecimals([listPrice, distributorPrice, endCustomerPrice])

  const currency = order.currency || ''

  return (
    <div className="summary-bar" role="region" aria-label="Price summary">
      <div className="summary-card">
        <span className="summary-card-label">Distributor</span>
        <span className="summary-card-value">
          {distributorPrice > 0 ? formatPrice(distributorPrice, dec) : '—'}
        </span>
        {currency && <span className="summary-card-currency">{currency}</span>}
      </div>

      <div className="summary-card">
        <span className="summary-card-label">List Price</span>
        <span className="summary-card-value">
          {listPrice > 0 ? formatPrice(listPrice, dec) : '—'}
        </span>
        {currency && <span className="summary-card-currency">{currency}</span>}
      </div>

      <div className="summary-card">
        <span className="summary-card-label">Margin</span>
        <span className="summary-card-value accent">
          {margin !== null ? formatPercent(margin) : '—'}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-card-label">Discount</span>
        <span className={`summary-card-value${discount === 0 ? ' muted' : ''}`}>
          {discount > 0 ? formatPercent(order.discountForCustomer) : '—'}
        </span>
      </div>

      <div className="summary-card">
        <span className="summary-card-label">End Customer</span>
        <span className="summary-card-value">
          {listPrice > 0 ? formatPrice(endCustomerPrice, dec) : '—'}
        </span>
        {currency && <span className="summary-card-currency">{currency}</span>}
      </div>
    </div>
  )
}
