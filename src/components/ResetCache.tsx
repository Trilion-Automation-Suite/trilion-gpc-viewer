import { useState } from 'react'
import { clearCachedData } from '../lib/clearCache.ts'

/**
 * Clears the cached product databases and the offline app, then reloads.
 * Two clicks, because it drops every catalog the operator has loaded.
 */
export function ResetCache({ hasUnsavedChanges }: { hasUnsavedChanges: boolean }) {
  const [stage, setStage] = useState<'idle' | 'confirm' | 'working'>('idle')

  if (stage === 'idle') {
    return (
      <button type="button" className="footer-reset" onClick={() => setStage('confirm')}
        title="Forget cached product databases and reload the latest version of the app">
        Reset cache
      </button>
    )
  }
  if (stage === 'working') return <span className="footer-reset-note">Clearing…</span>
  return (
    <span className="footer-reset-confirm" role="group" aria-label="Confirm cache reset">
      <span className="footer-reset-note">
        Forget every cached PDB and reload{hasUnsavedChanges ? ' — unsaved changes will be lost' : ''}?
      </span>
      <button type="button" className="footer-reset footer-reset--danger" onClick={async () => {
        setStage('working')
        await clearCachedData()
        window.location.reload()
      }}>Clear and reload</button>
      <button type="button" className="footer-reset" onClick={() => setStage('idle')}>Cancel</button>
    </span>
  )
}
