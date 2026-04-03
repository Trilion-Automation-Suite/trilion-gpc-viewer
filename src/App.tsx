declare const __APP_VERSION__: string

import { useState, useCallback, useEffect } from 'react'
import type { ParseResult } from './types/order.ts'
import { loadGpcFile } from './lib/index.ts'
import { FilePicker } from './components/FilePicker.tsx'
import { SummaryBar } from './components/SummaryBar.tsx'
import { ErrorBanner } from './components/ErrorBanner.tsx'
import { OrderStrip } from './components/OrderStrip.tsx'
import { ItemsTab } from './components/ItemsTab.tsx'
import { AccountTab } from './components/AccountTab.tsx'
import { ContactTab } from './components/ContactTab.tsx'
import { AdminTab } from './components/AdminTab.tsx'
import { InstallBanner } from './components/InstallBanner.tsx'
import './App.css'

type Tab = 'items' | 'account' | 'contact' | 'admin'
const TAB_LABELS: Record<Tab, string> = {
  items: 'Configuration Items',
  account: 'Account',
  contact: 'Technical Contact',
  admin: 'Administration',
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const handleFile = useCallback(async (file: File) => {
    setState({ status: 'loading' })
    try {
      const result = await loadGpcFile(file)
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
          handleFile(file)
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
      </header>

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

        {state.status === 'loaded' && (
          <div className="app-loaded">
            <SummaryBar order={state.result.order} />
            <OrderStrip order={state.result.order} />
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
              {tab === 'items' && <ItemsTab order={state.result.order} />}
              {tab === 'account' && <AccountTab account={state.result.order.account} />}
              {tab === 'contact' && <ContactTab contact={state.result.order.contact} />}
              {tab === 'admin' && <AdminTab admin={state.result.order.administration} />}
            </div>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span className="footer-version">v{__APP_VERSION__}</span>
        <span className="footer-legal">
          For authorized use only. Information contained herein is proprietary and confidential.
          Redistribution or sharing of any data viewed through this tool is strictly prohibited
          without a direct NDA with ZEISS and/or Trilion Quality Systems.
          Use at your own risk — no warranties expressed or implied.
        </span>
      </footer>
      <InstallBanner />
    </>
  )
}
