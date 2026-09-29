import { useMemo, useState } from 'react'
import type { ListView, OptionView, SectionView, SystemEditor } from '../lib/gpc/dependentListEngine.ts'
import { NeedsGpcError, PickError } from '../lib/gpc/dependentListEngine.ts'
import type { Dec } from '../lib/gpc/decimal.ts'
import { formatDecimal } from '../lib/gpc/decimal.ts'
import { formatPrice } from '../lib/pricing.ts'
import './SystemEditorModal.css'

/**
 * Changing the options of a configured system — adding a measuring volume,
 * swapping a stand, three more lights instead of one.
 *
 * Every click goes through the configurator's own rules engine, so what the
 * operator sees after it is what GPC would show: the camera frame a volume
 * needs appears on its own, an option whose precondition just went away
 * disappears, a section left without its required pick is flagged. The editor
 * works on a copy of the order; nothing reaches the file until Apply.
 */

const MODE_LABEL: Record<string, string> = {
  ExactlyOne: 'pick one',
  ZeroOrOne: 'pick one or none',
  AtLeastOne: 'pick at least one',
  OneOrMore: 'pick any',
}

function selectionLabel(s: SectionView): string {
  if (s.mode === 'MinXMaxY') return `pick ${s.selection.minAmount}–${s.selection.maxAmount}`
  return MODE_LABEL[s.mode] ?? s.mode
}

function money(value: Dec | string | null): string {
  if (value === null) return '—'
  const n = Number(typeof value === 'string' ? value : formatDecimal(value))
  return formatPrice(n, 0)
}

function delta(before: string | null, after: Dec | null): string {
  const b = Number(before ?? '0')
  const a = Number(after ? formatDecimal(after) : '0')
  const d = a - b
  if (d === 0) return ''
  return `${d > 0 ? '+' : '−'}${formatPrice(Math.abs(d), 0)}`
}

/** Why an option has its amount, when it was not the operator. */
function autoTag(o: OptionView): string | null {
  if (o.amount === 0) return null
  if (o.mode === 'Implication' || o.mode === 'SectionSpecialFunction') return 'auto'
  if (o.mode === 'SoftImplication') return 'suggested'
  if (o.mode === 'Default') return 'default'
  return null
}

function OptionRow({
  section,
  option,
  radioName,
  onPick,
}: {
  section: SectionView
  option: OptionView
  radioName: string
  onPick: (amount: number) => void
}) {
  const locked = option.readOnly || option.mode === 'Implication' || option.mode === 'SectionSpecialFunction'
  const radio = section.mode === 'ExactlyOne' || section.mode === 'ZeroOrOne'
  const changed = option.amount !== option.original
  const tag = autoTag(option)
  const cls = [
    'sysed-option',
    changed ? (option.amount > option.original ? 'sysed-option--added' : 'sysed-option--removed') : '',
    locked ? 'sysed-option--locked' : '',
    option.disabled ? 'sysed-option--unavailable' : '',
  ].filter(Boolean).join(' ')

  let control
  if (section.isQuantity && option.max > 1) {
    control = (
      <input
        type="number"
        className="sysed-qty"
        min={0}
        max={Math.max(option.amount, Math.min(option.max, option.allowed))}
        value={option.amount}
        disabled={locked || option.disabled}
        aria-label={`Quantity of ${option.name}`}
        onChange={e => {
          const n = parseInt(e.target.value, 10)
          if (!Number.isNaN(n) && n !== option.amount) onPick(n)
        }}
      />
    )
  } else if (radio) {
    control = (
      <input
        type="radio"
        name={radioName}
        checked={option.amount > 0}
        disabled={locked || option.disabled}
        aria-label={option.name}
        onChange={() => onPick(Math.max(1, option.min))}
        onClick={() => {
          // A radio cannot be unticked by clicking it; "pick one or none" still needs a way back.
          if (section.mode === 'ZeroOrOne' && option.amount > 0) onPick(0)
        }}
      />
    )
  } else {
    control = (
      <input
        type="checkbox"
        checked={option.amount > 0}
        disabled={locked || option.disabled}
        aria-label={option.name}
        onChange={e => onPick(e.target.checked ? Math.max(1, option.min) : 0)}
      />
    )
  }

  return (
    <li className={cls}>
      <label className="sysed-option-label">
        {control}
        <span className="sysed-option-name">{option.name}</span>
        {tag && <em className={`sysed-tag sysed-tag--${tag}`}>{tag}</em>}
        {option.disabled && <em className="sysed-tag">unavailable</em>}
      </label>
      <span className="sysed-option-price">
        {option.msrp !== null && option.msrp !== '0' ? money(option.msrp) : ''}
      </span>
    </li>
  )
}

function SectionBlock({
  list,
  section,
  showUnavailable,
  filter,
  editable,
  onPick,
}: {
  list: ListView
  section: SectionView
  showUnavailable: boolean
  filter: string
  editable: boolean
  onPick: (sectionIndex: number, optionIndex: number, amount: number) => void
}) {
  const options = section.options.filter(o => {
    if (!showUnavailable && (o.hidden || o.disabled) && o.original === 0) return false
    if (filter && !o.name.toLowerCase().includes(filter) && !section.name.toLowerCase().includes(filter)) return false
    return true
  })
  if (options.length === 0) return null
  const hasChange = section.options.some(o => o.amount !== o.original)
  return (
    <section className={'sysed-section' + (section.complete ? '' : ' sysed-section--incomplete')}>
      <header className="sysed-section-head">
        <h4>{section.name}</h4>
        <span className="sysed-section-mode">{section.isSubconfig ? 'sub-configuration' : selectionLabel(section)}</span>
        {!section.complete && <em className="sysed-badge-incomplete">needs a pick</em>}
        {hasChange && <em className="sysed-badge-changed">changed</em>}
      </header>
      {section.description && <p className="sysed-section-note">{section.description}</p>}
      <ul className="sysed-options">
        {options.map(o => (
          <OptionRow
            key={o.index}
            section={section}
            option={o}
            radioName={`sysed-${list.no}-${section.index}`}
            onPick={amount => (editable ? onPick(section.index, o.index, amount) : undefined)}
          />
        ))}
      </ul>
      {section.overridden.length > 0 && (
        <ul className="sysed-overridden">
          {section.overridden.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      )}
    </section>
  )
}

export function SystemEditorModal({
  editor,
  onApply,
  onCancel,
}: {
  /** A working copy: the editor owns a parsed order that is thrown away on cancel. */
  editor: SystemEditor
  onApply: (editor: SystemEditor) => void
  onCancel: () => void
}) {
  // The editor mutates in place; a counter re-renders after each pick.
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [showUnavailable, setShowUnavailable] = useState(false)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lists = useMemo(() => editor.view(), [editor, revision])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changes = useMemo(() => editor.changes(), [editor, revision])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const incomplete = useMemo(() => editor.incomplete(), [editor, revision])
  const replayDiffs = useMemo(() => editor.replayDiffs(), [editor])
  const root = lists[0]

  function pick(sectionIndex: number, optionIndex: number, amount: number) {
    setError(null)
    try {
      editor.pick(sectionIndex, optionIndex, amount)
    } catch (err) {
      if (err instanceof PickError || err instanceof NeedsGpcError) setError(err.message)
      else setError(err instanceof Error ? err.message : String(err))
    }
    setRevision(r => r + 1)
  }

  function apply() {
    setError(null)
    try {
      onApply(editor)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const needle = filter.trim().toLowerCase()

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="sysed-modal" role="dialog" aria-modal="true" aria-label={`Configure ${root.itemName}`}>
        <header className="sysed-head">
          <h3 className="modal-title">Configure {root.no} · {root.itemName}</h3>
          <div className="sysed-totals">
            {lists.map(l => (
              <div key={l.no} className="sysed-total-row">
                <span className="sysed-total-name">{l.no} {l.itemName}</span>
                <span>List {money(l.storedMsrp)} → <strong>{money(l.totals.msrp)}</strong> <em>{delta(l.storedMsrp, l.totals.msrp)}</em></span>
                <span>Distributor {money(l.storedDp)} → <strong>{money(l.totals.dp)}</strong> <em>{delta(l.storedDp, l.totals.dp)}</em></span>
              </div>
            ))}
          </div>
          <div className="sysed-tools">
            <input
              type="search"
              className="sysed-filter"
              placeholder="Find an option or section…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <label className="sysed-toggle">
              <input type="checkbox" checked={showUnavailable} onChange={e => setShowUnavailable(e.target.checked)} />
              Show unavailable options
            </label>
          </div>
          {replayDiffs.length > 0 && (
            <p className="sysed-warning">
              The rules engine does not reproduce {replayDiffs.length} stored selection
              {replayDiffs.length === 1 ? '' : 's'} of this system, so its result may differ from GPC's. Check it in GPC
              before sending.
            </p>
          )}
          {error && <p className="sysed-error" role="alert">{error}</p>}
        </header>

        <div className="sysed-body">
          {lists.map((l, li) => (
            <div key={l.no} className="sysed-list">
              {li > 0 && (
                <h3 className="sysed-list-title">
                  {l.no} {l.itemName} <span className="sysed-section-mode">follows the system; edit it in GPC</span>
                </h3>
              )}
              {l.sections
                .filter(s => !s.hidden || s.options.some(o => o.amount !== o.original))
                .map(s => (
                  <SectionBlock
                    key={s.index}
                    list={l}
                    section={s}
                    showUnavailable={showUnavailable}
                    filter={needle}
                    editable={li === 0}
                    onPick={pick}
                  />
                ))}
            </div>
          ))}
        </div>

        <footer className="sysed-foot">
          {changes.length > 0 && (
            <details className="sysed-changes" open>
              <summary>{changes.length} change{changes.length === 1 ? '' : 's'}</summary>
              <ul>
                {changes.map((c, i) => (
                  <li key={i} className={c.to > c.from ? 'sysed-change--added' : 'sysed-change--removed'}>
                    {c.to > c.from ? '+' : '−'} {c.option}
                    {c.to > 1 || c.from > 1 ? ` (${c.from} → ${c.to})` : ''}
                    <span className="sysed-change-section"> · {c.section}</span>
                    {c.mode !== 'UserChoice' && <em> · automatic</em>}
                  </li>
                ))}
                {editor.removedSubconfigs.map(name => (
                  <li key={name} className="sysed-change--removed">− sub-configuration {name}</li>
                ))}
              </ul>
            </details>
          )}
          {incomplete.length > 0 && (
            <p className="sysed-warning">
              GPC will show {incomplete.length === 1 ? 'this section' : 'these sections'} as incomplete:{' '}
              {incomplete.map(i => i.section).join(', ')}.
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="modal-btn modal-btn-cancel" onClick={onCancel}>Cancel</button>
            <button type="button" className="modal-btn modal-btn-add" disabled={changes.length === 0} onClick={apply}>
              Apply {changes.length > 0 ? `${changes.length} change${changes.length === 1 ? '' : 's'}` : ''}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
