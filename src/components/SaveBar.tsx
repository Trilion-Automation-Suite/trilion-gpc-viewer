/**
 * UnsavedBanner — full-width amber strip shown just below the header
 * when there are unsaved edits. Save/Discard actions are in the header.
 */

import './SaveBar.css'

interface SaveBarProps {
  sourceFile: string
}

export function SaveBar({ sourceFile }: SaveBarProps) {
  return (
    <div className="unsaved-banner" role="status" aria-label="Unsaved changes">
      <span className="unsaved-banner-dot" aria-hidden="true" />
      <span className="unsaved-banner-text">Unsaved changes</span>
      {sourceFile && (
        <span className="unsaved-banner-file" title={sourceFile}>
          {sourceFile}
        </span>
      )}
    </div>
  )
}
