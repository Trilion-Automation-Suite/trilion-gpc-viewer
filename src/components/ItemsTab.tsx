import { useState, useCallback } from 'react'
import type { OrderSummary } from '../types/order.ts'
import type { ArticleCatalogEntry } from '../lib/parseConfig.ts'
import type { LicenseCatalogEntry } from '../lib/parseLicenseCatalog.ts'
import { ConfigItemsTable } from './ConfigItemsTable.tsx'
import './ItemsTab.css'

interface ItemsTabProps {
  order: OrderSummary
  isEditing: boolean
  onDelete: (no: string) => void
  onAddProduct: (fields: { name: string; amount: number; unit: string; unitMsrp: number | null; unitDp: number | null; sapNr: string; category: string; currency: string }) => void
  onAddLicense: (fields: { name: string; sapNr: string; userZeissId: string; userName: string }) => void
  onLicenseUserChange: (no: string, patch: { userZeissId?: string; userName?: string }) => void
  articleCatalog: ArticleCatalogEntry[]
  licenseCatalog: LicenseCatalogEntry[]
}

type ModalType = 'product' | 'license' | null

function SearchProductModal({
  catalog,
  onAdd,
  onCancel,
}: {
  catalog: ArticleCatalogEntry[]
  onAdd: (fields: { name: string; amount: number; unit: string; unitMsrp: number | null; unitDp: number | null; sapNr: string; category: string; currency: string }) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [amount, setAmount] = useState(1)
  const [selected, setSelected] = useState<ArticleCatalogEntry | null>(null)

  const filtered = query.trim().length < 2
    ? []
    : catalog.filter(e => e.longName.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 50)

  function handleSelect(entry: ArticleCatalogEntry) {
    setSelected(entry)
    setQuery(entry.longName)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const item = selected ?? (filtered.length === 1 ? filtered[0] : null)
    if (!item) return
    onAdd({ name: item.longName, amount, unit: item.unit || 'pcs', unitMsrp: item.unitMsrp, unitDp: item.unitDp, sapNr: item.sapNr, category: item.category, currency: item.currency })
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
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>Cancel</button>
            <button type="submit" className="modal-btn modal-btn-add" disabled={!selected && filtered.length !== 1}>Add</button>
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
  catalog: LicenseCatalogEntry[]
  onAdd: (fields: { name: string; sapNr: string; userZeissId: string; userName: string }) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<LicenseCatalogEntry | null>(null)
  const [userZeissId, setUserZeissId] = useState('licensing@trilion.com')
  const [userName, setUserName] = useState('Trilion Licensing')

  const filtered = query.trim().length < 2
    ? []
    : catalog.filter(e => e.name.toLowerCase().includes(query.toLowerCase())).slice(0, 50)

  function handleSelect(entry: LicenseCatalogEntry) {
    setSelected(entry)
    setQuery(entry.name)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const item = selected ?? (filtered.length === 1 ? filtered[0] : null)
    if (!item || !userZeissId.trim() || !userName.trim()) return
    onAdd({ name: item.name, sapNr: item.sapNr, userZeissId: userZeissId.trim(), userName: userName.trim() })
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
                <div key={e.sapNr || e.name} className="modal-search-row" onClick={() => handleSelect(e)}>
                  <span className="modal-search-name">{e.name}</span>
                  {e.subCategory && <span className="modal-search-meta"><span className="modal-search-sap">{e.subCategory}</span></span>}
                </div>
              ))}
            </div>
          )}
          {selected && (
            <div className="modal-selected">
              <span className="modal-selected-name">{selected.name}</span>
              {selected.sapNr && <span className="modal-search-sap">{selected.sapNr}</span>}
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
  articleCatalog,
  licenseCatalog,
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

  function handleAddProduct(fields: { name: string; amount: number; unit: string; unitMsrp: number | null; unitDp: number | null; sapNr: string; category: string; currency: string }) {
    onAddProduct(fields)
    setActiveModal(null)
  }

  function handleAddLicense(fields: { name: string; sapNr: string; userZeissId: string; userName: string }) {
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
      />
      {activeModal === 'product' && (
        <SearchProductModal catalog={articleCatalog} onAdd={handleAddProduct} onCancel={() => setActiveModal(null)} />
      )}
      {activeModal === 'license' && (
        <SearchLicenseModal catalog={licenseCatalog} onAdd={handleAddLicense} onCancel={() => setActiveModal(null)} />
      )}
    </div>
  )
}
