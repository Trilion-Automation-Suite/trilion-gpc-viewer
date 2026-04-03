/**
 * Pure price calculation and formatting utilities.
 */

/**
 * Calculates the end customer price as MSRP * (1 - discount).
 * @param msrp   - list price
 * @param discount - ratio from 0 to 1 (e.g. 0.25 = 25% off)
 */
export function calcEndCustomerPrice(msrp: number, discount: number): number {
  return msrp * (1 - discount)
}

/**
 * Formats a price number as "111,380.00".
 * Returns empty string for null/undefined.
 */
export function formatPrice(value: number | null, decimals = 2): string {
  if (value === null) return ''
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * Formats a ratio (0–1) as a percentage string, e.g. 0.25 → "25.00%".
 * Returns empty string for null.
 */
export function formatPercent(ratio: number | null): string {
  if (ratio === null) return ''
  return (ratio * 100).toFixed(2) + '%'
}

/**
 * Parses a dotted item number into an array of integers for sorting.
 * e.g. "1.2.3" → [1, 2, 3], "10" → [10]
 */
export function parseItemNo(no: string): number[] {
  if (no.trim() === '') return [0]
  return no.split('.').map((part) => {
    const n = parseInt(part, 10)
    return isNaN(n) ? 0 : n
  })
}
