import { describe, it, expect } from 'vitest'
import { addCatalogArticle, findSupportItem, isSupportArticle } from '../addItem.ts'
import { parseOrderXml, serializeOrderXml } from '../orderXml.ts'
import type { GpcContainer } from '../container.ts'

/**
 * A miniature catalog with the two shapes that matter: a FreeList item matched
 * by filter tag, and a Supportextension item whose filter shares nothing with
 * the article tag that belongs to it.
 */
const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData>
  <ConfigurationItemsData>
    <ConfigurationItems>
      <ConfigurationItem>
        <GroupLevel1>Services</GroupLevel1><Name>Spare Parts</Name>
        <WorksheetArticleFilter>&lt;Articles&gt;spare</WorksheetArticleFilter>
        <ItemType>FreeList</ItemType>
      </ConfigurationItem>
      <ConfigurationItem>
        <GroupLevel1>ZEISS Metrology Care</GroupLevel1><Name>Software Maintenance Agreement</Name>
        <WorksheetArticleFilter>&lt;Support&gt;SMA_EXT</WorksheetArticleFilter>
        <ItemType>Supportextension</ItemType>
      </ConfigurationItem>
    </ConfigurationItems>
  </ConfigurationItemsData>
  <RoundingRules>
    <RoundingRule><Rule>1 - commercial Rounding</Rule><Condition>MSRP</Condition><CurrencyIso>EUR</CurrencyIso><MPG>*</MPG><RangeFrom>0</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>1</RoundTo></RoundingRule>
    <RoundingRule><Rule>1 - commercial Rounding</Rule><Condition>DP</Condition><CurrencyIso>EUR</CurrencyIso><MPG>*</MPG><RangeFrom>0</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>1</RoundTo></RoundingRule>
  </RoundingRules>
  <ArticlesData>
    <Articles>
      <Article>
        <LongName>Calibration Panel</LongName><FilterTags>spare</FilterTags>
        <MPG>Spareparts</MPG>
        <ArticlePriceLists><ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp>100</Dp><Msrp>200</Msrp></ArticlePriceList></ArticlePriceLists>
      </Article>
      <Article>
        <LongName>EXT SMA for Sensor Driver</LongName><FilterTags>&lt;software-support&gt;</FilterTags>
        <MPG>SMA (Stand-alone / Extension)</MPG>
        <ArticlePriceLists><ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp>1000</Dp><Msrp>2000</Msrp></ArticlePriceList></ArticlePriceLists>
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

describe('addCatalogArticle routes an article to the right kind of item', () => {
  it('puts a support article under the Supportextension item, not its MPG', () => {
    const xml = xmlOf(addCatalogArticle(parse(), pdb(), 'EXT SMA for Sensor Driver'))

    // The bug this replaces invented an item named after the article's MPG.
    expect(xml).toContain('<Name>Software Maintenance Agreement</Name>')
    expect(xml).toContain('<GroupLevel1>ZEISS Metrology Care</GroupLevel1>')
    expect(xml).not.toContain('SMA (Stand-alone / Extension)</GroupLevel1>')
    expect(xml).toContain('<SupportArticle>')
    expect(xml).toContain('<FreeListArticlesData />')
  })

  it('puts a free-list article under its filter-tag item', () => {
    const xml = xmlOf(addCatalogArticle(parse(), pdb(), 'Calibration Panel'))
    expect(xml).toContain('<Name>Spare Parts</Name>')
    expect(xml).toContain('<FreeListScreenData>')
    expect(xml).toContain('<SupportArticlesData />')
  })

  it('adds a second support article to the same screen rather than a new item', () => {
    let order = addCatalogArticle(parse(), pdb(), 'EXT SMA for Sensor Driver')
    order = addCatalogArticle(order, pdb(), 'EXT SMA for Sensor Driver')
    const xml = xmlOf(order)

    expect(xml.match(/<SupportScreenData>/g)).toHaveLength(1)
    expect(xml.match(/<SupportArticle>/g)).toHaveLength(2)
    expect(xml).toContain('<TotalMsrp>4000</TotalMsrp>')
    expect(xml).toContain('<TotalDp>2000</TotalDp>')
  })

  it('finds the support item by type, since its filter does not match the article tag', () => {
    const config = parseOrderXml(new TextEncoder().encode(
      CONFIG.replace('<AdministrationData>', '<OrderData>').replace('</AdministrationData>', '</OrderData>')
    )).root
    expect(findSupportItem(config)).toBeDefined()
    expect(isSupportArticle({
      kind: 'element', type: null,
      members: [{ name: 'FilterTags', value: { kind: 'text', type: null, value: '<software-support>' } }],
    })).toBe(true)
  })
})
