/**
 * The catalog chip in the header, and the menu behind it.
 *
 * Switching catalog is an edit, not an import, so it belongs on the thing that
 * shows the current catalog rather than behind a file upload: the order already
 * open is re-targeted in place and stays open for further editing. A catalog the
 * user has loaded once is remembered, so the usual case is two clicks.
 */
import { useEffect, useRef, useState } from 'react'
import type { PdbLibraryEntry } from '../lib/pdbCache.ts'
import type { ConversionReport } from '../lib/gpc/convertCatalog.ts'
import './PdbSwitcher.css'

interface PdbSwitcherProps {
  current: string
  /** Catalogs already loaded, newest first. */
  library: PdbLibraryEntry[]
  /** Only offered in edit mode — converting changes the order. */
  canConvert: boolean
  busy: boolean
  onConvertTo: (name: string) => void
  onLoadCatalog: (file: File) => void
  report: ConversionReport | null
  onDismissReport: () => void
}

export function PdbSwitcher({
  current, library, canConvert, busy, onConvertTo, onLoadCatalog, report, onDismissReport,
}: PdbSwitcherProps) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!current && !canConvert) return null

  const others = library.filter((p) => p.name && p.name !== current)

  return (
    <div className="pdb-switcher" ref={root}>
      <button
        type="button"
        className={`pdb-badge${canConvert ? ' pdb-badge-actionable' : ''}`}
        title={canConvert ? 'Switch product database' : `Built on product database ${current}`}
        onClick={() => canConvert && setOpen((v) => !v)}
        disabled={busy}
      >
        {busy ? 'Converting…' : current || 'No catalog'}
        {canConvert && <span className="pdb-caret" aria-hidden="true">▾</span>}
      </button>

      {open && (
        <div className="pdb-menu" role="menu">
          <p className="pdb-menu-head">Switch this order to</p>
          {others.length === 0 && (
            <p className="pdb-menu-empty">No other catalogs loaded yet.</p>
          )}
          {others.map((p) => (
            <button
              key={p.name}
              type="button"
              role="menuitem"
              className="pdb-menu-item"
              onClick={() => { setOpen(false); onConvertTo(p.name) }}
            >
              {p.name}
            </button>
          ))}
          <label className="pdb-menu-load">
            <input
              type="file"
              accept=".gproducts"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) { setOpen(false); onLoadCatalog(f) }
              }}
            />
            <span>Load a catalog (.gproducts)…</span>
          </label>
        </div>
      )}

      {report && (
        <div className="pdb-report" role="status">
          <div className="pdb-report-head">
            <strong>Converted to {report.targetCatalog}</strong>
            <button type="button" onClick={onDismissReport} aria-label="Dismiss">×</button>
          </div>
          <p>
            {report.articles.replaced} of {report.articles.total} articles updated
            {report.configurationItems.replaced > 0 && `, ${report.configurationItems.replaced} categories`}
            {report.priceChanges.filter((c) => c.field !== 'LongName').length > 0 &&
              `, ${report.priceChanges.filter((c) => c.field !== 'LongName').length} price changes`}.
          </p>
          {report.configurationItems.renamed.length > 0 && (
            <p className="pdb-report-note">
              Renamed: {report.configurationItems.renamed.map((r) => `${r.from} → ${r.to}`).join('; ')}
            </p>
          )}
          {report.dependentListsNotConverted.length > 0 && (
            <p className="pdb-report-warn">
              Not re-priced (still on the old catalog):{' '}
              {report.dependentListsNotConverted.join(', ')}. Their selections carry no
              article reference, so their prices could not be refreshed — check them by hand.
            </p>
          )}
          {report.issues.length > 0 && (
            <p className="pdb-report-warn">
              {report.issues.length} article{report.issues.length === 1 ? '' : 's'} need review:{' '}
              {report.issues.slice(0, 4).map((i) => i.longName ?? '(unnamed)').join(', ')}
              {report.issues.length > 4 && ` and ${report.issues.length - 4} more`}.
            </p>
          )}
          <p className="pdb-report-note">Save to keep this conversion.</p>
        </div>
      )}
    </div>
  )
}
