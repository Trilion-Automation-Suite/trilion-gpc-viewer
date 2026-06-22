import { useState, useMemo, useRef, DragEvent, ChangeEvent } from 'react'
import type { OrderSummary } from '../types/order.ts'
import { EUC_RULES } from '../lib/euc/eucRules.ts'
import { parseEucDoc } from '../lib/euc/parseEucDoc.ts'
import { deriveReference } from '../lib/euc/deriveReference.ts'
import { evaluateEuc, buildCustomerFeedback, type EucReport, type CheckResult } from '../lib/euc/eucEngine.ts'
import { formatPrice } from '../lib/pricing.ts'
import './EucTab.css'

interface EucTabProps {
  order: OrderSummary
  currencyRates: Record<string, number>
}

const STATUS_LABEL: Record<CheckResult['status'], string> = {
  pass: 'PASS', warn: 'REVIEW', fail: 'FAIL', manual: 'BY EYE',
}

export function EucTab({ order, currencyRates }: EucTabProps) {
  const { reference, info } = useMemo(
    () => deriveReference(order, currencyRates),
    [order, currencyRates]
  )

  const [report, setReport] = useState<EucReport | null>(null)
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setBusy(true)
    setError(null)
    setFileName(file.name)
    try {
      const text = await parseEucDoc(file)
      const rep = evaluateEuc(text, EUC_RULES, reference)
      setReport(rep)
      setFeedback(buildCustomerFeedback(rep))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setReport(null)
    } finally {
      setBusy(false)
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  async function copyFeedback() {
    await navigator.clipboard.writeText(feedback)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const auto = report?.results.filter((r) => r.status !== 'manual') ?? []
  const manual = report?.results.filter((r) => r.status === 'manual') ?? []

  return (
    <div className="tab-panel euc-tab">
      <section className="info-section">
        <h3 className="info-section-title">Checking against the open order</h3>
        <div className="euc-derived">
          <div><span className="euc-d-label">Consignee</span><span>{info.consigneeCompany || '—'}</span></div>
          <div><span className="euc-d-label">End-user</span><span>{info.endUserCompany || '—'}</span></div>
          <div>
            <span className="euc-d-label">Suggested value</span>
            <span>
              {info.suggestedEur != null
                ? `€ ${formatPrice(info.suggestedEur, 0)}`
                : '— (no rate / system item)'}
              {info.systemValueOrderCurrency != null && info.currency && (
                <span className="euc-d-sub">
                  {' '}from {formatPrice(info.systemValueOrderCurrency, 0)} {info.currency}
                  {info.fxFactorToEur != null ? ` × ${info.fxFactorToEur.toFixed(4)}` : ''}
                  {` · ${info.systemItemLabel}`}
                </span>
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="info-section">
        <div
          className={`euc-drop${dragOver ? ' drag-over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
          onDrop={onDrop}
          role="button"
          tabIndex={0}
        >
          <p className="euc-drop-primary">Drop the completed EUC here</p>
          <p className="euc-drop-secondary">Word (.docx) or PDF · the file never leaves this device</p>
          {fileName && <p className="euc-drop-file">{fileName}</p>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf"
          onChange={onChange}
          style={{ display: 'none' }}
        />
        {busy && <p className="euc-status" aria-live="polite">Reading file…</p>}
        {error && <p className="euc-error">{error}</p>}
        {report?.isLikelyScan && (
          <p className="euc-scanwarn">
            <strong>Looks like a scanned/image PDF.</strong> Almost no text could be read, so automated
            checks are unreliable — run the by-eye checklist below, or check the digital draft before it
            was printed and stamped.
          </p>
        )}
      </section>

      {report && (
        <>
          <section className="info-section">
            <div className="euc-overall">
              <span className={`euc-pill euc-${report.overall.toLowerCase()}`}>{report.overall}</span>
              <span className="euc-counts">
                ✓ {report.summary.pass} · ▲ {report.summary.warn} · ✕ {report.summary.fail} · ◆ {report.summary.manual} by eye
              </span>
              <span className="euc-meta">
                Sections: {report.sectionsFound.join(', ') || 'none'} · {report.charCount} chars
              </span>
            </div>
          </section>

          <section className="info-section">
            <h3 className="info-section-title">Automated checks</h3>
            <table className="euc-table">
              <thead><tr><th>Status</th><th>Sec</th><th>Check</th><th>Detail</th></tr></thead>
              <tbody>
                {auto.map((r) => (
                  <tr key={r.id}>
                    <td><span className={`euc-st euc-st-${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td className="euc-sec">{r.section}</td>
                    <td>{r.title}</td>
                    <td className="euc-detail">{r.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="info-section">
            <h3 className="info-section-title">Reviewer checklist (verify by eye)</h3>
            <ul className="euc-manual">
              {manual.map((r) => (
                <li key={r.id}>
                  <label>
                    <input type="checkbox" />
                    <span><strong>[{r.section}] {r.title}</strong><br /><span className="euc-detail">{r.feedback}</span></span>
                  </label>
                </li>
              ))}
            </ul>
          </section>

          <section className="info-section">
            <h3 className="info-section-title">Draft feedback for the customer</h3>
            <textarea
              className="euc-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={10}
              spellCheck={false}
            />
            <div className="euc-actions">
              <button className="euc-btn" onClick={copyFeedback}>Copy to clipboard</button>
              {copied && <span className="euc-copied">Copied.</span>}
            </div>
          </section>
        </>
      )}

      <p className="euc-disclaimer">
        Ruleset {EUC_RULES.rulesetVersion} · A self-check aid, not a substitute for ZEISS export-control review.
      </p>
    </div>
  )
}
