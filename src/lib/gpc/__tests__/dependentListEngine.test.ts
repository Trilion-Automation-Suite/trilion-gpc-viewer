import { describe, it, expect } from 'vitest'
import { serializeOrderXml, text } from '../orderXml.ts'
import type { ElementValue } from '../orderXml.ts'
import { EngineCatalog, NeedsGpcError, PickError, SystemEditor, replayOrder } from '../dependentListEngine.ts'
import { config, orderWith, parse, rigPdb, savedRig } from './rigFixture.ts'
import { addSubConfiguration, renumberSubConfigurations, startDependentList } from '../dependentList.ts'

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

  it('refuses to re-price a system whose stored total it cannot reproduce', () => {
    const doc = savedRig({ 'V400 medium': 1, 'Probe A': 1 })
    const line = (doc.root.members.find(m => m.name === 'DependentListsData')!.value as ElementValue).members[0].value as ElementValue
    const total = line.members.findIndex(m => m.name === 'TotalMsrp')
    line.members[total] = { name: 'TotalMsrp', value: { kind: 'text', type: null, value: '9999' } }
    const editor = new SystemEditor(doc, config(), '1')
    expect(editor.unpriceable).toEqual([{ no: '1', itemName: 'Rig', stored: '9999 / 1192', computed: '1490 / 1192' }])
    click(editor, 'Lights', 'Light', 1)
    expect(() => editor.commit()).toThrow(NeedsGpcError)
  })

  it('prices options the file stored without a price, from the catalog, and checks itself first', () => {
    const doc = savedRig({ 'V400 medium': 1, 'Probe A': 1 })
    // Blank every option's stored price, as GPC before 2.9 wrote them.
    const line = (doc.root.members.find(m => m.name === 'DependentListsData')!.value as ElementValue).members[0].value as ElementValue
    for (const s of (line.members.find(m => m.name === 'Sections')!.value as ElementValue).members) {
      for (const a of ((s.value as ElementValue).members.find(m => m.name === 'SectionArticles')!.value as ElementValue).members) {
        const el = a.value as ElementValue
        el.members = el.members.map(m => (m.name === 'Msrp' || m.name === 'Dp' ? { name: m.name, value: { kind: 'nil' } } : m))
      }
    }
    const prices: Record<string, [number, number]> = { 'V400 medium': [200, 160], 'Frame M': [60, 48], 'Base M': [1200, 960], 'Probe A': [30, 24], Light: [10, 8], 'New rig': [0, 0] }
    const pricer = (name: string) => prices[name]
      ? { msrp: { unscaled: BigInt(prices[name][0]), scale: 0 }, dp: { unscaled: BigInt(prices[name][1]), scale: 0 } }
      : null
    expect(new SystemEditor(doc, config(), '1').unpriceable).toHaveLength(1)
    const editor = new SystemEditor(doc, config(), '1', { pricer })
    expect(editor.unpriceable).toEqual([])
    click(editor, 'Lights', 'Light', 2)
    editor.commit()
    expect(text(line, 'TotalMsrp')).toBe('1510')
  })

  it('lets a sub-configuration be picked, and leaves building it to GPC', () => {
    const doc = savedRig({ 'V400 medium': 1, 'Probe A': 1 })
    const editor = new SystemEditor(doc, config(), '1')
    click(editor, 'Care', 'Care Plan', 1)
    expect(editor.missingSubconfigs).toEqual(["'Care Plan' (section 'Care' of 'Rig')"])
    expect(() => editor.commit()).toThrow(/sub-configuration the order does not have/)
    click(editor, 'Care', 'Care Plan', 0)
    expect(editor.missingSubconfigs).toEqual([])
  })

  it('builds a sub-configuration the rules call for, when it is given a builder', () => {
    const doc = savedRig({ 'V400 medium': 1, 'Probe A': 1 })
    const editor = new SystemEditor(doc, config(), '1', {
      buildSubconfig: (parent, name) => addSubConfiguration(doc, rigPdb(), parent, name),
      renumber: () => renumberSubConfigurations(doc),
    })
    click(editor, 'Care', 'Care Plan', 1)
    expect(editor.missingSubconfigs).toEqual([])
    expect(editor.addedSubconfigs).toEqual(['Care Plan'])
    // The child's own rules ran: its lone option is forced on.
    const child = editor.view()[1]
    expect(child.no).toBe('1.1')
    expect(child.sections[0].options.map(o => `${o.name} ${o.amount} ${o.mode}`)).toEqual(['Care Year 1 SectionSpecialFunction'])
    editor.commit()
    expect(replayOrder(doc, config())).toEqual([])
    // Unticking it again takes the child away.
    const again = new SystemEditor(doc, config(), '1')
    click(again, 'Care', 'Care Plan', 0)
    expect(again.removedSubconfigs).toEqual(['Care Plan'])
  })

  it('starts a new system with nothing picked and lets the rules fill it in', () => {
    // An order that has no rig yet.
    const doc = parse(orderWith({}).replace(/<DependentListsData>[\s\S]*<\/DependentListsData>/, '<DependentListsData />'))
    const no = startDependentList(doc, rigPdb(), 'Rig')
    expect(no).toBe('1')
    const editor = new SystemEditor(doc, config(), no, { fresh: true })
    expect(picked(editor, 'System Type')).toEqual({ 'New rig': '1 SectionSpecialFunction' })
    // A new rig needs at least one volume, and until one implies it the pick-one
    // base unit is empty too; the volume is the operator's call.
    expect(editor.incomplete().map(i => i.section)).toEqual(['Volumes', 'Base Unit'])
    click(editor, 'Volumes', 'V900 large', 1)
    expect(picked(editor, 'Base Unit')).toEqual({ 'Base L': '1 Implication' })
    // Probe B and C both qualify, so the operator must choose one.
    expect(editor.incomplete().map(i => i.section)).toEqual(['Probe'])
    click(editor, 'Probe', 'Probe C', 1)
    expect(editor.incomplete()).toEqual([])
    editor.commit()
    expect(replayOrder(doc, config())).toEqual([])
  })

  it('names a missing system rather than editing something else', () => {
    expect(() => new SystemEditor(savedRig({ 'V100 small': 1, 'Probe B': 0 }), config(), '7')).toThrow(/No configured system numbered 7/)
  })

  it('is exported for the refusal the UI shows', () => {
    expect(new NeedsGpcError('x')).toBeInstanceOf(Error)
  })
})
