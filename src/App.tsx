import { useState, useCallback, useEffect } from 'react'
import type { ParseResult } from './types/order.ts'
import { loadGpcFile } from './lib/index.ts'
import { FilePicker } from './components/FilePicker.tsx'
import { MetaPanel } from './components/MetaPanel.tsx'
import { SummaryBar } from './components/SummaryBar.tsx'
import { ConfigItemsTable } from './components/ConfigItemsTable.tsx'
import { ErrorBanner } from './components/ErrorBanner.tsx'
import './App.css'

type AppState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; result: ParseResult }
  | { status: 'error'; message: string }

export function App() {
  const [state, setState] = useState<AppState>({ status: 'idle' })
  const [darkMode, setDarkMode] = useState(() => {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  })

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
        <h1>Trilion GPC Viewer</h1>
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
          {darkMode ? '☀' : '☾'}
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
            <MetaPanel order={state.result.order} />
            <SummaryBar order={state.result.order} />
            <ConfigItemsTable order={state.result.order} />
          </div>
        )}
      </main>
    </>
  )
}
