/**
 * Whether a line has answered what the catalog asks of it.
 *
 * This is GPC's own rule, from `ConfigurationItemDataValidatorExt`: a question
 * is required exactly when the configuration item's question text is non-blank,
 * and the answer must then be non-blank *and* match one of the question's
 * formats. `GpcFormatValidator.IsValid` treats an empty format list as "any
 * answer will do", and otherwise accepts an answer matching any one format.
 *
 * GPC marks a line that fails this, and will not finalize an order containing
 * one. The viewer should say the same thing, in the same place.
 */
import type { ConfigItem } from '../../types/order.js'

export interface QuestionIssue {
  /** Which reply is at fault, in the order GPC asks them. */
  index: 1 | 2 | 3
  /** The catalog's wording, to show the operator. */
  question: string
  /** `missing` — nothing entered. `malformed` — entered, but no format matches. */
  kind: 'missing' | 'malformed'
}

/** `d`, `m`, `y` and separators only: a date format, not a regular expression. */
function looksLikeDateFormat(format: string): boolean {
  return /^[dmy]+[./-][dmy]+[./-][dmy]+$/i.test(format.trim())
}

/**
 * One format, checked as far as JavaScript can.
 *
 * GPC's patterns are .NET regular expressions and some use constructs
 * JavaScript has no equivalent for — the e-mail format on a maintenance line
 * uses conditionals, `(?(…)…|…)`, which `new RegExp` rejects outright. A
 * pattern that cannot be compiled is treated as satisfied rather than failed:
 * refusing to judge is honest, and flagging a correct answer as malformed
 * because our engine is not theirs would be worse than saying nothing.
 */
function matchesFormat(value: string, format: string): boolean {
  if (!format.trim()) return true
  if (looksLikeDateFormat(format)) {
    // GPC parses the date itself rather than matching; a loose shape check is
    // all that is wanted here, since the field is free text either way.
    return /\d/.test(value)
  }
  try {
    return new RegExp(format).test(value)
  } catch {
    return true
  }
}

function satisfies(value: string, formats: readonly string[] | undefined): boolean {
  if (!formats || formats.length === 0) return true
  return formats.some((format) => matchesFormat(value, format))
}

/**
 * What this line still owes, in GPC's order. Empty when the line is complete —
 * which includes a line that is asked nothing at all.
 */
export function questionIssues(item: ConfigItem): QuestionIssue[] {
  const asked: Array<[1 | 2 | 3, string | undefined, string | undefined, readonly string[] | undefined]> = [
    [1, item.question1, item.userZeissId, item.question1Formats],
    [2, item.question2, item.userName, item.question2Formats],
    [3, item.question3, item.reply3, item.question3Formats],
  ]
  const issues: QuestionIssue[] = []
  for (const [index, question, reply, formats] of asked) {
    if (!question || !question.trim()) continue
    const value = (reply ?? '').trim()
    if (value === '') issues.push({ index, question, kind: 'missing' })
    else if (!satisfies(value, formats)) issues.push({ index, question, kind: 'malformed' })
  }
  return issues
}

/** True when anything on this line would stop GPC finalizing the order. */
export function isIncomplete(item: ConfigItem): boolean {
  return questionIssues(item).length > 0
}
