import { describe, it, expect } from 'vitest'
import { addDependentList, addDependentListSupport } from '../dependentList.ts'
import { recalculateOrder } from '../addItem.ts'
import { parseOrderXml, serializeOrderXml } from '../orderXml.ts'
import type { GpcContainer } from '../container.ts'

/**
 * A miniature catalog with both nestings.
 *
 * `System` has a section flagged `IsSubconfiguration`, whose single option
 * names the configuration item `Care Plan` rather than an article — selecting
 * it is what opens a child line. `Dongle Care` is the list a maintenance
 * agreement is configured from; no configuration item points at it, because
 * the configurator invents the `DongleList` item for it at runtime.
 */
const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData>
  <ParametersData>
    <HandlingFeeDisplayName>Handling Fee</HandlingFeeDisplayName>
    <VersionName>TESTPDB</VersionName>
  </ParametersData>
  <ConfigurationItemsData>
    <ConfigurationItems>
      <ConfigurationItem>
        <AsSubItemOnly>false</AsSubItemOnly><Name>System</Name>
        <WorksheetArticleFilter>SYS</WorksheetArticleFilter><ItemType>DependentList</ItemType>
      </ConfigurationItem>
      <ConfigurationItem>
        <AsSubItemOnly>true</AsSubItemOnly><Name>Care Plan</Name>
        <WorksheetArticleFilter>CARE</WorksheetArticleFilter><ItemType>DependentList</ItemType>
      </ConfigurationItem>
      <ConfigurationItem>
        <Name>Maintenance Agreement</Name>
        <WorksheetArticleFilter>&lt;Support&gt;DONGLE</WorksheetArticleFilter>
        <ItemType>Supportextension</ItemType>
      </ConfigurationItem>
    </ConfigurationItems>
  </ConfigurationItemsData>
  <DependentListsData>
    <DependentLists>
      <DependentList>
        <DependentListName>SYS</DependentListName>
        <Sections>
          <Section>
            <LongName>Options</LongName><IsSubconfiguration>false</IsSubconfiguration>
            <Articles><SectionArticle><LongName>Base Unit</LongName><Step>1</Step><DefaultAmount>0</DefaultAmount></SectionArticle></Articles>
            <SAPCharacterTraitNames><string /></SAPCharacterTraitNames>
          </Section>
          <Section>
            <LongName>Add a care plan</LongName><IsSubconfiguration>true</IsSubconfiguration>
            <Articles><SectionArticle><LongName>Care Plan</LongName><Step>1</Step><DefaultAmount>0</DefaultAmount></SectionArticle></Articles>
            <SAPCharacterTraitNames><string /></SAPCharacterTraitNames>
          </Section>
        </Sections>
      </DependentList>
      <DependentList>
        <DependentListName>CARE</DependentListName>
        <Sections>
          <Section>
            <LongName>Coverage</LongName><IsSubconfiguration>false</IsSubconfiguration>
            <Articles><SectionArticle><LongName>Care Year</LongName><Step>1</Step><DefaultAmount>0</DefaultAmount></SectionArticle></Articles>
            <SAPCharacterTraitNames><string /></SAPCharacterTraitNames>
          </Section>
        </Sections>
      </DependentList>
      <DependentList>
        <DependentListName>DONGLE</DependentListName>
        <Sections>
          <Section>
            <LongName>Licence</LongName><IsSubconfiguration>false</IsSubconfiguration>
            <Articles><SectionArticle><LongName>Dongle</LongName><Step>1</Step><DefaultAmount>1</DefaultAmount></SectionArticle></Articles>
            <SAPCharacterTraitNames><string /></SAPCharacterTraitNames>
          </Section>
          <Section>
            <LongName>Coverage</LongName><IsSubconfiguration>false</IsSubconfiguration>
            <Articles><SectionArticle><LongName>Care Year</LongName><Step>1</Step><DefaultAmount>0</DefaultAmount></SectionArticle></Articles>
            <SAPCharacterTraitNames><string /></SAPCharacterTraitNames>
          </Section>
        </Sections>
      </DependentList>
    </DependentLists>
  </DependentListsData>
  <RoundingRules>
    <RoundingRule><Rule>1 - commercial Rounding</Rule><Condition>MSRP</Condition><CurrencyIso>EUR</CurrencyIso><MPG>*</MPG><RangeFrom>0</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>1</RoundTo></RoundingRule>
    <RoundingRule><Rule>1 - commercial Rounding</Rule><Condition>DP</Condition><CurrencyIso>EUR</CurrencyIso><MPG>*</MPG><RangeFrom>-79228162514264337593543950335</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>1</RoundTo></RoundingRule>
  </RoundingRules>
  <DiscountsData>
    <Discounts>
      <Discount><MPG>Hardware</MPG><PriceListName>Partner</PriceListName><Factor>0.4</Factor></Discount>
      <Discount><MPG>Care</MPG><PriceListName>Partner</PriceListName><Factor>0.25</Factor></Discount>
    </Discounts>
  </DiscountsData>
  <ArticlesData>
    <Articles>
      <Article>
        <LongName>Base Unit</LongName><MPG>Hardware</MPG>
        <ArticlePriceLists><ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp>60</Dp><Msrp>100</Msrp><EuroMsrp>100</EuroMsrp></ArticlePriceList></ArticlePriceLists>
      </Article>
      <Article>
        <LongName>Care Year</LongName><MPG>Care</MPG>
        <ArticlePriceLists><ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp>150</Dp><Msrp>200</Msrp><EuroMsrp>200</EuroMsrp></ArticlePriceList></ArticlePriceLists>
      </Article>
      <Article>
        <LongName>Dongle</LongName><MPG>No Discount</MPG>
        <ArticlePriceLists><ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp>0</Dp><Msrp>0</Msrp><EuroMsrp>0</EuroMsrp></ArticlePriceList></ArticlePriceLists>
      </Article>
    </Articles>
  </ArticlesData>
</AdministrationData>`

const ORDER = `<?xml version="1.0" encoding="utf-8"?>\r
<OrderData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\r
  <DependentListsData />\r
  <FreeArticlesData />\r
  <FreeListArticlesData />\r
  <SupportArticlesData />\r
  <CleanOrder>true</CleanOrder>\r
  <DestinationNew>\r
    <ExportControl>false</ExportControl>\r
    <PriceFactor>1</PriceFactor>\r
  </DestinationNew>\r
  <Currency>\r
    <Iso>EUR</Iso>\r
    <ExchangeRate>1</ExchangeRate>\r
  </Currency>\r
  <PriceList>Partner</PriceList>\r
</OrderData>`

function pdb(): GpcContainer {
  return {
    dosTime: 0,
    dosDate: 0,
    entries: [{ name: 'config.xml', data: new TextEncoder().encode(CONFIG), method: 8 }],
  }
}

const parse = () => parseOrderXml(new TextEncoder().encode(ORDER))
const xmlOf = (doc: ReturnType<typeof parseOrderXml>) => new TextDecoder().decode(serializeOrderXml(doc))

const SYSTEM_PICKED = [
  { sectionName: 'Options', articleName: 'Base Unit', amount: '1', amountMode: 'UserChoice' as const },
]
const CARE_PICKED = [
  { sectionName: 'Add a care plan', articleName: 'Care Plan', amount: '1', amountMode: 'SectionSpecialFunction' as const },
]
const CHILD = {
  itemName: 'Care Plan',
  reply1: 'licence@example.com',
  reply2: 'A Person',
  selections: [{ sectionName: 'Coverage', articleName: 'Care Year', amount: '1', amountMode: 'UserChoice' as const }],
}

describe('a dependent list can contain further dependent lists', () => {
  it('opens a child line for a selected sub-configuration option', () => {
    const xml = xmlOf(addDependentList(parse(), pdb(), 'System', {
      selections: [...SYSTEM_PICKED, ...CARE_PICKED],
      subConfigurations: [CHILD],
    }))

    // The child is a polymorphic entry: the member is ConfigurationItemData and
    // the concrete type rides on xsi:type.
    expect(xml).toContain('<ConfigurationItemData xsi:type="DependentListScreenData">')
    expect(xml).toContain('<Name>Care Plan</Name>')
    // Numbered under its parent, and it does not take a top-level number.
    expect(xml).toContain('<No>1</No>')
    expect(xml).toContain('<No>1.1</No>')
    expect(xml).toContain('<Reply1>licence@example.com</Reply1>')
    expect(xml).toContain('<Reply2>A Person</Reply2>')
  })

  it('leaves the list empty when no sub-configuration option is selected', () => {
    const xml = xmlOf(addDependentList(parse(), pdb(), 'System', { selections: SYSTEM_PICKED }))
    expect(xml).toContain('<SubConfigurations />')
    expect(xml).not.toContain('xsi:type="DependentListScreenData"')
  })

  it('prices a sub-configuration option as nothing at all, not as zero', () => {
    const xml = xmlOf(addDependentList(parse(), pdb(), 'System', {
      selections: [...SYSTEM_PICKED, ...CARE_PICKED],
      subConfigurations: [CHILD],
    }))
    // The option names a configuration item, not an article, so it has no price.
    const option = xml.slice(xml.indexOf('<Name>Add a care plan</Name>'), xml.indexOf('<Name>Care Plan</Name>'))
    expect(option).toContain('<Msrp xsi:nil="true" />')
    expect(option).toContain('<Dp xsi:nil="true" />')
  })

  it('keeps the child out of its parent\'s total and inside the order\'s', () => {
    let order = addDependentList(parse(), pdb(), 'System', {
      selections: [...SYSTEM_PICKED, ...CARE_PICKED],
      subConfigurations: [CHILD],
    })
    order = recalculateOrder(order, pdb(), {})
    const xml = xmlOf(order)

    // Parent: the base unit only. Child: the care year only.
    expect(xml).toContain('<TotalMsrp>100</TotalMsrp>')
    expect(xml).toContain('<TotalDp>60</TotalDp>')
    expect(xml).toContain('<TotalMsrp>200</TotalMsrp>')
    expect(xml).toContain('<TotalDp>150</TotalDp>')
    // Order: both, because a child is a row in the configurator's item list.
    expect(xml).toContain('<Msrp>300</Msrp>')
    expect(xml).toContain('<Dp>210</Dp>')
  })

  it('gives the child its parent\'s UseInCalculation', () => {
    const xml = xmlOf(addDependentList(parse(), pdb(), 'System', {
      useInCalculation: false,
      selections: [...SYSTEM_PICKED, ...CARE_PICKED],
      subConfigurations: [CHILD],
    }))
    expect(xml.match(/<UseInCalculation>false<\/UseInCalculation>/g)).toHaveLength(2)
  })
})

describe('a support screen is built from its dongle lists', () => {
  const dongle = () =>
    addDependentListSupport(parse(), pdb(), {
      dongleId: 'D-1',
      startNewContract: '2026-05-01T00:00:00',
      endNewContract: '2027-04-30T00:00:00',
      endOldContract: '2026-04-30T00:00:00',
      selections: [
        { sectionName: 'Licence', articleName: 'Dongle', amount: '1', amountMode: 'Default' as const },
        { sectionName: 'Coverage', articleName: 'Care Year', amount: '1', amountMode: 'UserChoice' as const },
      ],
    })

  it('invents the DongleList configuration item rather than cloning one', () => {
    const xml = xmlOf(dongle())
    expect(xml).toContain('<DependentListSupportScreenData>')
    expect(xml).toContain('<ItemType>DongleList</ItemType>')
    // The filter is the support item's own, minus its <Support> prefix.
    expect(xml).toContain('<WorksheetArticleFilter>DONGLE</WorksheetArticleFilter>')
    // Nothing in the catalog has that ItemType, so the item carries no name,
    // no group levels and no blacklist — .NET omits every null reference type.
    const item = xml.slice(xml.indexOf('<DependentListSupportScreenData>'), xml.indexOf('</ConfigurationItem>'))
    expect(item).not.toContain('<Name>')
    expect(item).not.toContain('<GroupLevel1>')
  })

  it('derives the article list instead of being handed one', () => {
    const xml = xmlOf(dongle())
    // SupportScreenData.SoftwareSupportArticles is a computed property: one
    // article per unit of each selected option, carrying the dongle's contract.
    expect(xml.match(/<SupportArticle>/g)).toHaveLength(2)
    expect(xml.match(/<SensorSnDongleId>D-1<\/SensorSnDongleId>/g)).toHaveLength(2)
    // Three: once on the dongle list itself, once on each article it produced.
    expect(xml.match(/<StartNewContract>2026-05-01T00:00:00<\/StartNewContract>/g)).toHaveLength(3)
    expect(xml).toContain('<LongName>Care Year</LongName>')
  })

  it('carries the division\'s scale into the distributor total', () => {
    const xml = xmlOf(dongle())
    // TotalMsrp x (DpPerYear / MsrpPerYear): 150/200 is 0.75, so the product
    // keeps two places even though the sum of the lines is a whole number.
    expect(xml).toContain('<TotalMsrp>200</TotalMsrp>')
    expect(xml).toContain('<TotalDp>150.00</TotalDp>')
  })

  it('puts a second dongle on the same screen', () => {
    let order = dongle()
    order = addDependentListSupport(order, pdb(), {
      dongleId: 'D-2',
      selections: [{ sectionName: 'Coverage', articleName: 'Care Year', amount: '1', amountMode: 'UserChoice' as const }],
    })
    const xml = xmlOf(order)
    expect(xml.match(/<SupportScreenData>/g)).toHaveLength(1)
    expect(xml.match(/<DependentListSupportScreenData>/g)).toHaveLength(2)
    expect(xml.match(/<SupportArticle>/g)).toHaveLength(3)
  })
})
