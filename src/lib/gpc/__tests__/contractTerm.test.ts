import { describe, it, expect } from 'vitest'
import { renewalStart } from '../contractTerm.ts'

describe('when a pasted renewal starts', () => {
  const today = new Date(2026, 8, 29) // 29 September 2026, local time

  it('starts the month after the old agreement when that is still ahead', () => {
    expect(renewalStart('2026-12-31', today)).toBe('2027-01-01')
  })

  it('starts next month when the old agreement ends this month', () => {
    expect(renewalStart('2026-09', today)).toBe('2026-10-01')
  })

  it('never starts in the past: a lapsed agreement renews from next month', () => {
    // Cover cannot be bought backwards; a 2023 term on a 2026 order would be over already.
    expect(renewalStart('2023-05-31', today)).toBe('2026-10-01')
  })
})
