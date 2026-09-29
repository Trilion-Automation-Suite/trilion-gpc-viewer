import { describe, it, expect } from 'vitest'
import { serializeOrderXml, text } from '../orderXml.ts'
import type { ElementValue } from '../orderXml.ts'
import { EngineCatalog, NeedsGpcError, PickError, SystemEditor, replayOrder } from '../dependentListEngine.ts'
import { config, savedRig } from './rigFixture.ts'

function picked(editor: SystemEditor, section: string): Record<string, string> {
  const s = editor.view()[0].sections.find(x => x.name === section)!
  return Object.fromEntries(s.options.filter(o => o.amount > 0).map(o => [o.name, `${o.amount} ${o.mode}`]))
}

function click(editor: SystemEditor, section: string, option: string, amount: number): void {
  const s = editor.view()[0].sections.find(x => x.name === section)!
  editor.pick(s.index, s.options.find(o => o.name === option)!.index, amount)
}

describe('dependent-list rules engine', () => {
  it('derives what the operator\'s picks imply', () => {
    const editor = new SystemEditor(savedRig({ 'V400 medium': 1, 'V600 medium': 1, 'Probe A': 1 }), config(), '1')
    // A pick-one section with a single option is forced, not defaulted.
    expect(picked(editor, 'System Type')).toEqual({ 'New rig': '1 SectionSpecialFunction' })
    // Two volumes on the same frame imply it once, not twice.
    expect(picked(editor, 'Frames')).toEqual({ 'Frame M': '1 Implication' })
    expect(picked(editor, 'Base Unit')).toEqual({ 'Base M': '1 Implication' })
  })

  it('replays a file it saved without a single difference', () => {
    const doc = savedRig({ 'V100 small': 1, 'V900 large': 1, 'Probe B': 1, Light: 2 })
    expect(replayOrder(doc, config())).toEqual([])
  })

  it('keeps only the largest base unit when volumes span frames', () => {
    const editor = new SystemEditor(savedRig({ 'V400 medium': 1, 'Probe A': 1 }), config(), '1')
    click(editor, 'Volumes', 'V900 large', 1)
    expect(picked(editor, 'Frames')).toEqual({ 'Frame M': '1 Implication', 'Frame L': '1 Implication' })
    expect(picked(editor, 'Base Unit')).toEqual({ 'Base L': '1 Implication' })
  })

  it('takes away an option whose precondition goes, and flags the section it leaves empty', () => {
    const editor = new SystemEditor(savedRig({ 'V400 medium': 1, 'V600 medium': 1, 'Probe A': 1 }), config(), '1')
    click(editor, 'Volumes', 'V400 medium', 0)
    expect(picked(editor, 'Probe')).toEqual({})
    expect(editor.incomplete().map(i => i.section)).toEqual(['Probe'])
    // B and C are offered, because V600 is still picked; the operator has to choose.
    click(editor, 'Probe', 'Probe B', 1)
    expect(editor.incomplete()).toEqual([])
    expect(editor.changes().map(c => `${c.option} ${c.from}->${c.to}`)).toEqual([
      'V400 medium 1->0',
      'Probe A 1->0',
      'Probe B 0->1',
    ])
  })

  it('forces the only option a pick-one section has left', () => {
    // With V400 alone, Probe A is the one probe whose precondition holds, so the
    // operator has no choice to make and GPC makes it.
    const editor = new SystemEditor(savedRig({ 'V400 medium': 1 }), config(), '1')
    expect(picked(editor, 'Probe')).toEqual({ 'Probe A': '1 SectionSpecialFunction' })
    expect(editor.incomplete()).toEqual([])
  })

  it('drops a frame once no volume needs it', () => {
    const editor = new SystemEditor(savedRig({ 'V100 small': 1, 'V400 medium': 1, 'Probe A': 1 }), config(), '1')
    click(editor, 'Volumes', 'V100 small', 0)
    expect(picked(editor, 'Frames')).toEqual({ 'Frame M': '1 Implication' })
  })

  it('refuses what the configurator would not let the operator click', () => {
    const full = new SystemEditor(
      savedRig({ 'V100 small': 1, 'V400 medium': 1, 'V600 medium': 1, 'Probe A': 1 }), config(), '1')
    expect(() => click(full, 'Volumes', 'V900 large', 1)).toThrow(/allows 1–3 and is full\. At most 3 volumes/)
    expect(() => click(full, 'Frames', 'Frame M', 0)).toThrow(PickError)
    // Probe B needs V600 or V900; neither is picked here.
    const small = new SystemEditor(savedRig({ 'V100 small': 1, 'V400 medium': 1, 'Probe A': 1 }), config(), '1')
    expect(() => click(small, 'Probe', 'Probe B', 1)).toThrow(/not available/)
  })

  it('switches a radio section to the new pick', () => {
    const editor = new SystemEditor(savedRig({ 'V600 medium': 1, 'V400 medium': 1, 'Probe A': 1 }), config(), '1')
    click(editor, 'Probe', 'Probe B', 1)
    expect(picked(editor, 'Probe')).toEqual({ 'Probe B': '1 UserChoice' })
  })

  it('re-prices the system and the order from the prices the file already carries', () => {
    const doc = savedRig({ 'V400 medium': 1, 'Probe A': 1 })
    // 200 + frame 60 + base 1200 + probe 30
    expect(text(doc.root, 'Msrp')).toBe('1490')
    expect(text(doc.root, 'Dp')).toBe('1192')
    const editor = new SystemEditor(doc, config(), '1')
    click(editor, 'Lights', 'Light', 3)
    editor.commit()
    const item = doc.root.members.find(m => m.name === 'DependentListsData')!.value as ElementValue
    const line = item.members[0].value as ElementValue
    expect(text(line, 'TotalMsrp')).toBe('1520')
    expect(text(line, 'TotalDp')).toBe('1216')
    expect(text(doc.root, 'Msrp')).toBe('1520')
    expect(text(doc.root, 'FinalPriceForEndCustomer')).toBe('1520')
    // ApplySplit: Msrp x (1 - margin + discount/2), which is Dp again.
    expect(text(doc.root, 'OrderValueToGom')).toBe('1216.0')
  })

  it('writes amounts and modes through, and leaves the rest of the order alone', () => {
    const doc = savedRig({ 'V400 medium': 1, 'Probe A': 1 })
    const before = new TextDecoder().decode(serializeOrderXml(doc))
    const editor = new SystemEditor(doc, config(), '1')
    click(editor, 'Volumes', 'V900 large', 1)
    editor.commit()
    const after = new TextDecoder().decode(serializeOrderXml(doc))
    const changedLines = after.split('\r\n').filter((l, i) => l !== before.split('\r\n')[i])
    expect(changedLines.every(l => /<(Amount|AmountMode|TotalMsrp|TotalDp|Msrp|Dp|FinalPrice\w*|OrderValueToGom\w*)>/.test(l))).toBe(true)
  })

  it('cancels by discarding the document: an uncommitted editor changes nothing', () => {
    const doc = savedRig({ 'V400 medium': 1, 'Probe A': 1 })
    const before = new TextDecoder().decode(serializeOrderXml(doc))
    const editor = new SystemEditor(doc, new EngineCatalog(config()), '1')
    click(editor, 'Volumes', 'V900 large', 1)
    // Amounts live on the editor's own state until commit.
    expect(new TextDecoder().decode(serializeOrderXml(doc))).toBe(before)
  })

  it('names a missing system rather than editing something else', () => {
    expect(() => new SystemEditor(savedRig({ 'V100 small': 1, 'Probe B': 0 }), config(), '7')).toThrow(/No configured system numbered 7/)
  })

  it('is exported for the refusal the UI shows', () => {
    expect(new NeedsGpcError('x')).toBeInstanceOf(Error)
  })
})
