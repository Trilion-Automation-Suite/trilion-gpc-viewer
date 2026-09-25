import { describe, expect, it } from 'vitest'
import { isIncomplete, questionIssues } from '../questions.ts'
import type { ConfigItem } from '../../../types/order.ts'

const line = (patch: Partial<ConfigItem> = {}): ConfigItem => ({
  no: '1', label: '', category: '', name: 'Spare Parts', systemType: '',
  totalMsrp: null, totalDp: null, discountOverride: null, isHidden: false,
  isSub: false, itemType: 'freeList', sections: [], ...patch,
})

/**
 * GPC's own rule, from ConfigurationItemDataValidatorExt: a question is
 * required exactly when its text is non-blank, and the answer must then be
 * non-blank and match one of the item's formats.
 */
describe('what a line still owes', () => {
  it('says nothing about a line that is asked nothing', () => {
    expect(questionIssues(line())).toEqual([])
    expect(isIncomplete(line())).toBe(false)
  })

  it('flags an unanswered question', () => {
    const issues = questionIssues(line({ question1: 'Which dongle?' }))
    expect(issues).toEqual([{ index: 1, question: 'Which dongle?', kind: 'missing' }])
  })

  it('accepts any answer when the item states no format', () => {
    expect(questionIssues(line({ question1: 'Which dongle?', userZeissId: '3-1234567' }))).toEqual([])
  })

  it('treats whitespace as no answer at all', () => {
    expect(questionIssues(line({ question1: 'Which dongle?', userZeissId: '   ' }))[0].kind).toBe('missing')
  })

  it('checks the format when the item states one', () => {
    const asks = { question1: 'Serial?', question1Formats: ['^\\d-\\d{7}$'] }
    expect(questionIssues(line({ ...asks, userZeissId: '3-1234567' }))).toEqual([])
    expect(questionIssues(line({ ...asks, userZeissId: 'bay four' }))[0].kind).toBe('malformed')
  })

  it('accepts an answer matching any one of several formats', () => {
    const asks = { question1: 'Serial or case?', question1Formats: ['^\\d-\\d{7}$', '^CASE-\\d+$'] }
    expect(questionIssues(line({ ...asks, userZeissId: 'CASE-99' }))).toEqual([])
  })

  it('does not judge a pattern JavaScript cannot compile', () => {
    // GPC's e-mail format is a .NET regex using conditionals, (?(…)…|…),
    // which new RegExp rejects. Refusing to judge beats calling a correct
    // answer malformed because our engine is not theirs.
    const dotNetOnly = '^(?(")(".+?")|(([0-9a-zA-Z])@))$'
    expect(questionIssues(line({ question1: 'E-mail?', question1Formats: [dotNetOnly], userZeissId: 'a@b.com' }))).toEqual([])
  })

  it('reports both questions when both are owed', () => {
    const issues = questionIssues(line({ question1: 'E-mail?', question2: 'Name?' }))
    expect(issues.map(i => i.index)).toEqual([1, 2])
  })

  it('takes Reply2 as the answer to Question2', () => {
    expect(questionIssues(line({ question2: 'Name?', userName: 'Alex' }))).toEqual([])
  })
})
