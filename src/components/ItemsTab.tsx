import { useState, useCallback } from 'react'
import type { OrderSummary } from '../types/order.ts'
import type { ArticleCatalogEntry } from '../lib/parseConfig.ts'
import type { LicenseOption } from '../lib/gpc/licenses.ts'
import {
  MINIMUM_CONTRACT_MONTHS,
  endOfMonth,
  lapsedMonths,
  monthOf,
  nextMonthStart,
  termEnd,
} from '../lib/gpc/contractTerm.ts'
import { ConfigItemsTable } from './ConfigItemsTable.tsx'
import './ItemsTab.css'

interface ItemsTabProps {
  order: OrderSummary
  isEditing: boolean
  onDelete: (no: string) => void
  onAddProduct: (fields: AddProductFields) => void
  onAddLicense: (fields: { option: LicenseOption; userZeissId: string; userName: string }) => void
  onLicenseUserChange: (no: string, patch: { userZeissId?: string; userName?: string }) => void
  /** Built on demand — the catalog costs a scan of the whole product database. */
  getArticleCatalog: () => ArticleCatalogEntry[]
  /** Built on demand, like the article catalog: it walks the dependent lists. */
  getLicenseCatalog: () => LicenseOption[]
  /** Agreements `SMA_EXT` offers, for the per-dongle picker. */
  getSmaCatalog: () => string[]
  onSmaContractChange: (dongleIndex: number, patch: { dongleId?: string; endOldContract?: string }) => void
  onAddSmaExtension: (dongleIndex: number, articleName: string) => void
  onRemoveSmaExtension: (dongleIndex: number, articleName: string) => void
}

type ModalType = 'product' | 'license' | null

/**
 * A software maintenance agreement covers a dongle for a term, and neither is
 * in the catalog. Without them GPC shows the line as an empty category, because
 * the licence-model row the agreement hangs from is what carries them.
 */
export interface SmaFields {
  dongleId: string
  /** End of the agreement being replaced. */
  endOldContract: string
  /**
   * When cover resumes. Later than the day after `endOldContract` leaves a
   * deliberate gap, and the lapsed months are not charged for.
   */
  startNewContract: string
  /** Twelve or more. The price scales with the term. */
  months: number
  licenseUserEmail: string
  licenseUserName: string
}

export interface AddProductFields {
  name: string
  amount: number
  unit: string
  unitMsrp: number | null
  unitDp: number | null
  sapNr: string
  category: string
  currency: string
  /** Present only for a software maintenance agreement. */
  sma?: SmaFields
}

/** The current month, as a starting point for when the agreement runs out. */
function defaultContractEndMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function SearchProductModal({
  catalog,
  onAdd,
  onCancel,
}: {
  catalog: ArticleCatalogEntry[]
  onAdd: (fields: AddProductFields) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [amount, setAmount] = useState(1)
  const [selected, setSelected] = useState<ArticleCatalogEntry | null>(null)
  const [dongleId, setDongleId] = useState('')
  // Months, not dates: an agreement runs in whole months, so a day picker
  // would only offer values that have to be snapped away again.
  const [endOldMonth, setEndOldMonth] = useState(defaultContractEndMonth)
  const [startMonth, setStartMonth] = useState('')
  const [months, setMonths] = useState(MINIMUM_CONTRACT_MONTHS)
  const [licenseUserEmail, setLicenseUserEmail] = useState('licensing@trilion.com')
  const [licenseUserName, setLicenseUserName] = useState('Trilion Licensing')


  const filtered = query.trim().length < 2
    ? []
    : catalog.filter(e => e.longName.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 50)

  const candidate = selected ?? (filtered.length === 1 ? filtered[0] : null)
  const needsContract = candidate?.isSoftwareSupport ?? false
  const endOldContract = endOfMonth(`${endOldMonth}-01`)
  const effectiveStart = startMonth ? `${startMonth}-01` : nextMonthStart(endOldContract)
  const gapMonths = lapsedMonths(endOldContract, effectiveStart)

  function handleSelect(entry: ArticleCatalogEntry) {
    setSelected(entry)
    setQuery(entry.longName)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!candidate) return
    onAdd({
      name: candidate.longName,
      amount,
      unit: candidate.unit || 'pcs',
      unitMsrp: candidate.unitMsrp,
      unitDp: candidate.unitDp,
      sapNr: candidate.sapNr,
      category: candidate.category,
      currency: candidate.currency,
      ...(needsContract
        ? {
            sma: {
              dongleId: dongleId.trim(),
              endOldContract,
              startNewContract: effectiveStart,
              months,
              licenseUserEmail,
              licenseUserName,
            },
          }
        : {}),
    })
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="add-item-modal" role="dialog" aria-modal="true" aria-label="Add product">
        <h3 className="modal-title">Add Product</h3>
        <form onSubmit={handleSubmit} className="modal-form">
          <label className="modal-label">
            Search product database
            <input
              className="modal-input"
              autoFocus
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null) }}
              placeholder="Type at least 2 characters..."
            />
          </label>
          {filtered.length > 0 && !selected && (
            <div className="modal-search-results">
              {filtered.map(e => (
                <div key={e.sapNr || e.longName} className="modal-search-row" onClick={() => handleSelect(e)}>
                  <span className="modal-search-name">{e.longName}</span>
                  <span className="modal-search-meta">{e.sapNr && <span className="modal-search-sap">{e.sapNr}</span>}{e.unitMsrp != null && <span className="modal-search-price">MSRP {e.unitMsrp.toLocaleString()}</span>}</span>
                </div>
              ))}
            </div>
          )}
          {selected && (
            <div className="modal-selected">
              <span className="modal-selected-name">{selected.longName}</span>
              {selected.sapNr && <span className="modal-search-sap">{selected.sapNr}</span>}
              {selected.unitMsrp != null && <span className="modal-search-price">MSRP {selected.unitMsrp.toLocaleString()} / DP {selected.unitDp?.toLocaleString()}</span>}
            </div>
          )}
          <label className="modal-label modal-label-sm" style={{ marginTop: 8 }}>
            Qty
            <input className="modal-input" type="number" min={1} step={1} value={amount} onChange={e => setAmount(Math.max(1, parseInt(e.target.value, 10) || 1))} />
          </label>
          {needsContract && (
            <fieldset className="modal-fieldset">
              <legend className="modal-legend">Software Maintenance Agreement</legend>
              <p className="modal-hint">
                The agreement covers one dongle for one year. GPC groups the rows under a
                licence-model row, so the dongle and the term are needed to create the line.
              </p>
              <label className="modal-label modal-label-sm">
                Dongle / sensor serial
                <input
                  className="modal-input"
                  value={dongleId}
                  onChange={e => setDongleId(e.target.value)}
                  placeholder="3-7619774"
                  required
                />
              </label>
              <label className="modal-label modal-label-sm">
                Current agreement ends after
                <input
                  className="modal-input"
                  type="month"
                  value={endOldMonth}
                  onChange={e => { setEndOldMonth(e.target.value); setStartMonth('') }}
                  required
                />
              </label>
              <label className="modal-label modal-label-sm">
                New agreement starts
                <input
                  className="modal-input"
                  type="month"
                  value={monthOf(effectiveStart)}
                  min={monthOf(nextMonthStart(endOldContract))}
                  onChange={e => setStartMonth(e.target.value)}
                />
              </label>
              <label className="modal-label modal-label-sm">
                Term (months)
                <input
                  className="modal-input"
                  type="number"
                  min={MINIMUM_CONTRACT_MONTHS}
                  step={1}
                  value={months}
                  onChange={e => setMonths(Math.max(MINIMUM_CONTRACT_MONTHS, parseInt(e.target.value, 10) || MINIMUM_CONTRACT_MONTHS))}
                />
              </label>
              <p className="modal-hint">
                {effectiveStart} to {termEnd(effectiveStart, months)} &mdash; {months} months.
                {gapMonths > 0 && ` Cover lapses for ${gapMonths} month${gapMonths === 1 ? '' : 's'} after the current agreement, which is not charged for.`}
              </p>
              <label className="modal-label modal-label-sm">
                Licence user e-mail
                <input className="modal-input" type="email" value={licenseUserEmail} onChange={e => setLicenseUserEmail(e.target.value)} />
              </label>
              <label className="modal-label modal-label-sm">
                Licence user name
                <input className="modal-input" value={licenseUserName} onChange={e => setLicenseUserName(e.target.value)} />
              </label>
            </fieldset>
          )}
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>Cancel</button>
            <button
              type="submit"
              className="modal-btn modal-btn-add"
              disabled={!candidate || (needsContract && dongleId.trim() === '')}
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SearchLicenseModal({
  catalog,
  onAdd,
  onCancel,
}: {
  catalog: LicenseOption[]
  onAdd: (fields: { option: LicenseOption; userZeissId: string; userName: string }) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<LicenseOption | null>(null)
  const [userZeissId, setUserZeissId] = useState('licensing@trilion.com')
  const [userName, setUserName] = useState('Trilion Licensing')

  const filtered = query.trim().length < 2
    ? []
    : catalog.filter(e => e.articleName.toLowerCase().includes(query.toLowerCase())).slice(0, 50)

  function handleSelect(entry: LicenseOption) {
    setSelected(entry)
    setQuery(entry.articleName)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const item = selected ?? (filtered.length === 1 ? filtered[0] : null)
    if (!item || !userZeissId.trim() || !userName.trim()) return
    onAdd({ option: item, userZeissId: userZeissId.trim(), userName: userName.trim() })
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="add-item-modal" role="dialog" aria-modal="true" aria-label="Add software license">
        <h3 className="modal-title">Add Software License</h3>
        <form onSubmit={handleSubmit} className="modal-form">
          <label className="modal-label">
            Search license catalog
            <input
              className="modal-input"
              autoFocus
              value={query}
              onChange={e => { setQuery(e.target.value); setSelected(null) }}
              placeholder="Type at least 2 characters..."
            />
          </label>
          {filtered.length > 0 && !selected && (
            <div className="modal-search-results">
              {filtered.map(e => (
                <div key={`${e.itemName}/${e.articleName}`} className="modal-search-row" onClick={() => handleSelect(e)}>
                  <span className="modal-search-name">{e.articleName}</span>
                  <span className="modal-search-meta"><span className="modal-search-sap">{e.itemName}</span></span>
                </div>
              ))}
            </div>
          )}
          {selected && (
            <div className="modal-selected">
              <span className="modal-selected-name">{selected.articleName}</span>
              <span className="modal-search-sap">{selected.itemName} &middot; {selected.sectionName}</span>
            </div>
          )}
          <label className="modal-label" style={{ marginTop: 8 }}>
            User ZEISS ID / email <span className="modal-required">*</span>
            <input className="modal-input" required type="email" value={userZeissId} onChange={e => setUserZeissId(e.target.value)} />
          </label>
          <label className="modal-label">
            User name <span className="modal-required">*</span>
            <input className="modal-input" required value={userName} onChange={e => setUserName(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="modal-btn modal-btn-add" disabled={!selected && filtered.length !== 1}>Add</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function ItemsTab({
  order,
  isEditing,
  onDelete,
  onAddProduct,
  onAddLicense,
  onLicenseUserChange,
  getArticleCatalog,
  getLicenseCatalog,
  getSmaCatalog,
  onSmaContractChange,
  onAddSmaExtension,
  onRemoveSmaExtension,
}: ItemsTabProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [activeModal, setActiveModal] = useState<ModalType>(null)

  const expandableKeys = order.items
    .filter((i) => i.sections.length > 0 || i.userZeissId !== undefined || i.userName !== undefined)
    .map((i) => i.no + '-' + i.name)

  const allExpanded = expandableKeys.length > 0 && expandableKeys.every((k) => expanded.has(k))
  const anyExpanded = expanded.size > 0

  const toggleItem = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }, [])

  function handleAddProduct(fields: AddProductFields) {
    onAddProduct(fields)
    setActiveModal(null)
  }

  function handleAddLicense(fields: { option: LicenseOption; userZeissId: string; userName: string }) {
    onAddLicense(fields)
    setActiveModal(null)
  }

  return (
    <div className="items-tab">
      <div className="items-toolbar">
        <button
          className="toolbar-pill-btn icon-only"
          onClick={() => setExpanded(new Set(expandableKeys))}
          disabled={allExpanded || expandableKeys.length === 0}
          title="Expand all"
          aria-label="Expand all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
            <polyline points="6 15 12 21 18 15" />
          </svg>
        </button>
        <button
          className="toolbar-pill-btn icon-only"
          onClick={() => setExpanded(new Set())}
          disabled={!anyExpanded}
          title="Collapse all"
          aria-label="Collapse all"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 15 12 9 18 15" />
            <polyline points="6 9 12 3 18 9" />
          </svg>
        </button>
        {isEditing && (
          <>
            <button
              className="toolbar-pill-btn toolbar-add-btn"
              onClick={() => setActiveModal('product')}
              title="Add simple product"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Product
            </button>
            <button
              className="toolbar-pill-btn toolbar-add-btn"
              onClick={() => setActiveModal('license')}
              title="Add software license"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              License
            </button>
          </>
        )}
      </div>
      <ConfigItemsTable
        order={order}
        expanded={expanded}
        onToggle={toggleItem}
        isEditing={isEditing}
        onDelete={onDelete}
        onLicenseUserChange={onLicenseUserChange}
        smaCatalog={getSmaCatalog()}
        onSmaContractChange={onSmaContractChange}
        onAddSmaExtension={onAddSmaExtension}
        onRemoveSmaExtension={onRemoveSmaExtension}
      />
      {activeModal === 'product' && (
        <SearchProductModal catalog={getArticleCatalog()} onAdd={handleAddProduct} onCancel={() => setActiveModal(null)} />
      )}
      {activeModal === 'license' && (
        <SearchLicenseModal catalog={getLicenseCatalog()} onAdd={handleAddLicense} onCancel={() => setActiveModal(null)} />
      )}
    </div>
  )
}
