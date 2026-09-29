import { describe, it, expect } from 'vitest'
import { parseOrderXml, text } from '../orderXml.ts'
import type { ElementValue } from '../orderXml.ts'
import type { GpcContainer } from '../container.ts'
import { planOrderBlock } from '../orderBlock.ts'
import type { OrderBlock } from '../orderBlock.ts'
import { applyOrderBlockItems } from '../applyOrderBlock.ts'
import { EngineCatalog, SystemEditor, replayOrder } from '../dependentListEngine.ts'

/**
 * A fictional catalog with the shapes a real measuring system has, and none of
 * its content:
 *
 *  - "Rig Adjustable": the camera is chosen with a selector under Sensor Head
 *    (SENSORTYPE trait) that implies the camera itself under a read-only
 *    Cameras section — so the camera line cannot be clicked, only reached.
 *    The adjustable frame (CAMERAFRAME trait) is offered only for its camera.
 *    The rack case is offered only once Rack Design is the computer case, and
 *    then comes as an in-system twin sharing the stand-alone article's SAP.
 *  - "Rig Fixed": the same camera family on a fixed frame section.
 *  - "Scanner": a sensor type that implies a workstation, which must not make
 *    a workstation look like its camera.
 */
const OPERAND = `<ArticleParams><ArrayOfParamOperand>
  <ParamOperand><Operator>35</Operator><string>amount</string></ParamOperand>
  <ParamOperand><Operator>61</Operator></ParamOperand>
  <ParamOperand><Operator>43</Operator><string>amount</string></ParamOperand>
</ArrayOfParamOperand></ArticleParams>`

const implies = (list: string, section: string, target: string) => `
  <Implication><DependentListReference>${list}</DependentListReference><SectionReference>${section}</SectionReference>
    <ArticleLongNames><string>${target}</string></ArticleLongNames><ArticleMinValues /><ArticleMaxValues />
    <Id>1</Id><LogicalConnector>Or</LogicalConnector><SectionLogicalConnector>And</SectionLogicalConnector>
    ${OPERAND}<ImplicationSpecialFunction>None</ImplicationSpecialFunction><ShowSection>false</ShowSection></Implication>`

const requires = (list: string, section: string, names: string[], logical = 'Or') => `
  <Precondition><DependentListReference>${list}</DependentListReference><SectionReference>${section}</SectionReference>
    <ArticleLongNames>${names.map(n => `<string>${n}</string>`).join('')}</ArticleLongNames>
    <ArticleMinValues>${names.map(() => '<int>0</int>').join('')}</ArticleMinValues>
    <ArticleMaxValues>${names.map(() => '<int>2147483647</int>').join('')}</ArticleMaxValues>
    <Id>1</Id><LogicalConnector>${logical}</LogicalConnector><SectionLogicalConnector>And</SectionLogicalConnector></Precondition>`

interface Opt { name: string; pre?: string; imp?: string; def?: number }
const section = (name: string, mode: string, opts: Opt[], extra: { traits?: string[]; special?: string } = {}) => `
  <Section><LongName>${name}</LongName><SectionSpecialFunction>${extra.special ?? 'None'}</SectionSpecialFunction>
    <MandatoryComment>false</MandatoryComment><Description />
    <Selection><SelectionMode>${mode}</SelectionMode></Selection>
    <Articles>${opts.map(o => `
      <SectionArticle><LongName>${o.name}</LongName><Preconditions>${o.pre ?? ''}</Preconditions>
        <Implications>${o.imp ?? ''}</Implications><Step>1</Step><DefaultAmount>${o.def ?? 0}</DefaultAmount><TechCategory>0</TechCategory></SectionArticle>`).join('')}
    </Articles>
    <SAPCharacterTraitNames>${(extra.traits ?? ['']).map(t => t ? `<string>${t}</string>` : '<string />').join('')}</SAPCharacterTraitNames>
    <IsSubconfiguration>false</IsSubconfiguration></Section>`

const computerSections = (list: string) =>
  section('Computer', 'ExactlyOne', [{ name: 'Workstation L' }, { name: 'Workstation S' }]) +
  section('Computer Case', 'ExactlyOne', [
    { name: 'Rack Design', pre: requires(list, 'Computer', ['Workstation L', 'Workstation S']) },
    { name: 'Desk', pre: requires(list, 'Computer', ['Workstation L', 'Workstation S']) },
  ], { special: 'HideArticleSectionIfNoChoice' }) +
  section('Case 19"', 'OneOrMore', [
    { name: 'Case 19 (in-sys)', pre: requires(list, 'Computer Case', ['Rack Design']) },
  ], { special: 'HideAlwaysAutoSelectMaxQuantity' })

const RIGA = `
  <DependentList><DependentListName>RIGA</DependentListName><Sections>
    ${section('Sensor Head', 'ExactlyOne', [
      { name: 'Camera X - select', imp: implies('RIGA', 'Cameras', 'Rig Camera X') + implies('RIGA', 'Software License', 'Driver X').replace('<Id>1</Id>', '<Id>2</Id>') },
      { name: 'Camera Y - select', imp: implies('RIGA', 'Cameras', 'Rig Camera Y') },
    ], { traits: ['A300_GOM_SENSORTYPE'] })}
    ${section('Cameras', 'OneOrMore', [{ name: 'Rig Camera X' }, { name: 'Rig Camera Y' }], { special: 'ReadOnly' })}
    ${section('Camera Frame', 'ExactlyOne', [
      { name: 'Frame 800 for X', pre: requires('RIGA', 'Cameras', ['Rig Camera X']) },
      { name: 'Frame 800 for Y', pre: requires('RIGA', 'Cameras', ['Rig Camera Y']) },
    ], { traits: ['A300_GOM_CAMERAFRAME'] })}
    ${computerSections('RIGA')}
    ${section('Software License', 'OneOrMore', [{ name: 'Driver X' }, { name: 'Driver Y' }], { special: 'ReadOnly' })}
  </Sections></DependentList>`

const RIGF = `
  <DependentList><DependentListName>RIGF</DependentListName><Sections>
    ${section('Sensor Head', 'ExactlyOne', [{ name: 'Rig Camera X' }], { traits: ['A300_GOM_SENSORTYPE'] })}
    ${section('Camera Frames for Rig Fixed', 'ExactlyOne', [{ name: 'Fixed Frame 600' }, { name: 'Fixed Frame 1200' }])}
    ${computerSections('RIGF')}
  </Sections></DependentList>`

const SCAN = `
  <DependentList><DependentListName>SCAN</DependentListName><Sections>
    ${section('Sensor Head', 'ExactlyOne', [{ name: 'Scanner Q', imp: implies('SCAN', 'Computer', 'Workstation L') }], { traits: ['A300_GOM_SENSORTYPE'] })}
    ${computerSections('SCAN')}
  </Sections></DependentList>`

const ARTICLES: Array<[string, string, number]> = [
  // name, SAP, price
  ['Camera X - select', '', 0], ['Camera Y - select', '', 0],
  ['Rig Camera X', 'S-CAMX', 5000], ['Rig Camera Y', 'S-CAMY', 6000],
  ['Frame 800 for X', 'S-F800X', 700], ['Frame 800 for Y', 'S-F800Y', 700],
  ['Fixed Frame 600', 'S-FF600', 900], ['Fixed Frame 1200', 'S-FF1200', 900],
  ['Workstation L', 'S-WSL', 3000], ['Workstation S', 'S-WSS', 2000],
  ['Rack Design', '', 400], ['Desk', '', 0],
  ['Case 19 (in-sys)', 'S-RACK', 0], ['Rack Design Case 19Zoll', 'S-RACK', 400],
  ['Driver X', 'S-DRVX', 1000], ['Driver Y', 'S-DRVY', 1000],
  ['Scanner Q', 'S-SCANQ', 20000],
  ['Marker Kit', 'S-MARK', 50],
]

const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData>
  <ParametersData><HandlingFeeDisplayName>Handling Fee</HandlingFeeDisplayName><VersionName>TESTPDB</VersionName></ParametersData>
  <UsersData><Users><UsersItem><Username>tester</Username><PriceLists><PriceListsItem>Partner</PriceListsItem></PriceLists><OrderValueToGomModel>NoSplit</OrderValueToGomModel></UsersItem></Users></UsersData>
  <ConfigurationItemsData><ConfigurationItems>
    <ConfigurationItem><GroupLevel1>System</GroupLevel1><Name>Rig Adjustable</Name><WorksheetArticleFilter>RIGA</WorksheetArticleFilter><ItemType>DependentList</ItemType><AsSubItemOnly>false</AsSubItemOnly></ConfigurationItem>
    <ConfigurationItem><GroupLevel1>System</GroupLevel1><Name>Rig Fixed</Name><WorksheetArticleFilter>RIGF</WorksheetArticleFilter><ItemType>DependentList</ItemType><AsSubItemOnly>false</AsSubItemOnly></ConfigurationItem>
    <ConfigurationItem><GroupLevel1>System</GroupLevel1><Name>Scanner</Name><WorksheetArticleFilter>SCAN</WorksheetArticleFilter><ItemType>DependentList</ItemType><AsSubItemOnly>false</AsSubItemOnly></ConfigurationItem>
    <ConfigurationItem><GroupLevel1>Services</GroupLevel1><Name>Spare Parts</Name><WorksheetArticleFilter>&lt;Articles&gt;spare</WorksheetArticleFilter><ItemType>FreeList</ItemType></ConfigurationItem>
  </ConfigurationItems></ConfigurationItemsData>
  <DependentListsData><DependentLists>${RIGA}${RIGF}${SCAN}</DependentLists></DependentListsData>
  <ArticlesData><Articles>
    ${ARTICLES.map(([n, sap, price]) => `<Article><LongName>${n}</LongName>${sap ? `<SapNr>${sap}</SapNr>` : ''}<FilterTags>spare</FilterTags><MPG>Parts</MPG>
      <ArticlePriceLists><ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp>${price}</Dp><Msrp>${price}</Msrp></ArticlePriceList></ArticlePriceLists></Article>`).join('\n    ')}
  </Articles></ArticlesData>
</AdministrationData>`

const ORDER = `<?xml version="1.0" encoding="utf-8"?>\r
<OrderData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\r
  <DependentListsData />\r
  <FreeArticlesData />\r
  <FreeListArticlesData />\r
  <SupportArticlesData />\r
  <Currency>\r
    <Iso>EUR</Iso>\r
    <ExchangeRate>1</ExchangeRate>\r
  </Currency>\r
  <Msrp>0</Msrp>\r
  <Dp>0</Dp>\r
  <PriceList>Partner</PriceList>\r
  <Username>tester</Username>\r
</OrderData>`

const pdb = (): GpcContainer => ({
  dosTime: 0,
  dosDate: 0,
  entries: [{ name: 'config.xml', data: new TextEncoder().encode(CONFIG), method: 8 }],
})
const config = (): ElementValue =>
  parseOrderXml(new TextEncoder().encode(CONFIG.replace('<AdministrationData>', '<OrderData>').replace('</AdministrationData>', '</OrderData>'))).root

const article = (name: string, sapNr?: string, amount = 1) => ({ type: 'article' as const, name, ...(sapNr ? { sapNr } : {}), amount })
const block = (items: OrderBlock['items']): OrderBlock => ({ gpcOrder: 1, items })

function picked(no: string, doc: ReturnType<typeof parseOrderXml>): Record<string, string[]> {
  const editor = new SystemEditor(doc, new EngineCatalog(config()), no)
  const out: Record<string, string[]> = {}
  for (const s of editor.view()[0].sections) {
    const on = s.options.filter(o => o.amount > 0).map(o => o.name)
    if (on.length) out[s.name] = on
  }
  return out
}

describe('a sales order becomes the system it describes', () => {
  // Lines in the order a sales order would list them: base before head.
  const RIG_ORDER = [
    article('Frame 800 for X', 'S-F800X'),
    article('Rig Camera X', 'S-CAMX'),
    article('Workstation L', 'S-WSL'),
    article('Rack Design Case 19Zoll', 'S-RACK'),
    article('Marker Kit', 'S-MARK'),
    { type: 'license' as const, name: 'Driver X' },
  ]

  it('recognises the system from its camera and its base, and nothing else', () => {
    const plan = planOrderBlock(block(RIG_ORDER), pdb())
    expect(plan.systems.map(s => [s.itemName, s.camera, s.base])).toEqual([['Rig Adjustable', 1, 0]])
    // The workstation and the rack are options of the system; the marker kit is not.
    expect(plan.systems[0].members.sort()).toEqual([0, 1, 2, 3])
  })

  it('builds one configured line: the camera through its selector, the rack through its precondition', () => {
    const doc = parseOrderXml(new TextEncoder().encode(ORDER))
    const report = applyOrderBlockItems(doc, pdb(), planOrderBlock(block(RIG_ORDER), pdb()))
    expect(report.failed).toEqual([])
    expect(picked('1', doc)).toEqual({
      'Sensor Head': ['Camera X - select'],
      Cameras: ['Rig Camera X'],
      'Camera Frame': ['Frame 800 for X'],
      Computer: ['Workstation L'],
      'Computer Case': ['Rack Design'],
      'Case 19"': ['Case 19 (in-sys)'],
      'Software License': ['Driver X'],
    })
    // The licence came with the camera, so the block's licence line is not added again;
    // the marker kit is not an option of the system and stays a line of its own.
    expect(report.added).toContain('Driver X: already in 1 Rig Adjustable')
    expect(report.added).toContain('1 × Marker Kit')
    expect(replayOrder(doc, config())).toEqual([])
    // 5000 camera + 700 frame + 3000 workstation + 400 rack design + 1000 driver, + 50 markers
    expect(text(doc.root, 'Msrp')).toBe('10150')
  })

  it('takes a fixed base to the fixed system', () => {
    const plan = planOrderBlock(block([article('Rig Camera X', 'S-CAMX'), article('Fixed Frame 600', 'S-FF600')]), pdb())
    expect(plan.systems.map(s => s.itemName)).toEqual(['Rig Fixed'])
  })

  it('does not build a system from a camera with no base', () => {
    // A bare camera could be a spare or a second sensor; that is the operator's call.
    const plan = planOrderBlock(block([article('Rig Camera X', 'S-CAMX'), article('Workstation L', 'S-WSL')]), pdb())
    expect(plan.systems).toEqual([])
  })

  it('does not take a workstation for a camera just because a sensor implies one', () => {
    const plan = planOrderBlock(block([article('Workstation L', 'S-WSL'), article('Marker Kit', 'S-MARK')]), pdb())
    expect(plan.systems).toEqual([])
  })

  it('recognises a system with no base to choose from its camera alone', () => {
    const plan = planOrderBlock(block([article('Scanner Q', 'S-SCANQ'), article('Workstation S', 'S-WSS')]), pdb())
    expect(plan.systems.map(s => [s.itemName, s.members.sort()])).toEqual([['Scanner', [0, 1]]])
  })
})
