/**
 * The catalog chip in the header, and the menu behind it.
 *
 * Switching catalog is an edit, not an import, so it belongs on the thing that
 * shows the current catalog rather than behind a file upload: the order already
 * open is re-targeted in place and stays open for further editing. A catalog the
 * user has loaded once is remembered, so the usual case is two clicks.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { PdbLibraryEntry } from '../lib/pdbCache.ts'
import type { ConversionReport } from '../lib/gpc/convertCatalog.ts'
import './PdbSwitcher.css'

interface PdbSwitcherProps {
  current: string
  /** Catalog names already cached locally, newest first. */
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
  const [dragging, setDragging] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  const accept = useCallback((file: File | undefined) => {
    if (!file) return
    setOpen(false)
    setDragging(false)
    onLoadCatalog(file)
  }, [onLoadCatalog])

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
            <p className="pdb-menu-empty">
              No other catalogs yet — load one below and it is kept for next time.
            </p>
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
          <label
            className={`pdb-menu-drop${dragging ? ' pdb-menu-drop-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragEnter={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); accept(e.dataTransfer.files?.[0]) }}
          >
            <input
              type="file"
              // A .gconfiguration carries the same config.xml as the .gproducts
              // it was built from — identical catalog, identical version name —
              // so an existing order is just as good a source.
              accept=".gproducts,.gconfiguration"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; accept(f) }}
            />
            <span className="pdb-drop-title">
              {dragging ? 'Drop to load' : 'Drop a catalog here, or click to browse'}
            </span>
            <span className="pdb-drop-hint">.gproducts, or any .gconfiguration</span>
          </label>
        </div>
      )}

      {report && (
        <div className="pdb-report" role="status">
          <div className="pdb-report-head">
            <strong>Converted to {report.targetCatalog}</strong>
            <button type="button" onClick={onDismissReport} aria-label="Dismiss">×</button>
          </div>
          <ConversionSummary report={report} />
          <p className="pdb-report-note">Save to keep this conversion.</p>
        </div>
      )}
    </div>
  )
}

function money(value: string | null): string {
  if (value === null || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value
}

/**
 * What a conversion did, in the order someone acting on it needs: anything to
 * fix first, then what changed in the quote, then the mechanics for whoever is
 * troubleshooting. Counts of rebuilt sections and repriced rows are true but
 * not actionable, so they wait in the details.
 */
function ConversionSummary({ report }: { report: ConversionReport }) {
  const lost = report.dependentLists.picksLost ?? []
  const failed = report.rulesFailed ?? []
  const changes = report.ruleChanges ?? []
  const added = changes.filter((c) => c.added)
  const removed = changes.filter((c) => !c.added)
  const { msrpBefore, msrpAfter } = report.totals ?? { msrpBefore: null, msrpAfter: null }
  const delta = msrpBefore && msrpAfter ? Number(msrpAfter) - Number(msrpBefore) : null
  const describe = (c: { section: string; option: string }) => `${c.option} (${c.section})`
  const attention: string[] = [
    ...lost.map((l) => `${l} is no longer in this catalog; pick a replacement in Configure`),
    ...report.issues.map((i) => `Article not found in this catalog: ${i.longName ?? '(unnamed)'}`),
    ...report.dependentListsNotConverted.map((l) => `Line left on the old catalog (no list "${l}" here); GPC may refuse the file`),
    ...failed,
  ]
  const repriced = report.priceChanges.filter((c) => c.field !== 'LongName').length

  return (
    <>
      {attention.length > 0 && (
        <div className="pdb-report-block">
          <strong className="pdb-report-warn">Needs your attention</strong>
          <ul>{attention.map((a, i) => <li key={i} className="pdb-report-warn">{a}</li>)}</ul>
        </div>
      )}
      <div className="pdb-report-block">
        <strong>What changed</strong>
        <ul>
          {msrpBefore !== msrpAfter && (
            <li>
              List price {money(msrpBefore)} → {money(msrpAfter)}
              {delta !== null && delta !== 0 && ` (${delta > 0 ? '+' : '−'}${money(String(Math.abs(delta)))})`}
            </li>
          )}
          {added.length > 0 && <li>Now included: {added.map(describe).join('; ')}</li>}
          {removed.length > 0 && <li>No longer included: {removed.map(describe).join('; ')}</li>}
          {msrpBefore === msrpAfter && changes.length === 0 && <li>Nothing in the configuration changed; prices are the new catalog's.</li>}
        </ul>
      </div>
      <details className="pdb-report-details">
        <summary>Details</summary>
        <ul>
          <li>{repriced} price{repriced === 1 ? '' : 's'} updated from the new catalog</li>
          {report.articles.total > 0 && <li>{report.articles.replaced} of {report.articles.total} catalog articles matched</li>}
          {report.configurationItems.replaced > 0 && <li>{report.configurationItems.replaced} configuration item{report.configurationItems.replaced === 1 ? '' : 's'} refreshed</li>}
          {report.configurationItems.renamed.length > 0 && (
            <li>Renamed: {report.configurationItems.renamed.map((r) => `${r.from} → ${r.to}`).join('; ')}</li>
          )}
          {report.dependentLists.reconciled > 0 && (
            <li>
              Option lists rebuilt to match the new catalog on {report.dependentLists.reconciled} line
              {report.dependentLists.reconciled === 1 ? '' : 's'}: {new Set(report.dependentLists.sectionsRemoved).size} section
              {new Set(report.dependentLists.sectionsRemoved).size === 1 ? '' : 's'} and {new Set(report.dependentLists.optionsRemoved).size} option
              {new Set(report.dependentLists.optionsRemoved).size === 1 ? '' : 's'} it dropped, {new Set(report.dependentLists.optionsAdded).size} it added
            </li>
          )}
        </ul>
      </details>
    </>
  )
}
