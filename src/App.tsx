declare const __APP_VERSION__: string

import { useState, useCallback, useEffect } from 'react'
import type { AccountDetails, OrderAdministration, OrderSummary, ParseResult, TechnicalContact } from './types/order.ts'
import { loadGpcFile } from './lib/index.ts'
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

  // Mutable order copy — this is what the tab components read/write in edit mode
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | undefined>(undefined)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  // Sync mutable order copy whenever a new file is loaded
  useEffect(() => {
    if (state.status === 'loaded') {
      setOrder(state.result.order)
      setIsEditing(false)
      setIsDirty(false)
      setFileHandle(state.result.fileHandle)
    } else {
      setOrder(null)
      setIsEditing(false)
      setIsDirty(false)
      setFileHandle(undefined)
    }
  }, [state])

  const handleFile = useCallback(async (file: File, handle?: FileSystemFileHandle) => {
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
  }, [])

  const handleRetry = useCallback(() => {
    setState({ status: 'idle' })
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
        fileHandle
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
        <span className="header-app-name">GPC Viewer</span>
        {loadedFilename && (
          <span className="filename" title={loadedFilename}>
            {loadedFilename}
          </span>
        )}
        <div className="header-right">
          {state.status === 'loaded' && order && (
            <div className="header-actions">
              {isDirty && (
                <>
                  <button className="header-action-btn header-action-btn--ghost" onClick={handleDiscard} disabled={isSaving}>Discard</button>
                  <button className="header-action-btn header-action-btn--primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                </>
              )}
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
            </div>
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
              {tab === 'items' && <ItemsTab order={order} />}
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
    </>
  )
}
