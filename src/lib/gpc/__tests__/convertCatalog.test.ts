import { describe, it, expect } from 'vitest'
import { addDependentListSupport } from '../dependentList.ts'
import { convertOrderToCatalog } from '../convertCatalog.ts'
import { parseOrderXml, serializeOrderXml } from '../orderXml.ts'
import type { GpcContainer } from '../container.ts'

/**
 * Q17: an order mirrors the whole option tree of the dependent list it points
 * at, and GPC resolves that mirror at two levels when it opens the file —
 * sections *positionally* against the catalog in
 * `DependentListDataFactoryExt.InitRuntimeData`, options *by lookup* in
 * `DependentListHandler.UpdateRestrictions`. A stale section is an
 * `ArgumentOutOfRangeException` before any window opens; a stale option is a
 * `NullReferenceException` when the price list is set. Neither is a
 * deserialization error, so neither shows up in `validateOrderXml`.
 *
 * PDB290 dropped one `SMA_EXT` section and two Floating options, which is what
 * made a converted Care order unopenable. These two catalogs stand in for that:
 * V2 drops a section and an option V1 has, gains one V1 lacks, and reprices.
 */
function catalog(version: string, body: string): GpcContainer {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData>
  <ParametersData><VersionName>${version}</VersionName></ParametersData>
  <ConfigurationItemsData><ConfigurationItems>
    <ConfigurationItem>
      <Name>Maintenance Agreement</Name>
      <WorksheetArticleFilter>&lt;Support&gt;DONGLE</WorksheetArticleFilter>
      <ItemType>Supportextension</ItemType>
    </ConfigurationItem>
  </ConfigurationItems></ConfigurationItemsData>
  ${body}
  <RoundingRules>
    <RoundingRule><Rule>1 - commercial Rounding</Rule><Condition>MSRP</Condition><CurrencyIso>EUR</CurrencyIso><MPG>*</MPG><RangeFrom>0</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>1</RoundTo></RoundingRule>
    <RoundingRule><Rule>1 - commercial Rounding</Rule><Condition>DP</Condition><CurrencyIso>EUR</CurrencyIso><MPG>*</MPG><RangeFrom>-79228162514264337593543950335</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>1</RoundTo></RoundingRule>
  </RoundingRules>
  <DiscountsData><Discounts>
    <Discount><MPG>Care</MPG><PriceListName>Partner</PriceListName><Factor>0.25</Factor></Discount>
  </Discounts></DiscountsData>
</AdministrationData>`
  return { dosTime: 0, dosDate: 0, entries: [{ name: 'config.xml', data: new TextEncoder().encode(xml), method: 8 }] }
}

const sectionArticle = (name: string) =>
  `<SectionArticle><LongName>${name}</LongName><Step>1</Step><DefaultAmount>0</DefaultAmount></SectionArticle>`
const article = (name: string, msrp: number, dp: number) =>
  `<Article><LongName>${name}</LongName><MPG>Care</MPG><ArticlePriceLists><ArticlePriceList>` +
  `<Name>Partner</Name><Currency>EUR</Currency><Dp>${dp}</Dp><Msrp>${msrp}</Msrp><EuroMsrp>${msrp}</EuroMsrp>` +
  `</ArticlePriceList></ArticlePriceLists></Article>`

const V1 = catalog('PDB-V1', `
  <DependentListsData><DependentLists><DependentList>
    <DependentListName>DONGLE</DependentListName>
    <Sections>
      <Section><LongName>Licence</LongName><Articles>${sectionArticle('Dongle')}</Articles>
        <SAPCharacterTraitNames><string /></SAPCharacterTraitNames></Section>
      <Section><LongName>Coverage</LongName>
        <Articles>${sectionArticle('Care Year')}${sectionArticle('Retired Option')}</Articles>
        <SAPCharacterTraitNames><string /></SAPCharacterTraitNames></Section>
      <Section><LongName>Retired Section</LongName><Articles>${sectionArticle('Old Extra')}</Articles>
        <SAPCharacterTraitNames><string /></SAPCharacterTraitNames></Section>
    </Sections>
  </DependentList></DependentLists></DependentListsData>
  <ArticlesData><Articles>
    ${article('Dongle', 0, 0)}${article('Care Year', 200, 150)}
    ${article('Retired Option', 50, 40)}${article('Old Extra', 10, 8)}
  </Articles></ArticlesData>`)

/** Drops `Retired Section` and `Retired Option`, gains `New Option`, reprices. */
const V2 = catalog('PDB-V2', `
  <DependentListsData><DependentLists><DependentList>
    <DependentListName>DONGLE</DependentListName>
    <Sections>
      <Section><LongName>Licence</LongName><Articles>${sectionArticle('Dongle')}</Articles>
        <SAPCharacterTraitNames><string /></SAPCharacterTraitNames></Section>
      <Section><LongName>Coverage</LongName>
        <Articles>${sectionArticle('Care Year')}${sectionArticle('New Option')}</Articles>
        <SAPCharacterTraitNames><string /></SAPCharacterTraitNames></Section>
    </Sections>
  </DependentList></DependentLists></DependentListsData>
  <ArticlesData><Articles>
    ${article('Dongle', 0, 0)}${article('Care Year', 240, 180)}${article('New Option', 30, 24)}
  </Articles></ArticlesData>`)

const ORDER = `<?xml version="1.0" encoding="utf-8"?>\r
<OrderData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\r
  <DependentListsData />\r
  <FreeArticlesData />\r
  <FreeListArticlesData />\r
  <SupportArticlesData />\r
  <CleanOrder>true</CleanOrder>\r
  <DestinationNew><ExportControl>false</ExportControl><PriceFactor>1</PriceFactor></DestinationNew>\r
  <Currency><Iso>EUR</Iso><ExchangeRate>1</ExchangeRate></Currency>\r
  <PriceList>Partner</PriceList>\r
</OrderData>`

/** An order on V1 with a maintenance agreement whose Care Year is selected. */
function onV1() {
  return addDependentListSupport(parseOrderXml(new TextEncoder().encode(ORDER)), V1, {
    dongleId: 'D-1',
    selections: [{ sectionName: 'Coverage', articleName: 'Care Year', amount: '1', amountMode: 'UserChoice' as const }],
  })
}

const xmlOf = (doc: ReturnType<typeof parseOrderXml>) => new TextDecoder().decode(serializeOrderXml(doc))
const sectionNames = (xml: string) =>
  [...xml.matchAll(/<SectionScreenData>\s*<Name>(.*?)<\/Name>/gs)].map((m) => m[1])
const optionNames = (xml: string) =>
  [...xml.matchAll(/<SectionArticleScreenData>[\s\S]*?<Name>(.*?)<\/Name>/g)].map((m) => m[1])

describe('convertOrderToCatalog: the dependent-list mirror', () => {
  it('writes the old catalog\'s shape before conversion', () => {
    const xml = xmlOf(onV1())
    expect(sectionNames(xml)).toEqual(['Licence', 'Coverage', 'Retired Section'])
    expect(optionNames(xml)).toEqual(['Dongle', 'Care Year', 'Retired Option', 'Old Extra'])
  })

  it('drops a section the target catalog no longer defines', () => {
    const order = onV1()
    const report = convertOrderToCatalog(order, V2)
    expect(sectionNames(xmlOf(order))).toEqual(['Licence', 'Coverage'])
    expect(report.dependentLists.sectionsRemoved).toEqual(['DONGLE/Retired Section'])
  })

  it('drops a retired option and adds a gained one, in catalog order', () => {
    const order = onV1()
    const report = convertOrderToCatalog(order, V2)
    expect(optionNames(xmlOf(order))).toEqual(['Dongle', 'Care Year', 'New Option'])
    // Only options inside a *surviving* section are listed. `Old Extra` went
    // with `Retired Section`, and reporting it again would double-count one
    // change as two.
    expect(report.dependentLists.optionsRemoved).toEqual(['DONGLE/Coverage/Retired Option'])
    expect(report.dependentLists.optionsAdded).toEqual(['DONGLE/Coverage/New Option'])
  })

  it('names a pick the target catalog withdrew, so a replacement can be chosen', () => {
    // A picked option that the new catalog no longer has (a computer model that
    // was withdrawn) is the one GPC's own import reports as "Missing article".
    const order = addDependentListSupport(parseOrderXml(new TextEncoder().encode(ORDER)), V1, {
      dongleId: 'D-1',
      selections: [{ sectionName: 'Coverage', articleName: 'Retired Option', amount: '1', amountMode: 'UserChoice' as const }],
    })
    const report = convertOrderToCatalog(order, V2)
    expect(report.dependentLists.picksLost).toEqual(['Coverage: Retired Option'])
    // Unpicked options that went are not the operator's business.
    expect(convertOrderToCatalog(onV1(), V2).dependentLists.picksLost).toEqual([])
  })

  it('keeps the user\'s own selection on an option the target still has', () => {
    const order = onV1()
    convertOrderToCatalog(order, V2)
    const care = /<SectionArticleScreenData>((?:(?!<\/SectionArticleScreenData>)[\s\S])*?<Name>Care Year<\/Name>[\s\S]*?)<\/SectionArticleScreenData>/
      .exec(xmlOf(order))?.[1] ?? ''
    expect(care).toContain('<Amount>1</Amount>')
    expect(care).toContain('<AmountMode>UserChoice</AmountMode>')
  })

  it('reprices a kept option from the target catalog', () => {
    const order = onV1()
    const report = convertOrderToCatalog(order, V2)
    const xml = xmlOf(order)
    expect(xml).toContain('<Msrp>240</Msrp>')
    expect(xml).not.toContain('<Msrp>200</Msrp>')
    expect(report.priceChanges).toEqual(
      expect.arrayContaining([{ longName: 'Care Year', field: 'Msrp', from: '200', to: '240' }])
    )
  })

  it('writes a gained option unselected, priced, and with no amount', () => {
    const order = onV1()
    convertOrderToCatalog(order, V2)
    const added = /<SectionArticleScreenData>((?:(?!<\/SectionArticleScreenData>)[\s\S])*?<Name>New Option<\/Name>[\s\S]*?)<\/SectionArticleScreenData>/
      .exec(xmlOf(order))?.[1] ?? ''
    expect(added).toContain('<Amount>0</Amount>')
    // GPC's AmountMode for an option nobody picked is None. 'Unselected' is not
    // a member of the enum, and .NET refuses the whole order over it.
    expect(added).toContain('<AmountMode>None</AmountMode>')
    expect(xmlOf(order)).not.toContain('Unselected')
    expect(added).toContain('<Msrp>30</Msrp>')
  })

  it('reports the list, not "(unnamed)", when it cannot be reconciled', () => {
    // A DongleList item carries no Name, so the filter is the only label there
    // is — the old report said "(unnamed)" and told the reader to fix it by hand.
    const order = onV1()
    const noList = catalog('PDB-V3', `
      <DependentListsData><DependentLists /></DependentListsData>
      <ArticlesData><Articles>${article('Care Year', 240, 180)}</Articles></ArticlesData>`)
    const report = convertOrderToCatalog(order, noList)
    expect(report.dependentListsNotConverted).toEqual(['DONGLE'])
    // and the stale mirror is left intact rather than emptied
    expect(sectionNames(xmlOf(order))).toEqual(['Licence', 'Coverage', 'Retired Section'])
  })

  it('carries a repriced option through to the screen total', () => {
    const order = onV1()
    // 200 is the sum of this screen's one selected option, so `convertNode`
    // can show the total *was* a plain sum and is safe to recompute. Repricing
    // Care Year to 240 has to move it; leaving 200 would have the order
    // disagreeing with the line it is made of.
    expect(/<TotalMsrp>(.*?)<\/TotalMsrp>/.exec(xmlOf(order))?.[1]).toBe('200')
    convertOrderToCatalog(order, V2)
    expect(/<TotalMsrp>(.*?)<\/TotalMsrp>/.exec(xmlOf(order))?.[1]).toBe('240')
  })

  it('leaves a total alone when it was not a plain sum', () => {
    // A support screen prices on contract months and volume discounts. Where the
    // stored total cannot be shown to be the sum of the options, it is reported
    // and left -- on the real Boeing order that protected one screen.
    const order = onV1()
    const screen = order.root.members.find((m) => m.name === 'SupportArticlesData')
    expect(screen).toBeDefined()
    const xml = xmlOf(order).replace('<TotalMsrp>200</TotalMsrp>', '<TotalMsrp>999</TotalMsrp>')
    const tampered = parseOrderXml(new TextEncoder().encode(xml))
    const report = convertOrderToCatalog(tampered, V2)
    expect(/<TotalMsrp>999<\/TotalMsrp>/.test(xmlOf(tampered))).toBe(true)
    expect(report.totalsLeft.length).toBeGreaterThan(0)
  })
})
