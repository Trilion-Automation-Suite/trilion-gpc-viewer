/**
 * Ranking for the Add Product search.
 *
 * The catalog has ~3,800 articles and most names share words, so a substring
 * filter sorted alphabetically puts whatever sorts first on top: "aramis"
 * opened on driver licences, and the parts that only exist inside a system —
 * `(in-sys)` rows at a price of 0 — sat beside the products an operator can
 * actually sell. Ranking follows what an operator means:
 *
 *  - every word typed must appear, in the name or the SAP number, in any order;
 *  - a SAP number typed in full wins outright;
 *  - words that begin a word of the name beat words found inside one — always,
 *    a match inside a word ranks below every word match — and a
 *    name that starts with the query beats one that merely contains it;
 *  - a priced, stand-alone article beats an `(in-sys)` component or one with
 *    no price, which stay findable but sink.
 */
export interface Searchable {
  name: string
  sapNr?: string
  /** List price; 0 or null marks a component or an unpriced row. */
  msrp?: number | null
}

const IN_SYSTEM = /\(in-sys\)/i

function words(text: string): string[] {
  return text.toLowerCase().split(/[\s\-–/(),]+/).filter(Boolean)
}

/** Higher is better; null when the entry does not match at all. */
export function scoreEntry(entry: Searchable, query: string): number | null {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return null
  const name = entry.name.toLowerCase()
  const sap = (entry.sapNr ?? '').toLowerCase()
  if (sap && sap === q) return 10_000

  const tokens = q.split(/\s+/).filter(Boolean)
  const nameWords = words(entry.name)
  let score = 0
  for (const t of tokens) {
    if (nameWords.includes(t)) score += 40
    else if (nameWords.some((w) => w.startsWith(t))) score += 25
    // Found only inside a word ("aramis" in "Paramiscellaneous"): a tier below
    // every word match, whatever the penalties further down.
    else if (name.includes(t)) score += 8 - 1000
    else if (sap.includes(t)) score += 5
    else return null
  }
  if (name === q) score += 500
  else if (name.startsWith(q)) score += 120
  else if (name.includes(q)) score += 30
  // Shorter names are closer to what was typed: "ARAMIS SRX" before "ARAMIS SRX Case for CF 600".
  score -= Math.min(nameWords.length, 20)
  if (IN_SYSTEM.test(entry.name)) score -= 80
  if (entry.msrp === 0 || entry.msrp === null) score -= 40
  return score
}

/** The best `limit` matches, best first; ties keep catalog order by name. */
export function searchEntries<T extends Searchable>(entries: T[], query: string, limit = 50): T[] {
  const scored: Array<[T, number]> = []
  for (const e of entries) {
    const s = scoreEntry(e, query)
    if (s !== null) scored.push([e, s])
  }
  scored.sort((a, b) => b[1] - a[1] || a[0].name.localeCompare(b[0].name))
  return scored.slice(0, limit).map(([e]) => e)
}
