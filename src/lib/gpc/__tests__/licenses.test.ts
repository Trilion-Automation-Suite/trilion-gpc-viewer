import { describe, expect, it } from 'vitest'
import { parseOrderXml, serializeOrderXml } from '../orderXml.ts'
import { catalogContainer } from '../catalogContainer.ts'
import { readPdbConfig } from '../blankOrder.ts'
import { addLicense, licenseOptions } from '../licenses.ts'
import { validateOrderXml, describeViolations } from '../validateOrder.ts'

/**
 * "Software License" holds configuration items, not products. The products are
 * options inside the dependent lists those items open, which is why a picker
 * reading the items alone found four entries and no products.
 */
const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ArticlesData>
    <Articles>
      <Article>
        <SapNr>SAP-1</SapNr>
        <ArticlePriceLists>
          <ArticlePriceList>
            <Name>Partner</Name>
            <Currency>EUR</Currency>
            <Dp>800</Dp>
            <Msrp>1000</Msrp>
            <EuroMsrp>1000</EuroMsrp>
          </ArticlePriceList>
        </ArticlePriceLists>
        <LongName>2026 Sensor Driver ARAMIS</LongName>
        <Unit>pcs</Unit>
      </Article>
    </Articles>
  </ArticlesData>
  <ConfigurationItemsData>
    <ConfigurationItems>
      <ConfigurationItem>
        <GroupLevel1>Software License</GroupLevel1>
        <GroupLevel2>ZEISS Software</GroupLevel2>
        <Name>ZEISS Software</Name>
        <WorksheetArticleFilter>SASW2025</WorksheetArticleFilter>
        <ItemType>DependentList</ItemType>
        <SapNr>000250-0015-566</SapNr>
      </ConfigurationItem>
    </ConfigurationItems>
  </ConfigurationItemsData>
  <DependentListsData>
    <DependentLists>
      <DependentList>
        <DependentListName>SASW2025</DependentListName>
        <Sections>
          <Section>
            <LongName>Sensor Driver</LongName>
            <Selection>
              <SelectionMode>OneOrMore</SelectionMode>
            </Selection>
            <Articles>
              <SectionArticle>
                <LongName>2026 Sensor Driver ARAMIS</LongName>
                <Step>1</Step>
                <DefaultAmount>0</DefaultAmount>
              </SectionArticle>
            </Articles>
          </Section>
        </Sections>
      </DependentList>
    </DependentLists>
  </DependentListsData>
</AdministrationData>`

const ORDER = `<?xml version="1.0" encoding="utf-8"?>
<OrderData xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <DependentListsData />
  <FreeArticlesData />
  <FreeListArticlesData />
  <SupportArticlesData />
  <CleanOrder>false</CleanOrder>
  <Currency>
    <Iso>EUR</Iso>
    <Display>EUR</Display>
    <Description>Euro</Description>
    <ExchangeRate>1</ExchangeRate>
  </Currency>
  <OrderStatus>Editing</OrderStatus>
  <PriceList>Partner</PriceList>
</OrderData>`

describe('software licences', () => {
  it('finds the products inside the dependent lists, not the items', () => {
    const options = licenseOptions(readPdbConfig(catalogContainer(CONFIG)))
    expect(options).toEqual([
      {
        articleName: '2026 Sensor Driver ARAMIS',
        itemName: 'ZEISS Software',
        subCategory: 'ZEISS Software',
        listName: 'SASW2025',
        sectionName: 'Sensor Driver',
      },
    ])
  })

  it('adds the line that owns the product, with it selected', () => {
    const order = parseOrderXml(new TextEncoder().encode(ORDER))
    const pdb = catalogContainer(CONFIG)
    const [option] = licenseOptions(readPdbConfig(pdb))
    addLicense(order, pdb, option, { userZeissId: 'licensing@trilion.com', userName: 'Trilion Licensing' })

    const xml = new TextDecoder().decode(serializeOrderXml(order))
    expect(xml).toContain('<Name>ZEISS Software</Name>')
    expect(xml).toContain('<Name>2026 Sensor Driver ARAMIS</Name>')
    expect(xml).toContain('<Reply1>licensing@trilion.com</Reply1>')
    expect(xml).toContain('<Reply2>Trilion Licensing</Reply2>')
    // Selected, not merely listed.
    const section = xml.slice(xml.indexOf('<SectionArticleScreenData>'))
    expect(section).toContain('<Amount>1</Amount>')
    expect(section).toContain('<AmountMode>UserChoice</AmountMode>')
    expect(describeViolations(validateOrderXml(xml))).toBe('')
  })
})
