/**
 * SaveBar — sticky bottom bar shown when there are unsaved edits.
 * Provides "Save as .gconfiguration" and "Discard Changes" actions.
 */

import './SaveBar.css'

interface SaveBarProps {
  sourceFile: string
  isSaving: boolean
  onSave: () => void
  onDiscard: () => void
}

export function SaveBar({ sourceFile, isSaving, onSave, onDiscard }: SaveBarProps) {
  return (
    <div className="save-bar" role="region" aria-label="Unsaved changes">
      <span className="save-bar-indicator" aria-hidden="true" />
      <span className="save-bar-message">Unsaved changes</span>
      <span className="save-bar-filename" title={sourceFile}>
        {sourceFile}
      </span>
      <div className="save-bar-actions">
        <button
          className="save-bar-btn save-bar-btn--ghost"
          onClick={onDiscard}
          disabled={isSaving}
        >
          Discard
        </button>
        <button
          className="save-bar-btn save-bar-btn--primary"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? 'Saving…' : 'Save as .gconfiguration'}
        </button>
      </div>
    </div>
  )
}
