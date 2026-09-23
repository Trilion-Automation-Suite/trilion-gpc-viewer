/**
 * Counting a maintenance agreement's term.
 *
 * GPC prices support by whole calendar months — `MsrpPerYear` scaled by the
 * month count — so the term and the price are the same fact seen twice. Both
 * the writer and the parser derive months the same way, from here, rather than
 * each having its own idea of what a term is.
 *
 * **A term is always whole months.** It starts on the first of a month and
 * ends on the last day of one; there is no part-month agreement. That is not a
 * convention this code chose, it is how the agreements are sold, and the
 * pricing already assumes it: `monthsBetween` counts the start and end months
 * in full, so a term running to the 14th would be charged to the 31st. Every
 * date that goes into an agreement is snapped here, so the shape cannot be
 * violated by a caller or by a date picker.
 */

/**
 * The shortest agreement GPC sells. Longer ones are priced pro rata, so any
 * length from here up is a valid term.
 */
export const MINIMUM_CONTRACT_MONTHS = 12

/** The first of `day`'s month — where a term always begins. */
export function startOfMonth(day: string): string {
  const [y, m] = day.slice(0, 10).split('-').map(Number)
  if (!y) return ''
  return `${y}-${String(m).padStart(2, '0')}-01`
}

/** The last day of `day`'s month — where a term always ends. */
export function endOfMonth(day: string): string {
  const [y, m] = day.slice(0, 10).split('-').map(Number)
  if (!y) return ''
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

/** `2026-05` or `2026-05-17` -> `2026-05`, for a month input. */
export function monthOf(day: string): string {
  return day.slice(0, 7)
}

/**
 * Whole calendar months a term covers, inclusive of both ends — the same
 * arithmetic the configurator prices with: 2026-05-01 to 2027-04-30 is twelve.
 */
export function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.slice(0, 10).split('-').map(Number)
  const [ey, em] = end.slice(0, 10).split('-').map(Number)
  if (!sy || !ey) return MINIMUM_CONTRACT_MONTHS
  return (ey - sy) * 12 + (em - sm) + 1
}

/**
 * Months of lapsed cover between one agreement ending and the next starting.
 *
 * Zero when the new term picks up the next day, which is the usual case.
 * Anything more is a deliberate gap: the customer had no cover and is not
 * charged for it, so `MsrpForMissingMonth` stays null on every row.
 */
export function lapsedMonths(endOld: string, startNew: string): number {
  if (!endOld || !startNew) return 0
  const [ey, em] = endOld.slice(0, 10).split('-').map(Number)
  const [sy, sm] = startNew.slice(0, 10).split('-').map(Number)
  if (!ey || !sy) return 0
  return Math.max((sy - ey) * 12 + (sm - em) - 1, 0)
}

/**
 * The last day of the month `months - 1` after `start`'s.
 *
 * A term that stopped mid-month would still be charged as if it ran to the end
 * of it, because `monthsBetween` counts whole months. Ending on the boundary
 * keeps the term and the price in step.
 */
export function termEnd(start: string, months: number): string {
  const [y, m] = start.slice(0, 10).split('-').map(Number)
  if (!y) return ''
  // Day 0 of the following month is the last day of the one before it.
  return new Date(Date.UTC(y, m - 1 + months, 0)).toISOString().slice(0, 10)
}

/** The month after `day`'s, as a first-of-month date. */
export function nextMonthStart(day: string): string {
  const [y, m] = day.slice(0, 10).split('-').map(Number)
  if (!y) return ''
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10)
}
