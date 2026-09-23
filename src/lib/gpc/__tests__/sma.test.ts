import { describe, expect, it } from 'vitest'
import { parseOrderXml, serializeOrderXml } from '../orderXml.ts'
import { catalogContainer } from '../catalogContainer.ts'
import { addSmaExtension, contractDates, defaultLicenseModel, donglesInScreen } from '../sma.ts'
import { findSupportItem } from '../addItem.ts'
import { readPdbConfig } from '../blankOrder.ts'
import { validateOrderXml, describeViolations } from '../validateOrder.ts'

/**
 * The shape here is taken from `smaexample.gconfiguration`: one
 * SupportScreenData named "Software Maintenance Agreement", holding a
 * zero-priced "External Dongle without System" row followed by the agreements,
 * every row repeating the same dongle id and the same three dates.
 */
const ARTICLE = (name: string, tags: string, msrp: string, dp: string) => `
        <Article>
          <SapNr>SAP-${name.replace(/\W/g, '')}</SapNr>
          <ArticlePriceLists>
            <ArticlePriceList>
              <Name>Partner</Name>
              <Currency>EUR</Currency>
              <Dp>${dp}</Dp>
              <Msrp>${msrp}</Msrp>
              <EuroMsrp>${msrp}</EuroMsrp>
            </ArticlePriceList>
          </ArticlePriceLists>
          <FilterTags>${tags}</FilterTags>
          <LongName>${name}</LongName>
          <Unit>pcs</Unit>
          <MPG>SMA</MPG>
        </Article>`

const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ArticlesData>
    <Articles>${ARTICLE('External Dongle without System', '', '0', '0')}${ARTICLE('PC bound', '', '0', '0')}${ARTICLE('EXT SMA for Sensor Driver ARAMIS', '&lt;software-support&gt;', '1563', '1563')}${ARTICLE('EXT SMA for ZEISS CORRELATE - Pro Line', '&lt;software-support&gt;', '2883', '2883')}
    </Articles>
  </ArticlesData>
  <ConfigurationItemsData>
    <ConfigurationItems>
      <ConfigurationItem>
        <GroupLevel1>ZEISS Metrology Care</GroupLevel1>
        <Name>Software Maintenance Agreement</Name>
        <WorksheetArticleFilter>&lt;Support&gt;SMA_EXT</WorksheetArticleFilter>
        <ItemType>Supportextension</ItemType>
        <Question1>Please enter E-Mail address from License User</Question1>
        <Question2>Please enter Name from License User</Question2>
      </ConfigurationItem>
    </ConfigurationItems>
  </ConfigurationItemsData>
  <DependentListsData>
    <DependentLists>
      <DependentList>
        <DependentListName>SMA_EXT</DependentListName>
        <Sections>
          <Section>
            <LongName>License model</LongName>
            <Articles>
              <SectionArticle>
                <LongName>PC bound</LongName>
                <DefaultAmount>0</DefaultAmount>
              </SectionArticle>
              <SectionArticle>
                <LongName>External Dongle without System</LongName>
                <DefaultAmount>1</DefaultAmount>
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

const build = () => ({
  order: parseOrderXml(new TextEncoder().encode(ORDER)),
  pdb: catalogContainer(CONFIG),
})
const xmlOf = (order: Parameters<typeof serializeOrderXml>[0]) =>
  new TextDecoder().decode(serializeOrderXml(order))
const rows = (xml: string) =>
  xml.split('<SupportArticle>').slice(1).map((part) => ({
    name: /<LongName>([^<]*)</.exec(part)?.[1] ?? '',
    dongle: /<SensorSnDongleId>([^<]*)</.exec(part)?.[1] ?? '',
    start: /<StartNewContract>([^<]*)</.exec(part)?.[1] ?? '',
    endNew: /<EndNewContract>([^<]*)</.exec(part)?.[1] ?? '',
    endOld: /<EndOldContract>([^<]*)</.exec(part)?.[1] ?? '',
  }))

describe('software maintenance agreements', () => {
  it('runs the new term from the day after the old one ends', () => {
    expect(contractDates({ dongleId: 'x', endOldContract: '2026-04-30' })).toEqual({
      endOldContract: '2026-04-30T00:00:00',
      startNewContract: '2026-05-01T00:00:00',
      endNewContract: '2027-04-30T00:00:00',
    })
  })

  it('crosses a year boundary', () => {
    const dates = contractDates({ dongleId: 'x', endOldContract: '2026-12-31' })
    expect(dates.startNewContract).toBe('2027-01-01T00:00:00')
    expect(dates.endNewContract).toBe('2027-12-31T00:00:00')
  })

  it('takes the licence model the catalog marks as default', () => {
    const config = readPdbConfig(catalogContainer(CONFIG))
    expect(defaultLicenseModel(config, findSupportItem(config))).toBe('External Dongle without System')
  })

  it('creates the licence-model row the agreement hangs from', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', {
      dongleId: '3-7619774',
      endOldContract: '2026-04-30',
      licenseUserEmail: 'licensing@trilion.com',
      licenseUserName: 'Trilion Licensing',
    })
    const xml = xmlOf(order)
    const built = rows(xml)

    // The dongle row comes first — without it GPC shows an empty category.
    expect(built.map((r) => r.name)).toEqual([
      'External Dongle without System',
      'EXT SMA for Sensor Driver ARAMIS',
    ])
    // Every row repeats the dongle and the term.
    for (const row of built) {
      expect(row.dongle).toBe('3-7619774')
      expect(row.start).toBe('2026-05-01T00:00:00')
      expect(row.endNew).toBe('2027-04-30T00:00:00')
      expect(row.endOld).toBe('2026-04-30T00:00:00')
    }
    expect(xml).toContain('<Reply1>licensing@trilion.com</Reply1>')
    expect(xml).toContain('<Reply2>Trilion Licensing</Reply2>')
    expect(xml).toContain('<ItemType>Supportextension</ItemType>')
    expect(xml).toContain('<Name>Software Maintenance Agreement</Name>')
    expect(describeViolations(validateOrderXml(xml))).toBe('')
  })

  it('does not repeat the licence-model row for a dongle already covered', () => {
    const { order, pdb } = build()
    const contract = { dongleId: '3-7619774', endOldContract: '2026-04-30' }
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', contract)
    addSmaExtension(order, pdb, 'EXT SMA for ZEISS CORRELATE - Pro Line', contract)
    expect(rows(xmlOf(order)).map((r) => r.name)).toEqual([
      'External Dongle without System',
      'EXT SMA for Sensor Driver ARAMIS',
      'EXT SMA for ZEISS CORRELATE - Pro Line',
    ])
  })

  it('gives a second dongle its own licence-model row', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', { dongleId: '3-7619774', endOldContract: '2026-04-30' })
    addSmaExtension(order, pdb, 'EXT SMA for ZEISS CORRELATE - Pro Line', { dongleId: '3-8000001', endOldContract: '2026-04-30' })
    expect(rows(xmlOf(order)).map((r) => r.name)).toEqual([
      'External Dongle without System',
      'EXT SMA for Sensor Driver ARAMIS',
      'External Dongle without System',
      'EXT SMA for ZEISS CORRELATE - Pro Line',
    ])
    const screen = order.root.members.find((m) => m.name === 'SupportArticlesData')?.value
    if (screen?.kind !== 'element') throw new Error('no support screen')
    const first = screen.members[0].value
    if (first.kind !== 'element') throw new Error('no screen data')
    expect(donglesInScreen(first)).toEqual(['3-7619774', '3-8000001'])
  })

  it('adds several agreements for one dongle in one go', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, ['EXT SMA for Sensor Driver ARAMIS', 'EXT SMA for ZEISS CORRELATE - Pro Line'], {
      dongleId: '3-7619774',
      endOldContract: '2026-04-30',
    })
    expect(rows(xmlOf(order))).toHaveLength(3)
  })

  it('refuses to build an agreement with no dongle', () => {
    const { order, pdb } = build()
    expect(() =>
      addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', { dongleId: '', endOldContract: '2026-04-30' })
    ).toThrow(/dongle id/)
  })
})
