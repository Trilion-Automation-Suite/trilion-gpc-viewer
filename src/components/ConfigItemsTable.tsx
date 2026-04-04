import { Fragment } from 'react'
import type { OrderSummary, ConfigItem, SectionDetail } from '../types/order.ts'
import { formatPrice, formatPercent, priceDecimals } from '../lib/pricing.ts'
import './ConfigItemsTable.css'

interface ConfigItemsTableProps {
  order: OrderSummary
  expanded: Set<string>
  onToggle: (key: string) => void
  isEditing: boolean
  onDelete: (no: string) => void
  onLicenseUserChange: (no: string, patch: { userZeissId?: string; userName?: string }) => void
}

function calcMargin(msrp: number | null, dp: number | null): number | null {
  if (msrp === null || msrp === 0 || dp === null) return null
  return (msrp - dp) / msrp
}

function PriceCell({ value, dec }: { value: number | null; dec: number }) {
  if (value === null || value === 0) return <span className="price-cell empty">—</span>
  return <span className="price-cell">{formatPrice(value, dec)}</span>
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

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function SectionRows({
  sections,
  dec,
  colSpan,
}: {
  sections: SectionDetail[]
  dec: number
  colSpan: number
}) {
  return (
    <>
      {sections.map((sec, si) => (
        <Fragment key={si}>
          {sec.name && (
            <tr className="row-section-header">
              <td className="detail-section-indent" />
              <td colSpan={colSpan - 1} className="section-header-cell">
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
                <td className="article-sap-cell">
                  {art.sapNr && <span className="article-sap">{art.sapNr}</span>}
                </td>
                <td className="article-detail-name">
                  {art.amount > 1 && (
                    <span className="article-qty">{art.amount}×</span>
                  )}
                  <span className="article-name">{art.name}</span>
                  {art.priceOnRequest && (
                    <span className="price-on-request">on request</span>
                  )}
                </td>
                <td />
                <td className="right"><PriceCell value={lineListPrice} dec={dec} /></td>
                <td className="right"><PriceCell value={lineDistributor} dec={dec} /></td>
                <td className="right"><MarginCell value={lineMargin} /></td>
                {/* empty cell to match delete column */}
                <td />
              </tr>
            )
          })}
          {sec.comments && (
            <tr className="row-section-comment">
              <td className="detail-section-indent" />
              <td colSpan={colSpan - 1}>
                <p className="section-comment">{sec.comments}</p>
              </td>
            </tr>
          )}
        </Fragment>
      ))}
    </>
  )
}

function UserFieldsRow({
  item,
  isEditing,
  onLicenseUserChange,
  colSpan,
}: {
  item: ConfigItem
  isEditing: boolean
  onLicenseUserChange: (no: string, patch: { userZeissId?: string; userName?: string }) => void
  colSpan: number
}) {
  const hasUserFields = item.userZeissId !== undefined || item.userName !== undefined
  if (!hasUserFields) return null

  return (
    <tr className="user-fields-row">
      <td className="user-fields-indent" />
      <td colSpan={colSpan - 1}>
        {isEditing ? (
          <div className="user-fields-inputs">
            <input
              className="user-field-input"
              placeholder="ZEISS ID / email"
              value={item.userZeissId ?? ''}
              onChange={e => onLicenseUserChange(item.no, { userZeissId: e.target.value })}
              aria-label="License user ZEISS ID"
            />
            <input
              className="user-field-input"
              placeholder="User name"
              value={item.userName ?? ''}
              onChange={e => onLicenseUserChange(item.no, { userName: e.target.value })}
              aria-label="License user name"
            />
          </div>
        ) : (
          <span className="user-fields-view">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ marginRight: 5, verticalAlign: 'middle' }}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {item.userName && <span>{item.userName}</span>}
            {item.userName && item.userZeissId && <span className="user-fields-sep"> — </span>}
            {item.userZeissId && <span className="user-fields-zeissid">{item.userZeissId}</span>}
          </span>
        )}
      </td>
    </tr>
  )
}

function ItemRow({
  item,
  expanded,
  onToggle,
  dec,
  isEditing,
  onDelete,
  onLicenseUserChange,
}: {
  item: ConfigItem
  expanded: boolean
  onToggle: () => void
  dec: number
  isEditing: boolean
  onDelete: (no: string) => void
  onLicenseUserChange: (no: string, patch: { userZeissId?: string; userName?: string }) => void
}) {
  const margin = calcMargin(item.totalMsrp, item.totalDp)

  const rowClass = [
    item.isSub ? 'row-sub' : 'row-main',
    item.isHidden ? 'row-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const hasDetail = item.sections.length > 0 || item.userZeissId !== undefined || item.userName !== undefined
  const colSpan = 8  // 7 data cols + 1 delete col

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
        <td className="right"><PriceCell value={item.totalMsrp} dec={dec} /></td>
        <td className="right"><PriceCell value={item.totalDp} dec={dec} /></td>
        <td className="right"><MarginCell value={margin} /></td>
        <td className="item-delete-cell">
          {isEditing && (
            <button
              className="item-delete-btn"
              onClick={(e) => { e.stopPropagation(); onDelete(item.no) }}
              title={`Delete item ${item.no}`}
              aria-label={`Delete item ${item.no}`}
            >
              <TrashIcon />
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <>
          {(item.userZeissId !== undefined || item.userName !== undefined) && (
            <UserFieldsRow item={item} isEditing={isEditing} onLicenseUserChange={onLicenseUserChange} colSpan={colSpan} />
          )}
          {item.sections.length > 0 && <SectionRows sections={item.sections} dec={dec} colSpan={colSpan} />}
        </>
      )}
    </>
  )
}

export function ConfigItemsTable({ order, expanded, onToggle, isEditing, onDelete, onLicenseUserChange }: ConfigItemsTableProps) {
  const topLevelVisible = order.items.filter((i) => !i.isSub && !i.isHidden)
  const totals = topLevelVisible.reduce(
    (acc, item) => ({
      msrp: acc.msrp + (item.totalMsrp ?? 0),
      dp: acc.dp + (item.totalDp ?? 0),
    }),
    { msrp: 0, dp: 0 }
  )
  const totalMargin = calcMargin(totals.msrp, totals.dp)

  const allPrices = order.items.flatMap((i) => [
    i.totalMsrp,
    i.totalDp,
    ...i.sections.flatMap((s) =>
      s.articles.flatMap((a) => [
        a.unitMsrp !== null ? a.unitMsrp * a.amount : null,
        a.unitDp !== null ? a.unitDp * a.amount : null,
      ])
    ),
  ])
  const dec = priceDecimals(allPrices)

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
            <th style={{ width: 32 }} />
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
                dec={dec}
                isEditing={isEditing}
                onDelete={onDelete}
                onLicenseUserChange={onLicenseUserChange}
              />
            )
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="totals-label">Total</td>
            <td className="right">{totals.msrp > 0 ? formatPrice(totals.msrp, dec) : '—'}</td>
            <td className="right">{totals.dp > 0 ? formatPrice(totals.dp, dec) : '—'}</td>
            <td className="right"><MarginCell value={totalMargin} /></td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

