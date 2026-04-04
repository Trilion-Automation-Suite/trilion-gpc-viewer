declare const __APP_VERSION__: string

import { useState, useCallback, useEffect, useRef } from 'react'
import type { AccountDetails, ConfigItem, OrderAdministration, OrderSummary, ParseResult, TechnicalContact } from './types/order.ts'
import { loadGpcFile, createNewOrder } from './lib/index.ts'
import { loadPdbFile } from './lib/loadPdbFile.ts'
import { loadPdbCache } from './lib/pdbCache.ts'
import { saveGpcFile } from './lib/saveGpcFile.ts'
import { FilePicker } from './components/FilePicker.tsx'
import { SummaryBar } from './components/SummaryBar.tsx'
import { ErrorBanner } from './components/ErrorBanner.tsx'
import { OrderStrip } from './components/OrderStrip.tsx'
import { ItemsTab } from './components/ItemsTab.tsx'
import { AccountTab } from './components/AccountTab.tsx'
import { ContactTab } from './components/ContactTab.tsx'
import { AdminTab } from './components/AdminTab.tsx'
import { CommentsTab } from './components/CommentsTab.tsx'
import { SaveBar } from './components/SaveBar.tsx'
import { InstallBanner } from './components/InstallBanner.tsx'
import './App.css'

function nextItemNo(items: ConfigItem[]): string {
  const topLevel = items.filter(i => !i.isSub).map(i => parseInt(i.no, 10)).filter(n => !isNaN(n))
  return String(topLevel.length > 0 ? Math.max(...topLevel) + 1 : 1)
}

type Tab = 'items' | 'account' | 'contact' | 'admin' | 'comments'
const TAB_LABELS: Record<Tab, string> = {
  items: 'Items',
  account: 'Account Details',
  contact: 'Technical Contact',
  admin: 'Administration Information',
  comments: 'Comments',
}

type AppState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; result: ParseResult }
  | { status: 'error'; message: string }

export function App() {
  const [state, setState] = useState<AppState>({ status: 'idle' })
  const [darkMode, setDarkMode] = useState(false)
  const [tab, setTab] = useState<Tab>('items')
  const [pdbCached, setPdbCached] = useState<boolean | null>(null)  // null = not checked yet

  // Mutable order copy — this is what the tab components read/write in edit mode
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | undefined>(undefined)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    loadPdbCache().then(cached => setPdbCached(cached !== null)).catch(() => setPdbCached(false))
  }, [])

  // Sync mutable order copy whenever a new file is loaded
  useEffect(() => {
    if (state.status === 'loaded') {
      setOrder(state.result.order)
      setIsEditing(state.result.openInEditMode ?? false)
      setIsDirty(false)
      setFileHandle(state.result.fileHandle)
    } else {
      setOrder(null)
      setIsEditing(false)
      setIsDirty(false)
      setFileHandle(undefined)
    }
  }, [state])

  const handlePdbFile = useCallback(async (file: File) => {
    setState({ status: 'loading' })
    try {
      const pdb = await loadPdbFile(file)
      setPdbCached(true)
      const result = await createNewOrder(pdb)
      setState({ status: 'loaded', result })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  const handleFile = useCallback(async (file: File, handle?: FileSystemFileHandle) => {
    if (file.name.endsWith('.gproducts')) {
      await handlePdbFile(file)
      return
    }
    setState({ status: 'loading' })
    try {
      const result = await loadGpcFile(file, handle)
      setState({ status: 'loaded', result })
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'An unknown error occurred while reading the file.'
      setState({ status: 'error', message })
    }
  }, [handlePdbFile])

  const handleRetry = useCallback(() => {
    setState({ status: 'idle' })
  }, [])

  const handleNewOrder = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const cached = await loadPdbCache()
      const result = await createNewOrder(cached)
      setState({ status: 'loaded', result })
    } catch (err) {
      setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [])

  // Clipboard paste — fires when the user copies a file in Explorer/Outlook and presses Ctrl+V
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const file = e.clipboardData?.files[0]
      if (file) handleFile(file)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handleFile])

  // ---------------------------------------------------------------------------
  // Edit mode handlers
  // ---------------------------------------------------------------------------

  const handleEditToggle = useCallback(() => {
    setIsEditing((v) => !v)
  }, [])

  const handleHeaderChange = useCallback(
    (patch: Pick<OrderSummary, 'orderNumber' | 'caseId' | 'opportunityId'>) => {
      setOrder((prev) => (prev ? { ...prev, ...patch } : null))
      setIsDirty(true)
    },
    []
  )

  const handleAccountChange = useCallback((patch: Partial<AccountDetails>) => {
    setOrder((prev) => (prev ? { ...prev, account: { ...prev.account, ...patch } } : null))
    setIsDirty(true)
  }, [])

  const handleContactChange = useCallback((patch: Partial<TechnicalContact>) => {
    setOrder((prev) => (prev ? { ...prev, contact: { ...prev.contact, ...patch } } : null))
    setIsDirty(true)
  }, [])

  const handleAdminChange = useCallback((patch: Partial<OrderAdministration>) => {
    setOrder((prev) =>
      prev ? { ...prev, administration: { ...prev.administration, ...patch } } : null
    )
    setIsDirty(true)
  }, [])

  const handleItemDelete = useCallback((no: string) => {
    setOrder(prev => prev ? { ...prev, items: prev.items.filter(i => i.no !== no) } : null)
    setIsDirty(true)
  }, [])

  const handleAddProduct = useCallback((fields: { name: string; amount: number; unit: string; unitMsrp: number | null; unitDp: number | null; sapNr: string; category: string }) => {
    setOrder(prev => {
      if (!prev) return null
      const no = nextItemNo(prev.items)
      const newItem: ConfigItem = {
        no,
        label: `Configuration item ${no}`,
        category: fields.category,
        name: fields.name,
        systemType: '',
        totalMsrp: null,
        totalDp: null,
        discountOverride: null,
        isHidden: false,
        isSub: false,
        itemType: 'free',
        isNew: true,
        sections: [{ name: '', articles: [{ name: fields.name, amount: fields.amount, unit: fields.unit || 'pcs', priceOnRequest: false, unitMsrp: fields.unitMsrp, unitDp: fields.unitDp, sapNr: fields.sapNr }], comments: '' }],
      }
      return { ...prev, items: [...prev.items, newItem] }
    })
    setIsDirty(true)
  }, [])

  const handleAddLicense = useCallback((fields: { name: string; sapNr: string; userZeissId: string; userName: string }) => {
    setOrder(prev => {
      if (!prev) return null
      const licenseNo = nextItemNo(prev.items)
      const smaNo = `${licenseNo}.1`
      const licenseItem: ConfigItem = {
        no: licenseNo,
        label: `Configuration item ${licenseNo}`,
        category: 'Software License',
        name: fields.name,
        systemType: '',
        totalMsrp: null,
        totalDp: null,
        discountOverride: null,
        isHidden: false,
        isSub: false,
        itemType: 'dependent',
        isNew: true,
        sections: [],
      }
      const smaItem: ConfigItem = {
        no: smaNo,
        label: `SMA for ${fields.name}`,
        category: 'Software License',
        name: 'SMA',
        systemType: '',
        totalMsrp: null,
        totalDp: null,
        discountOverride: null,
        isHidden: false,
        isSub: true,
        itemType: 'sub',
        isNew: true,
        sections: [],
        userZeissId: fields.userZeissId,
        userName: fields.userName,
      }
      return { ...prev, items: [...prev.items, licenseItem, smaItem] }
    })
    setIsDirty(true)
  }, [])

  const handleLicenseUserChange = useCallback((no: string, patch: { userZeissId?: string; userName?: string }) => {
    setOrder(prev => prev ? { ...prev, items: prev.items.map(i => i.no === no ? { ...i, ...patch } : i) } : null)
    setIsDirty(true)
  }, [])

  const handleDiscard = useCallback(() => {
    if (state.status === 'loaded') {
      setOrder(state.result.order)
      setIsDirty(false)
    }
  }, [state])

  const handleSave = useCallback(async () => {
    if (state.status !== 'loaded' || !order) return
    setIsSaving(true)
    try {
      await saveGpcFile(
        state.result.rawDecryptedBuffer,
        state.result.rawOrderXml,
        order,
        state.result.sourceFile,
        fileHandle,
        state.result.originalItemNos
      )
      setIsDirty(false)
    } catch (err) {
      alert(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsSaving(false)
    }
  }, [state, order, fileHandle])

  // File Handling API — fires when the PWA is launched by opening a file
  // (e.g. double-clicking a .gconfiguration attachment in Outlook or Finder).
  // Works in installed PWAs on Chrome/Edge. Silently no-ops elsewhere.
  useEffect(() => {
    if (!('launchQueue' in window)) return
    ;(window as unknown as { launchQueue: { setConsumer: (fn: (p: { files: FileSystemFileHandle[] }) => void) => void } })
      .launchQueue.setConsumer(async (launchParams) => {
        if (launchParams.files.length === 0) return
        try {
          const file = await launchParams.files[0].getFile()
          handleFile(file, launchParams.files[0])
        } catch {
          // launchQueue errors are non-fatal — user can still drag/drop
        }
      })
  }, [handleFile])

  // ---------------------------------------------------------------------------
  // Cmd+K search palette
  // ---------------------------------------------------------------------------
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchActiveIdx, setSearchActiveIdx] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Build search index from current order data
  const searchItems = (() => {
    if (!order) return []
    const items: { type: string; text: string; sub?: string; action: () => void }[] = []
    // Tabs
    ;(Object.keys(TAB_LABELS) as Tab[]).forEach((t) => {
      items.push({ type: 'tab', text: TAB_LABELS[t], action: () => { setTab(t); setSearchOpen(false) } })
    })
    // Order fields
    if (order.orderNumber) items.push({ type: 'field', text: `Order: ${order.orderNumber}`, action: () => { setTab('items'); setSearchOpen(false) } })
    if (order.caseId) items.push({ type: 'field', text: `Case: ${order.caseId}`, action: () => { setTab('items'); setSearchOpen(false) } })
    if (order.opportunityId) items.push({ type: 'field', text: `Opportunity: ${order.opportunityId}`, action: () => { setTab('items'); setSearchOpen(false) } })
    // Account
    if (order.account?.companyName) items.push({ type: 'account', text: order.account.companyName, sub: 'Account name', action: () => { setTab('account'); setSearchOpen(false) } })
    if (order.account?.city) items.push({ type: 'account', text: `${order.account.city}${order.account.stateProvince ? ', ' + order.account.stateProvince : ''}`, sub: 'Location', action: () => { setTab('account'); setSearchOpen(false) } })
    // Contact
    if (order.contact?.firstName || order.contact?.lastName) items.push({ type: 'contact', text: `${order.contact.firstName} ${order.contact.lastName}`.trim(), sub: 'Technical contact', action: () => { setTab('contact'); setSearchOpen(false) } })
    if (order.contact?.email) items.push({ type: 'contact', text: order.contact.email, sub: 'Contact email', action: () => { setTab('contact'); setSearchOpen(false) } })
    // Line items
    order.items?.forEach((item, i) => {
      items.push({ type: 'item', text: item.name || item.label || `Item ${i + 1}`, sub: item.no, action: () => { setTab('items'); setSearchOpen(false) } })
    })
    return items
  })()

  const filteredSearchItems = searchQuery
    ? searchItems.filter((item) => {
        const q = searchQuery.toLowerCase()
        return item.text.toLowerCase().includes(q) || (item.sub?.toLowerCase().includes(q) ?? false)
      })
    : searchItems

  // Keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
        setSearchQuery('')
        setSearchActiveIdx(0)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  // Auto-focus search input when opened
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus()
  }, [searchOpen])

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSearchActiveIdx((i) => Math.min(i + 1, filteredSearchItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSearchActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filteredSearchItems[searchActiveIdx]?.action()
    }
  }

  const loadedFilename =
    state.status === 'loaded' ? state.result.sourceFile : undefined


  return (
    <>
      <header className="app-header">
        <img
          src={`${import.meta.env.BASE_URL}trilion-logo-2017_RGB-white-medium.png`}
          alt="Trilion"
          className="header-logo"
        />
        <h1 className="header-app-name">GPC Viewer</h1>
        <span className="badge-beta">BETA</span>
        {loadedFilename && (
          <span className="filename" title={loadedFilename}>
            {loadedFilename}
          </span>
        )}
        <div className="header-right">
          <button
            className="header-icon-btn"
            onClick={() => { setSearchOpen(true); setSearchQuery(''); setSearchActiveIdx(0) }}
            title="Search (Cmd+K)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="21" y2="21" />
            </svg>
          </button>
          {state.status === 'loaded' && order && isDirty && (
            <div className="header-actions">
              <button className="header-action-btn header-action-btn--ghost" onClick={handleDiscard} disabled={isSaving}>Discard</button>
              <button className="header-action-btn header-action-btn--primary" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
          {state.status === 'loaded' && order && (
            <button
              className={`header-action-btn header-action-btn--edit${isEditing ? ' header-action-btn--edit-active' : ''}`}
              onClick={handleEditToggle}
              title={isEditing ? 'Exit edit mode' : 'Edit order fields'}
              aria-pressed={isEditing}
            >
              {isEditing ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Done
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit
                </>
              )}
            </button>
          )}
          <button
            className="theme-toggle"
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {isDirty && state.status === 'loaded' && (
        <SaveBar sourceFile={state.result.sourceFile} />
      )}

      <main className="app">
        {state.status === 'idle' && (
          <div className="app-idle">
            {pdbCached !== null && (
              <div className="new-order-bar">
                <button
                  className="new-order-btn"
                  onClick={handleNewOrder}
                  title={pdbCached ? 'Create a new blank order using cached PDB' : 'Drop a .gproducts file to create a new order'}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  New Order
                </button>
                {!pdbCached && (
                  <span className="new-order-hint">Drop a .gproducts file here or use the button above to create a new order. The PDB will be cached locally.</span>
                )}
              </div>
            )}
            <FilePicker onFile={handleFile} />
          </div>
        )}

        {state.status === 'loading' && (
          <div className="app-loading" aria-live="polite" aria-busy="true">
            <div className="spinner" role="status" aria-label="Loading" />
            <span>Reading file…</span>
          </div>
        )}

        {state.status === 'error' && (
          <div className="app-error">
            <ErrorBanner message={state.message} onRetry={handleRetry} />
          </div>
        )}

        {state.status === 'loaded' && order && (
          <div className="app-loaded">
            <SummaryBar order={order} />
            <OrderStrip
              order={order}
              isEditing={isEditing}
              onChange={handleHeaderChange}
            />
            <nav className="tab-bar" aria-label="Sections">
              {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
                <button
                  key={t}
                  className={`tab-btn${tab === t ? ' active' : ''}`}
                  onClick={() => setTab(t)}
                  aria-current={tab === t ? 'page' : undefined}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </nav>
            <div className="tab-content">
              {tab === 'items' && (
                <ItemsTab
                  order={order}
                  isEditing={isEditing}
                  onDelete={handleItemDelete}
                  onAddProduct={handleAddProduct}
                  onAddLicense={handleAddLicense}
                  onLicenseUserChange={handleLicenseUserChange}
                  articleCatalog={state.status === 'loaded' ? state.result.articleCatalog : []}
                  licenseCatalog={state.status === 'loaded' ? state.result.licenseCatalog : []}
                />
              )}
              {tab === 'account' && (
                <AccountTab
                  account={order.account}
                  isEditing={isEditing}
                  onChange={handleAccountChange}
                />
              )}
              {tab === 'contact' && (
                <ContactTab
                  contact={order.contact}
                  isEditing={isEditing}
                  onChange={handleContactChange}
                />
              )}
              {tab === 'admin' && (
                <AdminTab
                  admin={order.administration}
                  isEditing={isEditing}
                  onChange={handleAdminChange}
                />
              )}
              {tab === 'comments' && (
                <CommentsTab
                  comments={order.comments}
                  isEditing={isEditing}
                  onChange={(v) => { setOrder((prev) => prev ? { ...prev, comments: v } : null); setIsDirty(true) }}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-version">v{__APP_VERSION__}</span>
        <div className="footer-legal-block">
          <span className="footer-legal-heading">INTERNAL USE ONLY — PROPRIETARY &amp; CONFIDENTIAL</span>
          <span className="footer-legal">
            This tool and all information displayed herein are strictly for internal use by authorized
            personnel of Trilion Quality Systems only. All data, pricing, configurations, and customer
            information are proprietary and confidential. Sharing, forwarding, reproducing, or
            disclosing any information provided through this tool to any third party is completely
            forbidden without a signed NDA with ZEISS and/or Trilion Quality Systems.
            Unauthorized use or distribution may result in legal action.
            Use at your own risk — no warranties expressed or implied.
          </span>
        </div>
      </footer>

      <InstallBanner />

      {searchOpen && (
        <div className="search-overlay" onClick={(e) => { if (e.target === e.currentTarget) setSearchOpen(false) }}>
          <div className="search-palette">
            <input
              ref={searchInputRef}
              className="search-input"
              placeholder="Search sections, fields, items..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchActiveIdx(0) }}
              onKeyDown={handleSearchKeyDown}
            />
            <div className="search-results">
              {filteredSearchItems.length === 0 && (
                <div className="search-empty">No results found</div>
              )}
              {filteredSearchItems.map((item, i) => (
                <div
                  key={i}
                  className={`search-result${i === searchActiveIdx ? ' active' : ''}`}
                  onClick={() => item.action()}
                  onMouseEnter={() => setSearchActiveIdx(i)}
                >
                  <span className="search-result-type">{item.type}</span>
                  <div>
                    <div className="search-result-text">{item.text}</div>
                    {item.sub && <div className="search-result-sub">{item.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="search-hint">Navigate with arrow keys, Enter to select, Esc to close</div>
          </div>
        </div>
      )}
    </>
  )
}
