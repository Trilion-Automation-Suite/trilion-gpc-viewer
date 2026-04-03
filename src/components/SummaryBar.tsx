import type { OrderSummary } from '../types/order.ts'
import { formatPrice, formatPercent, calcEndCustomerPrice } from '../lib/pricing.ts'
import './SummaryBar.css'

interface SummaryBarProps {
  order: OrderSummary
}

export function SummaryBar({ order }: SummaryBarProps) {
  const topLevelItems = order.items.filter((item) => !item.isSub)

  const listPrice = topLevelItems.reduce<number>(
    (acc, item) => acc + (item.totalMsrp ?? 0), 0
  )
  const distributorPrice = topLevelItems.reduce<number>(
    (acc, item) => acc + (item.totalDp ?? 0), 0
  )

  const discount = order.discountForCustomer ?? 0
  const endCustomerPrice = calcEndCustomerPrice(listPrice, discount)
  const margin = listPrice > 0 ? (listPrice - distributorPrice) / listPrice : null

  const currency = order.currency || ''

  return (
    <div className="summary-bar" role="region" aria-label="Price summary">
      <div className="summary-card">
        <span className="summary-card-label">Distributor</span>
        <span className="summary-card-value">
          {distributorPrice > 0 ? formatPrice(distributorPrice) : '—'}
        </span>
        {currency && <span className="summary-card-currency">{currency}</span>}
      </div>

      <div className="summary-card">
        <span className="summary-card-label">List Price</span>
        <span className="summary-card-value">
          {listPrice > 0 ? formatPrice(listPrice) : '—'}
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
          {listPrice > 0 ? formatPrice(endCustomerPrice) : '—'}
        </span>
        {currency && <span className="summary-card-currency">{currency}</span>}
      </div>
    </div>
  )
}
