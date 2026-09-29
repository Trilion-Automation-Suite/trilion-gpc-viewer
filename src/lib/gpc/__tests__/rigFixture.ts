import { parseOrderXml, serializeOrderXml } from '../orderXml.ts'
import type { ElementValue, OrderDocument } from '../orderXml.ts'
import { SystemEditor } from '../dependentListEngine.ts'

/**
 * A miniature, fictional measuring rig with the rule shapes a real system uses:
 *
 *  - `Volumes` allows 1–3 picks (MinXMaxY). Each volume implies the frame it
 *    mounts on (ConsolidatedUnique: two volumes on one frame imply it once) and
 *    a base unit (ConsolidatedLargestOnly: only the highest-ranked survives).
 *  - `Probe` is a radio section whose options are offered only with certain
 *    volumes — the precondition that makes one pick take another away.
 *  - `Lights` is a quantity section.
 *
 * Nothing here is catalog content; names and prices are made up.
 */
const imp = (id: number, section: string, target: string, special = 'None') => `
  <Implication>
    <DependentListReference>RIG</DependentListReference><SectionReference>${section}</SectionReference>
    <ArticleLongNames><string>${target}</string></ArticleLongNames>
    <ArticleMinValues /><ArticleMaxValues />
    <Id>${id}</Id><LogicalConnector>Or</LogicalConnector><SectionLogicalConnector>And</SectionLogicalConnector>
    <ArticleParams><ArrayOfParamOperand>
      <ParamOperand><Operator>35</Operator><string>amount</string></ParamOperand>
      <ParamOperand><Operator>61</Operator></ParamOperand>
      <ParamOperand><Operator>43</Operator><string>amount</string></ParamOperand>
    </ArrayOfParamOperand></ArticleParams>
    <ImplicationSpecialFunction>${special}</ImplicationSpecialFunction><ShowSection>false</ShowSection>
  </Implication>`

const pre = (section: string, names: string[]) => `
  <Precondition>
    <DependentListReference>RIG</DependentListReference><SectionReference>${section}</SectionReference>
    <ArticleLongNames>${names.map(n => `<string>${n}</string>`).join('')}</ArticleLongNames>
    <ArticleMinValues>${names.map(() => '<int>0</int>').join('')}</ArticleMinValues>
    <ArticleMaxValues>${names.map(() => '<int>2147483647</int>').join('')}</ArticleMaxValues>
    <Id>1</Id><LogicalConnector>Or</LogicalConnector><SectionLogicalConnector>And</SectionLogicalConnector>
  </Precondition>`

interface Opt { name: string; pre?: string; imps?: string; max?: number; def?: number }
interface Sec { name: string; mode: string; x?: number; y?: number; opts: Opt[]; note?: string; sub?: boolean }

const VOLUME = (name: string, frame: string, base: string): Opt => ({
  name,
  imps: imp(1, 'Frames', frame, 'ConsolidatedUnique') + imp(2, 'Base Unit', base, 'ConsolidatedLargestOnly'),
})

const SECTIONS: Sec[] = [
  { name: 'System Type', mode: 'ExactlyOne', opts: [{ name: 'New rig', def: 1 }] },
  {
    name: 'Volumes', mode: 'MinXMaxY', x: 1, y: 3, note: 'At most 3 volumes',
    opts: [
      VOLUME('V100 small', 'Frame S', 'Base S'),
      VOLUME('V400 medium', 'Frame M', 'Base M'),
      VOLUME('V600 medium', 'Frame M', 'Base M'),
      VOLUME('V900 large', 'Frame L', 'Base L'),
    ],
  },
  { name: 'Frames', mode: 'OneOrMore', opts: [{ name: 'Frame S' }, { name: 'Frame M' }, { name: 'Frame L' }] },
  { name: 'Base Unit', mode: 'ExactlyOne', opts: [{ name: 'Base S' }, { name: 'Base M' }, { name: 'Base L' }] },
  {
    name: 'Probe', mode: 'ExactlyOne',
    opts: [
      { name: 'Probe A', pre: pre('Volumes', ['V400 medium']) },
      { name: 'Probe B', pre: pre('Volumes', ['V600 medium', 'V900 large']) },
      { name: 'Probe C', pre: pre('Volumes', ['V600 medium', 'V900 large']) },
    ],
  },
  { name: 'Lights', mode: 'OneOrMore', opts: [{ name: 'Light', max: 5 }] },
  // Picking this attaches a whole child line; no fixture order carries one.
  { name: 'Care', mode: 'ZeroOrOne', sub: true, opts: [{ name: 'Care Plan' }] },
]

const PRICES: Record<string, [number, number]> = {
  'New rig': [0, 0], 'V100 small': [100, 80], 'V400 medium': [200, 160], 'V600 medium': [200, 160],
  'V900 large': [300, 240], 'Frame S': [50, 40], 'Frame M': [60, 48], 'Frame L': [70, 56],
  'Base S': [1000, 800], 'Base M': [1200, 960], 'Base L': [1500, 1200],
  'Probe A': [30, 24], 'Probe B': [30, 24], 'Probe C': [35, 28], Light: [10, 8], 'Care Plan': [0, 0],
}
const RANKING: Record<string, number> = { 'Base S': 1, 'Base M': 2, 'Base L': 3 }

export const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData>
  <UsersData><Users><UsersItem><Username>tester</Username><DirectSales>false</DirectSales><OrderValueToGomModel>ApplySplit</OrderValueToGomModel></UsersItem></Users></UsersData>
  <ConfigurationItemsData><ConfigurationItems>
    <ConfigurationItem><Name>Rig</Name><WorksheetArticleFilter>RIG</WorksheetArticleFilter><ItemType>DependentList</ItemType></ConfigurationItem>
    <ConfigurationItem><Name>Care Plan</Name><WorksheetArticleFilter>CARE</WorksheetArticleFilter><ItemType>DependentList</ItemType></ConfigurationItem>
  </ConfigurationItems></ConfigurationItemsData>
  <ArticlesData><Articles>
    ${Object.keys(PRICES).map(n => `<Article><LongName>${n}</LongName>${RANKING[n] ? `<Ranking>${RANKING[n]}</Ranking>` : ''}<Unit>pcs</Unit></Article>`).join('\n    ')}
  </Articles></ArticlesData>
  <DependentListsData><DependentLists><DependentList>
    <DependentListName>RIG</DependentListName>
    <Sections>${SECTIONS.map(s => `
      <Section>
        <LongName>${s.name}</LongName><SectionSpecialFunction>None</SectionSpecialFunction><MandatoryComment>false</MandatoryComment>
        <Description>${s.note ?? ''}</Description>
        <Selection>${s.x !== undefined ? `<X>${s.x}</X><Y>${s.y}</Y>` : ''}<SelectionMode>${s.mode}</SelectionMode></Selection>
        <Articles>${s.opts.map(o => `
          <SectionArticle>
            <LongName>${o.name}</LongName>
            <Preconditions>${o.pre ?? ''}</Preconditions>
            <Implications>${o.imps ?? ''}</Implications>
            ${o.max ? `<MaxQuantity>${o.max}</MaxQuantity>` : ''}
            <Step>1</Step><DefaultAmount>${o.def ?? 0}</DefaultAmount><TechCategory>0</TechCategory>
          </SectionArticle>`).join('')}
        </Articles>
        <IsSubconfiguration>${s.sub ? 'true' : 'false'}</IsSubconfiguration>
      </Section>`).join('')}
    </Sections>
  </DependentList></DependentLists></DependentListsData>
</AdministrationData>`

/** An order holding the rig with only the operator's own picks set, as if typed in. */
export function orderWith(picks: Record<string, number>): string {
  const sections = SECTIONS.map(s => `
      <SectionScreenData>
        <Name>${s.name}</Name>
        <SectionArticles>${s.opts.map(o => `
          <SectionArticleScreenData>
            <Amount>${picks[o.name] ?? 0}</Amount><Step>1</Step>
            <Msrp>${PRICES[o.name][0]}</Msrp><Dp>${PRICES[o.name][1]}</Dp>
            <Name>${o.name}</Name><AmountMode>${picks[o.name] ? 'UserChoice' : 'None'}</AmountMode>
          </SectionArticleScreenData>`).join('')}
        </SectionArticles>
      </SectionScreenData>`).join('')
  return `<?xml version="1.0" encoding="utf-8"?>
<OrderData>
  <DependentListsData>
    <DependentListScreenData>
      <ConfigurationItem><Name>Rig</Name><Parameter /><WorksheetArticleFilter>RIG</WorksheetArticleFilter></ConfigurationItem>
      <UseInCalculation>true</UseInCalculation>
      <No>1</No>
      <TotalDp xsi:nil="true" />
      <TotalMsrp xsi:nil="true" />
      <Sections>${sections}
      </Sections>
      <SubConfigurations />
    </DependentListScreenData>
  </DependentListsData>
  <DestinationNew><Iso>US</Iso></DestinationNew>
  <DiscountForCustomer>0</DiscountForCustomer>
  <FinalPriceForEndCustomer>0</FinalPriceForEndCustomer>
  <FinalPriceForEndCustomerWithHandlingFee>0</FinalPriceForEndCustomerWithHandlingFee>
  <HandlingFee>0</HandlingFee>
  <Msrp>0</Msrp>
  <Dp>0</Dp>
  <OrderValueToGom>0</OrderValueToGom>
  <OrderValueToGomWithHandlingFee>0</OrderValueToGomWithHandlingFee>
  <Username>tester</Username>
</OrderData>`
}

export const config = (): ElementValue =>
  parseOrderXml(new TextEncoder().encode(CONFIG.replace('<AdministrationData>', '<OrderData>').replace('</AdministrationData>', '</OrderData>'))).root

export const parse = (xml: string): OrderDocument => parseOrderXml(new TextEncoder().encode(xml))

/** The rig as the configurator would have saved it: the picks, plus everything they imply. */
export function savedRig(picks: Record<string, number>): OrderDocument {
  const doc = parse(orderWith(picks))
  const editor = new SystemEditor(doc, config(), '1')
  editor.commit()
  return parse(new TextDecoder().decode(serializeOrderXml(doc)))
}

