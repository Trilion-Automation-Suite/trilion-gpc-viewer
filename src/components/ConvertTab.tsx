/**
 * Convert tab — re-target an opened configuration at a newer product database.
 *
 * The report is the point of this screen, not the download. A conversion can
 * succeed in bytes and still be wrong for the business: an article that no
 * longer exists, a dependent list whose prices could not be refreshed. Those
 * are shown before the file is offered, not hidden behind a success message.
 */
import { useState } from 'react'
import { convertOpenedGpc, needsReview } from '../lib/gpc/convertGpcFile.ts'
import type { ConvertedFile } from '../lib/gpc/convertGpcFile.ts'
import './ConvertTab.css'

interface ConvertTabProps {
  /** The open configuration, already decrypted by the app. */
  decryptedZip: ArrayBuffer | null
  sourceFilename: string
}

export function ConvertTab({ decryptedZip, sourceFilename }: ConvertTabProps) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ConvertedFile | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onPickPdb(file: File | undefined) {
    if (!file || !decryptedZip) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      setResult(await convertOpenedGpc(decryptedZip, await file.arrayBuffer(), sourceFilename))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  function download() {
    if (!result) return
    const url = URL.createObjectURL(new Blob([result.bytes], { type: 'application/octet-stream' }))
    const a = document.createElement('a')
    a.href = url
    a.download = result.suggestedFilename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!decryptedZip) {
    return <p className="convert-empty">Open a configuration first, then choose the product database to convert it to.</p>
  }

  const r = result?.report

  return (
    <div className="convert-tab">
      <p className="convert-intro">
        Re-targets this configuration at a newer catalog: article data, configuration
        items, currency and totals are refreshed. Anything that cannot be matched is
        left untouched and listed below, so the file always stays openable.
      </p>

      <label className="convert-pick">
        <input
          type="file"
          accept=".gproducts"
          disabled={busy}
          onChange={(e) => void onPickPdb(e.target.files?.[0])}
        />
        <span>{busy ? 'Converting…' : 'Choose product database (.gproducts)'}</span>
      </label>

      {error && <p className="convert-error" role="alert">{error}</p>}

      {result && r && (
        <div className="convert-report">
          <h3>
            {result.sourceCatalog ?? 'unknown catalog'} → {r.targetCatalog ?? 'target'}
          </h3>

          <dl className="convert-stats">
            <div><dt>Articles</dt><dd>{r.articles.replaced} of {r.articles.total} updated</dd></div>
            <div><dt>Configuration items</dt><dd>{r.configurationItems.replaced} updated</dd></div>
            <div><dt>Price changes</dt><dd>{r.priceChanges.filter((c) => c.field !== 'LongName').length}</dd></div>
          </dl>

          {r.configurationItems.renamed.length > 0 && (
            <section>
              <h4>Renamed in the new catalog</h4>
              <ul>
                {r.configurationItems.renamed.map((x) => (
                  <li key={x.from}>{x.from} → <strong>{x.to}</strong></li>
                ))}
              </ul>
            </section>
          )}

          {r.dependentListsNotConverted.length > 0 && (
            <section className="convert-warn">
              <h4>Not converted — still priced from the old catalog</h4>
              <ul>
                {r.dependentListsNotConverted.map((n) => <li key={n}>{n}</li>)}
              </ul>
              <p>
                These are dependent-list items. Their selections record only a name and a
                price, with no article reference, so their prices could not be refreshed.
                Check them by hand before sending this file out.
              </p>
            </section>
          )}

          {r.issues.length > 0 && (
            <section className="convert-warn">
              <h4>Needs review</h4>
              <ul>
                {r.issues.map((i, n) => (
                  <li key={`${i.longName}-${n}`}>
                    <strong>{i.longName ?? '(unnamed)'}</strong> — {i.kind === 'unmatched'
                      ? 'no match in the new catalog'
                      : `ambiguous: ${i.candidates?.join(', ')}`}
                    {i.sapNr && <span className="convert-sap"> SAP {i.sapNr}</span>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.priceChanges.filter((c) => c.field !== 'LongName').length > 0 && (
            <section>
              <h4>Price changes</h4>
              <table className="convert-prices">
                <thead><tr><th>Article</th><th>Field</th><th>Was</th><th>Now</th></tr></thead>
                <tbody>
                  {r.priceChanges.filter((c) => c.field !== 'LongName').map((c, n) => (
                    <tr key={`${c.longName}-${c.field}-${n}`}>
                      <td>{c.longName}</td><td>{c.field}</td><td>{c.from}</td><td>{c.to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <button type="button" className="convert-download" onClick={download}>
            Download {result.suggestedFilename}
          </button>
          {needsReview(r) && (
            <p className="convert-caveat">Review the items above before sending this file out.</p>
          )}
        </div>
      )}
    </div>
  )
}
