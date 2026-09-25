import { Fragment, useState } from 'react'
import type { OrderSummary, ConfigItem, SectionDetail, SmaDetails, SmaDependentList } from '../types/order.ts'
import { formatPrice, formatPercent, priceDecimals } from '../lib/pricing.ts'
import { MINIMUM_CONTRACT_MONTHS, monthOf } from '../lib/gpc/contractTerm.ts'
import type { SmaContractEdit } from '../lib/gpc/sma.ts'
import './ConfigItemsTable.css'

interface ConfigItemsTableProps {
  order: OrderSummary
  expanded: Set<string>
  onToggle: (key: string) => void
  isEditing: boolean
  onDelete: (no: string) => void
  onLicenseUserChange: (no: string, patch: { userZeissId?: string; userName?: string }) => void
  /** Agreements `SMA_EXT` offers, for the per-dongle picker. */
  smaCatalog: string[]
  onSmaContractChange: (dongleIndex: number, patch: SmaContractEdit) => void
  onAddSmaExtension: (dongleIndex: number, articleName: string) => void
  onRemoveSmaExtension: (dongleIndex: number, articleName: string) => void
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
  // A line shows these when the catalog asks something about it, not only when
  // an answer is already on file — otherwise a freshly pasted order gives the
  // operator nowhere to type the dongle the part belongs to.
  const asks = item.question1 !== undefined || item.question2 !== undefined
  const answered = item.userZeissId !== undefined || item.userName !== undefined
  if (!asks && !answered) return null

  // The catalog's own wording. Falling back to the licence-user labels, which
  // is what every line used to be labelled with regardless of what it asked.
  const label1 = item.question1 ?? 'ZEISS ID / email'
  const label2 = item.question2 ?? 'User name'
  const showSecond = item.question2 !== undefined || item.userName !== undefined

  return (
    <tr className="user-fields-row">
      <td className="user-fields-indent" />
      <td colSpan={colSpan - 1}>
        {isEditing ? (
          <div className="user-fields-inputs">
            <label className="user-field-label">
              <span className="user-field-question">{label1}</span>
              <input
                className="user-field-input"
                value={item.userZeissId ?? ''}
                onChange={e => onLicenseUserChange(item.no, { userZeissId: e.target.value })}
                aria-label={label1}
              />
            </label>
            {showSecond && (
              <label className="user-field-label">
                <span className="user-field-question">{label2}</span>
                <input
                  className="user-field-input"
                  value={item.userName ?? ''}
                  onChange={e => onLicenseUserChange(item.no, { userName: e.target.value })}
                  aria-label={label2}
                />
              </label>
            )}
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

function fmtDate(iso: string): string {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/**
 * A dongle row and the agreements on it.
 *
 * The dongle row is what GPC draws the group from, so it is what the operator
 * edits: the serial and the term live on it, and every article row underneath
 * is derived. Changing either re-derives them, which is why these controls
 * commit through the document rather than the summary.
 */
function DongleRowEditor({
  dongle,
  index,
  isEditing,
  smaCatalog,
  onContractChange,
  onAddExtension,
}: {
  dongle: SmaDependentList
  index: number
  isEditing: boolean
  smaCatalog: string[]
  onContractChange: (dongleIndex: number, patch: SmaContractEdit) => void
  onAddExtension: (dongleIndex: number, articleName: string) => void
}) {
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')

  const matches = query.trim().length < 2
    ? []
    : smaCatalog.filter(name => name.toLowerCase().includes(query.toLowerCase())).slice(0, 25)

  return (
    <div className="sma-dongle">
      <div className="sma-dongle-head">
        {isEditing ? (
          <>
            <label className="sma-field">
              <span className="sma-info-label">Dongle S/N</span>
              <input
                className="sma-input sma-mono"
                value={dongle.dongleId}
                placeholder="3-7619774"
                onChange={e => onContractChange(index, { dongleId: e.target.value })}
              />
            </label>
            <label className="sma-field">
              <span className="sma-info-label">Current agreement ends after</span>
              <input
                className="sma-input"
                type="month"
                value={monthOf(dongle.endOldContract)}
                onChange={e => e.target.value && onContractChange(index, { endOldContract: `${e.target.value}-01` })}
              />
            </label>
            <label className="sma-field">
              <span className="sma-info-label">New agreement starts</span>
              <input
                className="sma-input"
                type="month"
                value={monthOf(dongle.startNewContract)}
                onChange={e => e.target.value && onContractChange(index, { startNewContract: `${e.target.value}-01` })}
              />
            </label>
            <label className="sma-field">
              <span className="sma-info-label">Term (months)</span>
              <input
                className="sma-input sma-input-sm"
                type="number"
                min={MINIMUM_CONTRACT_MONTHS}
                step={1}
                value={dongle.months}
                onChange={e => {
                  const months = parseInt(e.target.value, 10)
                  if (months >= MINIMUM_CONTRACT_MONTHS) onContractChange(index, { months })
                }}
              />
            </label>
            <div className="sma-field">
              <span className="sma-info-label">Ends</span>
              <span className="sma-info-value">{fmtDate(dongle.endNewContract)}</span>
            </div>
            {dongle.gapMonths > 0 && (
              <div className="sma-field">
                <span className="sma-info-label">Lapsed cover</span>
                <span className="sma-info-value">
                  {dongle.gapMonths} month{dongle.gapMonths === 1 ? '' : 's'}, not charged
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="sma-field">
              <span className="sma-info-label">Dongle S/N</span>
              <span className="sma-info-value sma-mono">{dongle.dongleId || '—'}</span>
            </div>
            <div className="sma-field">
              <span className="sma-info-label">Term</span>
              <span className="sma-info-value">
                {fmtDate(dongle.startNewContract)} &rarr; {fmtDate(dongle.endNewContract)} ({dongle.months} months)
              </span>
            </div>
            {dongle.gapMonths > 0 && (
              <div className="sma-field">
                <span className="sma-info-label">Lapsed cover</span>
                <span className="sma-info-value">{dongle.gapMonths} months, not charged</span>
              </div>
            )}
          </>
        )}
      </div>

      {isEditing && (
        <div className="sma-add">
          {adding ? (
            <>
              <input
                className="sma-input"
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search agreements for this dongle..."
              />
              {matches.length > 0 && (
                <div className="sma-add-results">
                  {matches.map(name => (
                    <div
                      key={name}
                      className="modal-search-row"
                      onClick={() => { onAddExtension(index, name); setAdding(false); setQuery('') }}
                    >
                      <span className="modal-search-name">{name}</span>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" className="sma-btn" onClick={() => { setAdding(false); setQuery('') }}>Cancel</button>
            </>
          ) : (
            <button type="button" className="sma-btn" onClick={() => setAdding(true)}>
              + Agreement on this dongle
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SmaDetailPanel({
  sma,
  dec,
  colSpan,
  isEditing,
  smaCatalog,
  onContractChange,
  onAddExtension,
  onRemoveExtension,
}: {
  sma: SmaDetails
  dec: number
  colSpan: number
  isEditing: boolean
  smaCatalog: string[]
  onContractChange: (dongleIndex: number, patch: SmaContractEdit) => void
  onAddExtension: (dongleIndex: number, articleName: string) => void
  onRemoveExtension: (dongleIndex: number, articleName: string) => void
}) {
  const pricedArticles = sma.softwareArticles.filter(a => a.msrp !== null && a.msrp !== 0)

  /** Which dongle row an article row came from, so Remove addresses the right one. */
  function dongleIndexOf(dongleId: string): number {
    const found = sma.dependentLists.findIndex(d => d.dongleId === dongleId)
    return found < 0 ? 0 : found
  }

  return (
    <tr className="sma-detail-row">
      <td className="sma-detail-indent" />
      <td colSpan={colSpan - 1}>
        <div className="sma-panel">
          <div className="sma-info-grid">
            {sma.email && (
              <div className="sma-info-item">
                <span className="sma-info-label">ZEISS ID / Email</span>
                <span className="sma-info-value">{sma.email}</span>
              </div>
            )}
            {sma.userName && (
              <div className="sma-info-item">
                <span className="sma-info-label">License User</span>
                <span className="sma-info-value">{sma.userName}</span>
              </div>
            )}
          </div>

          {sma.dependentLists.map((dongle, i) => (
            <DongleRowEditor
              key={i}
              dongle={dongle}
              index={i}
              isEditing={isEditing}
              smaCatalog={smaCatalog}
              onContractChange={onContractChange}
              onAddExtension={onAddExtension}
            />
          ))}

          {pricedArticles.length > 0 && (
            <table className="sma-sub-table">
              <thead>
                <tr>
                  <th>Software Article</th>
                  <th>Dongle</th>
                  <th className="right">List Price</th>
                  <th className="right">Distributor</th>
                  <th>Contract End</th>
                  <th>New Start</th>
                  <th>New End</th>
                  {isEditing && <th />}
                </tr>
              </thead>
              <tbody>
                {pricedArticles.map((art, i) => (
                  <tr key={i}>
                    <td>{art.name}</td>
                    <td className="sma-mono">{art.dongleId}</td>
                    <td className="right"><PriceCell value={art.msrp} dec={dec} /></td>
                    <td className="right"><PriceCell value={art.dp} dec={dec} /></td>
                    <td>{fmtDate(art.endOldContract)}</td>
                    <td>{fmtDate(art.startNewContract)}</td>
                    <td>{fmtDate(art.endNewContract)}</td>
                    {isEditing && (
                      <td>
                        <button
                          type="button"
                          className="sma-btn sma-btn-remove"
                          title="Remove this agreement"
                          onClick={() => onRemoveExtension(dongleIndexOf(art.dongleId), art.name)}
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
  smaCatalog,
  onSmaContractChange,
  onAddSmaExtension,
  onRemoveSmaExtension,
}: {
  item: ConfigItem
  expanded: boolean
  onToggle: () => void
  dec: number
  isEditing: boolean
  onDelete: (no: string) => void
  onLicenseUserChange: (no: string, patch: { userZeissId?: string; userName?: string }) => void
  smaCatalog: string[]
  onSmaContractChange: (dongleIndex: number, patch: SmaContractEdit) => void
  onAddSmaExtension: (dongleIndex: number, articleName: string) => void
  onRemoveSmaExtension: (dongleIndex: number, articleName: string) => void
}) {
  const margin = calcMargin(item.totalMsrp, item.totalDp)

  const rowClass = [
    item.isSub ? 'row-sub' : 'row-main',
    item.isHidden ? 'row-hidden' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const hasSma = item.sma !== undefined && (
    item.sma.email || item.sma.userName ||
    item.sma.softwareArticles.length > 0 || item.sma.dependentLists.length > 0
  )
  const hasDetail = item.sections.length > 0 || item.userZeissId !== undefined || item.userName !== undefined || hasSma
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
            {hasSma && <em className="sma-badge">SMA</em>}
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
          {hasSma && (
            <SmaDetailPanel
              sma={item.sma!}
              dec={dec}
              colSpan={colSpan}
              isEditing={isEditing}
              smaCatalog={smaCatalog}
              onContractChange={onSmaContractChange}
              onAddExtension={onAddSmaExtension}
              onRemoveExtension={onRemoveSmaExtension}
            />
          )}
          {item.sections.length > 0 && <SectionRows sections={item.sections} dec={dec} colSpan={colSpan} />}
        </>
      )}
    </>
  )
}

export function ConfigItemsTable({
  order,
  expanded,
  onToggle,
  isEditing,
  onDelete,
  onLicenseUserChange,
  smaCatalog,
  onSmaContractChange,
  onAddSmaExtension,
  onRemoveSmaExtension,
}: ConfigItemsTableProps) {
  const visibleItems = order.items.filter((i) => !i.isHidden)
  const totals = visibleItems.reduce(
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
                smaCatalog={smaCatalog}
                onSmaContractChange={onSmaContractChange}
                onAddSmaExtension={onAddSmaExtension}
                onRemoveSmaExtension={onRemoveSmaExtension}
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

