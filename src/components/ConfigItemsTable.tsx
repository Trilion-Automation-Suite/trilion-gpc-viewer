import { Fragment } from 'react'
import type { OrderSummary, ConfigItem, SectionDetail } from '../types/order.ts'
import { formatPrice, formatPercent } from '../lib/pricing.ts'
import './ConfigItemsTable.css'

interface ConfigItemsTableProps {
  order: OrderSummary
  expanded: Set<string>
  onToggle: (key: string) => void
}

function calcMargin(msrp: number | null, dp: number | null): number | null {
  if (msrp === null || msrp === 0 || dp === null) return null
  return (msrp - dp) / msrp
}

function PriceCell({ value }: { value: number | null }) {
  if (value === null || value === 0) return <span className="price-cell empty">—</span>
  return <span className="price-cell">{formatPrice(value)}</span>
}

function MarginCell({ value }: { value: number | null }) {
  if (value === null) return <span className="price-cell empty">—</span>
  return <span className="price-cell margin-value">{formatPercent(value)}</span>
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className="expand-chevron"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  )
}

function SectionRows({ sections }: { sections: SectionDetail[] }) {
  return (
    <>
      {sections.map((sec, si) => (
        <Fragment key={si}>
          {sec.name && (
            <tr className="row-section-header">
              <td className="detail-section-indent" />
              <td colSpan={6} className="section-header-cell">
                <span className="section-label">{sec.name}</span>
              </td>
            </tr>
          )}
          {sec.articles.map((art, ai) => {
            const lineListPrice = art.unitMsrp !== null ? art.unitMsrp * art.amount : null
            const lineDistributor = art.unitDp !== null ? art.unitDp * art.amount : null
            const lineMargin = calcMargin(lineListPrice, lineDistributor)
            return (
              <tr key={`sa-${si}-${ai}`} className="row-article-detail">
                <td className="detail-section-indent" />
                <td />
                <td colSpan={2} className="article-detail-name">
                  {art.sapNr && <span className="article-sap">{art.sapNr}</span>}
                  {art.amount > 1 && (
                    <span className="article-qty">{art.amount}×</span>
                  )}
                  <span className="article-name">{art.name}</span>
                  {art.priceOnRequest && (
                    <span className="price-on-request">on request</span>
                  )}
                </td>
                <td className="right"><PriceCell value={lineListPrice} /></td>
                <td className="right"><PriceCell value={lineDistributor} /></td>
                <td className="right"><MarginCell value={lineMargin} /></td>
              </tr>
            )
          })}
          {sec.comments && (
            <tr className="row-section-comment">
              <td className="detail-section-indent" />
              <td colSpan={6}>
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
  expanded,
  onToggle,
}: {
  item: ConfigItem
  expanded: boolean
  onToggle: () => void
}) {
  const margin = calcMargin(item.totalMsrp, item.totalDp)

  const rowClass = [
    item.isSub ? 'row-sub' : 'row-main',
    item.isHidden ? 'row-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const hasDetail = item.sections.length > 0

  return (
    <>
      <tr
        className={rowClass + (hasDetail ? ' row-expandable' : '')}
        onClick={hasDetail ? onToggle : undefined}
        aria-expanded={hasDetail ? expanded : undefined}
      >
        <td className="item-no">
          {hasDetail && <ExpandIcon expanded={expanded} />}
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
        <td className="right"><PriceCell value={item.totalDp} /></td>
        <td className="right"><MarginCell value={margin} /></td>
      </tr>
      {expanded && hasDetail && <SectionRows sections={item.sections} />}
    </>
  )
}

export function ConfigItemsTable({ order, expanded, onToggle }: ConfigItemsTableProps) {
  const topLevelVisible = order.items.filter((i) => !i.isSub && !i.isHidden)
  const totals = topLevelVisible.reduce(
    (acc, item) => ({
      msrp: acc.msrp + (item.totalMsrp ?? 0),
      dp: acc.dp + (item.totalDp ?? 0),
    }),
    { msrp: 0, dp: 0 }
  )
  const totalMargin = calcMargin(totals.msrp, totals.dp)

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
            <th className="right">Distributor</th>
            <th className="right">Margin</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item: ConfigItem) => {
            const key = item.no + '-' + item.name
            return (
              <ItemRow
                key={key}
                item={item}
                expanded={expanded.has(key)}
                onToggle={() => onToggle(key)}
              />
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="totals-label">Total</td>
            <td className="right">{totals.msrp > 0 ? formatPrice(totals.msrp) : '—'}</td>
            <td className="right">{totals.dp > 0 ? formatPrice(totals.dp) : '—'}</td>
            <td className="right"><MarginCell value={totalMargin} /></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
