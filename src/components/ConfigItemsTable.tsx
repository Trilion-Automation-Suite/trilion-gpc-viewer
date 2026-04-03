import { useState, Fragment } from 'react'
import type { OrderSummary, ConfigItem, SectionDetail } from '../types/order.ts'
import { formatPrice, formatPercent, calcEndCustomerPrice } from '../lib/pricing.ts'
import './ConfigItemsTable.css'

interface ConfigItemsTableProps {
  order: OrderSummary
}

function PriceCell({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="price-cell empty">—</span>
  return <span className="price-cell">{formatPrice(value)}</span>
}

function DiscountCell({ value }: { value: number | null }) {
  if (value === null) return <span className="price-cell empty">—</span>
  return <span className="price-cell">{formatPercent(value)}</span>
}

function SectionRows({ sections, discount }: { sections: SectionDetail[]; discount: number }) {
  return (
    <>
      {sections.map((sec, si) => (
        <Fragment key={si}>
          {/* Section header row */}
          <tr className="row-section-header">
            <td className="detail-section-indent" />
            <td colSpan={7} className="section-header-cell">
              <span className="section-label">{sec.name}</span>
            </td>
          </tr>
          {/* One row per article */}
          {sec.articles.map((art, ai) => {
            const lineListPrice = art.unitMsrp !== null ? art.unitMsrp * art.amount : null
            const lineEndCustomer =
              lineListPrice !== null ? calcEndCustomerPrice(lineListPrice, discount) : null
            const lineDistributor = art.unitDp !== null ? art.unitDp * art.amount : null
            return (
              <tr key={`sa-${si}-${ai}`} className="row-article-detail">
                <td className="detail-section-indent" />
                <td />
                <td colSpan={2} className="article-detail-name">
                  {art.amount > 1 && (
                    <span className="article-qty">{art.amount}×</span>
                  )}
                  <span className="article-name">{art.name}</span>
                  {art.priceOnRequest && (
                    <span className="price-on-request">on request</span>
                  )}
                </td>
                <td className="right"><PriceCell value={lineListPrice} /></td>
                <td className="right"><PriceCell value={lineEndCustomer} /></td>
                <td className="right">
                  <span className="price-cell empty">—</span>
                </td>
                <td className="right"><PriceCell value={lineDistributor} /></td>
              </tr>
            )
          })}
          {sec.comments && (
            <tr className="row-section-comment">
              <td className="detail-section-indent" />
              <td colSpan={7}>
                <p className="section-comment">{sec.comments}</p>
              </td>
            </tr>
          )}
        </Fragment>
      ))}
    </>
  )
}

function ItemRow({
  item,
  orderDiscount,
  expanded,
  onToggle,
}: {
  item: ConfigItem
  orderDiscount: number
  expanded: boolean
  onToggle: () => void
}) {
  const effectiveDiscount =
    item.discountOverride !== null ? item.discountOverride : orderDiscount

  const endCustomer =
    item.totalMsrp !== null
      ? calcEndCustomerPrice(item.totalMsrp, effectiveDiscount)
      : null

  const rowClass = [
    item.isSub ? 'row-sub' : 'row-main',
    item.isHidden ? 'row-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const hasDetail = item.sections.length > 0
  const displayDiscount = item.discountOverride !== null ? item.discountOverride : null

  return (
    <>
      <tr
        className={rowClass + (hasDetail ? ' row-expandable' : '')}
        onClick={hasDetail ? onToggle : undefined}
        aria-expanded={hasDetail ? expanded : undefined}
      >
        <td className="item-no">
          {hasDetail && (
            <span className="expand-toggle" aria-hidden="true">
              {expanded ? '▾' : '▸'}
            </span>
          )}
          {item.no}
        </td>
        <td className="item-category" title={item.category}>
          {item.category || '—'}
        </td>
        <td>
          <span className="item-name">
            {item.name || item.label}
            {item.isHidden && <em className="hidden-badge">hidden</em>}
          </span>
        </td>
        <td className="item-system-type" title={item.systemType}>
          {item.systemType || '—'}
        </td>
        <td className="right"><PriceCell value={item.totalMsrp} /></td>
        <td className="right"><PriceCell value={endCustomer} /></td>
        <td className="right"><DiscountCell value={displayDiscount} /></td>
        <td className="right"><PriceCell value={item.totalDp} /></td>
      </tr>
      {expanded && hasDetail && <SectionRows sections={item.sections} discount={effectiveDiscount} />}
    </>
  )
}

export function ConfigItemsTable({ order }: ConfigItemsTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const orderDiscount = order.discountForCustomer ?? 0

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const topLevelVisible = order.items.filter((i) => !i.isSub && !i.isHidden)
  const totals = topLevelVisible.reduce(
    (acc, item) => {
      const msrp = item.totalMsrp ?? 0
      const disc = item.discountOverride !== null ? item.discountOverride : orderDiscount
      return {
        msrp: acc.msrp + msrp,
        endCustomer: acc.endCustomer + calcEndCustomerPrice(msrp, disc),
        dp: acc.dp + (item.totalDp ?? 0),
      }
    },
    { msrp: 0, endCustomer: 0, dp: 0 }
  )

  return (
    <div className="config-table-wrapper">
      <table className="config-table" aria-label="Configuration items">
        <thead>
          <tr>
            <th>Item #</th>
            <th>Category</th>
            <th>Configuration Item</th>
            <th>System Type</th>
            <th className="right">List Price</th>
            <th className="right">End Customer</th>
            <th className="right">Discount</th>
            <th className="right">Distributor</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item: ConfigItem) => {
            const key = item.no + '-' + item.name
            return (
              <ItemRow
                key={key}
                item={item}
                orderDiscount={orderDiscount}
                expanded={expanded.has(key)}
                onToggle={() => toggle(key)}
              />
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="totals-label">Totals (top-level, visible)</td>
            <td className="right">{totals.msrp > 0 ? formatPrice(totals.msrp) : '—'}</td>
            <td className="right">{totals.endCustomer > 0 ? formatPrice(totals.endCustomer) : '—'}</td>
            <td className="right"><DiscountCell value={orderDiscount > 0 ? orderDiscount : null} /></td>
            <td className="right">{totals.dp > 0 ? formatPrice(totals.dp) : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
