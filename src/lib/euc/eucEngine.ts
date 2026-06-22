/**
 * EUC rule engine — pure, no DOM, no network.
 * Evaluates extracted EUC text against the ruleset, optionally cross-checking
 * against data derived from the open GPC order. Unit-tested with vitest.
 */
import type { EucRule, RuleSet, SectionAnchor } from './eucRules.ts'

export interface EucReference {
  expected: { destinationCountry: string; itemDescription?: string }
  order: { consigneeCompany?: string; endUserCompany?: string; systemValue?: number | null }
  fx: { orderToEur?: number }
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'manual'

export interface CheckResult {
  id: string
  title: string
  section: string
  severity: EucRule['severity']
  status: CheckStatus
  detail: string
  feedback: string
}

export interface EucReport {
  isLikelyScan: boolean
  sectionsFound: string[]
  charCount: number
  summary: Record<CheckStatus, number>
  results: CheckResult[]
  overall: 'READY' | 'REVIEW' | 'FAIL'
}

interface Sections {
  [id: string]: string
}

function norm(s: string): string {
  return (s || '').replace(/ /g, ' ').replace(/[ \t]+/g, ' ')
}

export function sliceSections(text: string, anchors: SectionAnchor[]): { sections: Sections; found: string[] } {
  const lower = norm(text).toLowerCase()
  const hits: { id: string; pos: number }[] = []
  for (const a of anchors) {
    let pos = -1
    for (const p of a.patterns) {
      const i = lower.indexOf(p.toLowerCase())
      if (i !== -1 && (pos === -1 || i < pos)) pos = i
    }
    if (pos !== -1) hits.push({ id: a.id, pos })
  }
  hits.sort((x, y) => x.pos - y.pos)
  const sections: Sections = {}
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].pos
    const end = i + 1 < hits.length ? hits[i + 1].pos : text.length
    sections[hits[i].id] = norm(text.slice(start, end))
  }
  return { sections, found: hits.map((h) => h.id) }
}

function scopeText(sections: Sections, all: string, scope?: string): string {
  if (!scope || scope === 'ALL') return all
  return sections[scope] != null ? sections[scope] : all
}

function sliceBetween(text: string, markers?: [string, string]): string {
  if (!markers || markers.length < 1) return text
  const lower = text.toLowerCase()
  const start = lower.indexOf(String(markers[0]).toLowerCase())
  if (start === -1) return text
  let end = text.length
  if (markers[1]) {
    const e = lower.indexOf(String(markers[1]).toLowerCase(), start + 1)
    if (e !== -1) end = e
  }
  return text.slice(start, end)
}

export function extractEurValue(s: string): number | null {
  const m = s.match(/(?:eur|€)\s?([0-9][0-9.,\s]{2,})/i) || s.match(/([0-9][0-9.,\s]{2,})\s?(?:eur|€)/i)
  if (!m) return null
  const digits = m[1].replace(/[^0-9]/g, '')
  if (!digits) return null
  return parseInt(digits, 10)
}

function looksFilled(sectionText: string): boolean {
  const t = sectionText || ''
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(t)) return true
  if (/\d{4,}/.test(t)) return true
  const lines = t.split(/\n|\.\s/)
  for (const ln of lines) {
    if (/,/.test(ln) && /\b[A-Za-z]{2,}\b.*\b[A-Za-z]{2,}\b/.test(ln) && ln.length < 200) {
      if (!/block letters|contact details|website/i.test(ln)) return true
    }
  }
  return false
}

function countryPresent(s: string, expectedCountry?: string): boolean {
  const t = (s || '').toLowerCase()
  if (expectedCountry && t.includes(expectedCountry.toLowerCase())) return true
  return /united states|u\.?s\.?a\.?\b/.test(t)
}

function evaluateRule(rule: EucRule, sections: Sections, all: string, ref: EucReference): CheckResult {
  const res: CheckResult = {
    id: rule.id,
    title: rule.title,
    section: rule.section,
    severity: rule.severity,
    status: 'pass',
    detail: '',
    feedback: rule.feedback || '',
  }
  const fail = (detail: string) => {
    res.status = rule.severity === 'warning' ? 'warn' : 'fail'
    res.detail = detail
  }
  const pass = (detail: string) => {
    res.status = 'pass'
    res.detail = detail
  }
  const warn = (detail: string) => {
    res.status = 'warn'
    res.detail = detail
  }

  switch (rule.type) {
    case 'manual':
      res.status = 'manual'
      res.detail = 'Reviewer must verify by eye.'
      break

    case 'all_present': {
      const t = scopeText(sections, all, rule.scope).toLowerCase()
      const missing = (rule.patterns || []).filter((p) => !t.includes(p.toLowerCase()))
      if (missing.length) fail('Not found: ' + missing.join(', '))
      else pass('All present.')
      break
    }

    case 'regex_present': {
      const t = scopeText(sections, all, rule.scope)
      const re = new RegExp(rule.pattern || '', 'i')
      if (re.test(t)) pass('Match found.')
      else fail('No match for expected pattern.')
      break
    }

    case 'section_nonempty': {
      let t = scopeText(sections, all, rule.scope)
      if (rule.between) t = sliceBetween(t, rule.between)
      if (rule.scope && sections[rule.scope] == null) warn('Section heading not found — verify manually.')
      else if (looksFilled(t)) pass('Appears filled.')
      else fail('Section appears blank / no customer data detected.')
      break
    }

    case 'country_present': {
      const t = scopeText(sections, all, rule.scope)
      if (rule.scope && sections[rule.scope] == null) warn('Section heading not found — verify manually.')
      else if (countryPresent(t, ref.expected.destinationCountry)) pass('Country present.')
      else fail('Destination country not found in section.')
      break
    }

    case 'value_rounded_1000': {
      const v = extractEurValue(scopeText(sections, all, rule.scope))
      if (v == null) warn('No EUR value detected to check rounding.')
      else if (v % 1000 === 0) pass(v.toLocaleString() + ' EUR is rounded.')
      else fail(v.toLocaleString() + ' EUR is not rounded to the nearest 1,000.')
      break
    }

    case 'value_crosscheck': {
      const v = extractEurValue(sections['B'] ?? all)
      const sys = ref.order.systemValue
      const rate = ref.fx.orderToEur
      if (sys == null || !rate) warn('No GPC system value available — cannot cross-check.')
      else if (v == null) fail('No EUR value found in Section B to compare against the order.')
      else {
        const expectedEur = Math.round((sys * rate) / 1000) * 1000
        const tol = Math.max(1000, expectedEur * 0.05)
        if (Math.abs(v - expectedEur) <= tol) pass('EUR value ≈ matches order (expected ≈ ' + expectedEur.toLocaleString() + ').')
        else fail('EUR value ' + v.toLocaleString() + ' differs from order-derived ≈ ' + expectedEur.toLocaleString() + '.')
      }
      break
    }

    case 'gpc_crosscheck': {
      const names = [ref.order.consigneeCompany, ref.order.endUserCompany].filter(Boolean) as string[]
      if (!names.length) warn('No GPC order companies available — verify addresses match the GPC manually.')
      else {
        const lower = all.toLowerCase()
        const missing = names.filter((c) => !lower.includes(c.toLowerCase()))
        if (missing.length) fail('Not found in EUC: ' + missing.join('; '))
        else pass('Order company name(s) appear in EUC.')
      }
      break
    }

    default:
      warn('Unknown rule type.')
  }
  return res
}

export function evaluateEuc(text: string, ruleset: RuleSet, reference: EucReference): EucReport {
  const { sections, found } = sliceSections(text, ruleset.sectionAnchors)
  const all = norm(text)
  const compact = all.replace(/\s+/g, ' ').trim()
  const isLikelyScan = compact.length < 200
  const results = ruleset.rules.map((r) => evaluateRule(r, sections, all, reference))

  const summary: Record<CheckStatus, number> = { pass: 0, warn: 0, fail: 0, manual: 0 }
  for (const r of results) summary[r.status]++

  return {
    isLikelyScan,
    sectionsFound: found,
    charCount: compact.length,
    summary,
    results,
    overall: summary.fail > 0 ? 'FAIL' : summary.warn > 0 ? 'REVIEW' : 'READY',
  }
}

export function buildCustomerFeedback(report: EucReport): string {
  const lines: string[] = ['EUC review — items to correct before resubmitting:', '']
  let n = 1
  for (const r of report.results) {
    if (r.status === 'fail' || r.status === 'warn') {
      lines.push(n + '. [' + r.section + '] ' + r.title)
      if (r.feedback) lines.push('   ' + r.feedback.replace(/\n/g, '\n   '))
      lines.push('')
      n++
    }
  }
  if (n === 1) lines.push('No automated issues found. Complete the manual checklist before submitting.')
  return lines.join('\n')
}
