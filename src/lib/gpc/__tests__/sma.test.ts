import { describe, expect, it } from 'vitest'
import { parseOrderXml, serializeOrderXml } from '../orderXml.ts'
import { catalogContainer } from '../catalogContainer.ts'
import {
  MINIMUM_CONTRACT_MONTHS,
  monthsBetween,
  addSmaExtension,
  addSmaExtensionToDongle,
  contractDates,
  defaultLicenseModel,
  removeSmaDongle,
  removeSmaExtension,
  setSmaContract,
  smaDongles,
} from '../sma.ts'
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
            <Selection>
              <SelectionMode>ExactlyOne</SelectionMode>
            </Selection>
            <Articles>
              <SectionArticle>
                <LongName>PC bound</LongName>
                <Step>1</Step>
                <DefaultAmount>0</DefaultAmount>
              </SectionArticle>
              <SectionArticle>
                <LongName>External Dongle without System</LongName>
                <Step>1</Step>
                <DefaultAmount>1</DefaultAmount>
              </SectionArticle>
            </Articles>
          </Section>
          <Section>
            <LongName>Software Maintenance Agreement for Sensor Drivers</LongName>
            <Selection>
              <SelectionMode>MinXMaxY</SelectionMode>
            </Selection>
            <Articles>
              <SectionArticle>
                <LongName>EXT SMA for Sensor Driver ARAMIS</LongName>
                <Step>1</Step>
                <DefaultAmount>0</DefaultAmount>
              </SectionArticle>
            </Articles>
          </Section>
          <Section>
            <LongName>Software Maintenance Agreement for Pro and Pro Line</LongName>
            <Selection>
              <SelectionMode>ZeroOrOne</SelectionMode>
            </Selection>
            <Articles>
              <SectionArticle>
                <LongName>EXT SMA for ZEISS CORRELATE - Pro Line</LongName>
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
    expect(contractDates({ endOldContract: '2026-04-30' })).toEqual({
      endOldContract: '2026-04-30T00:00:00',
      startNewContract: '2026-05-01T00:00:00',
      endNewContract: '2027-04-30T00:00:00',
    })
  })

  it('crosses a year boundary', () => {
    const dates = contractDates({ endOldContract: '2026-12-31' })
    expect(dates.startNewContract).toBe('2027-01-01T00:00:00')
    expect(dates.endNewContract).toBe('2027-12-31T00:00:00')
  })

  it('takes the licence model the catalog marks as default', () => {
    const config = readPdbConfig(catalogContainer(CONFIG))
    expect(defaultLicenseModel(config)).toBe('External Dongle without System')
  })

  it('creates the dongle row GPC draws the group from', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', {
      dongleId: '3-7619774',
      endOldContract: '2026-04-30',
      licenseUserEmail: 'licensing@trilion.com',
      licenseUserName: 'Trilion Licensing',
    })
    const xml = xmlOf(order)

    // The dongle row itself: without it GPC shows an empty category, however
    // many SupportArticle entries the file contains.
    expect(xml).toContain('<ItemType>DongleList</ItemType>')
    expect(xml).toContain('<WorksheetArticleFilter>SMA_EXT</WorksheetArticleFilter>')
    expect(xml).toContain('<DongleId>3-7619774</DongleId>')

    const [dongle] = smaDongles(order)
    expect(dongle.dongleId).toBe('3-7619774')
    expect(dongle.startNewContract).toBe('2026-05-01T00:00:00')
    expect(dongle.endNewContract).toBe('2027-04-30T00:00:00')
    expect(dongle.endOldContract).toBe('2026-04-30T00:00:00')
    expect(dongle.selected).toEqual([
      { sectionName: 'License model', articleName: 'External Dongle without System', amount: '1' },
      { sectionName: 'Software Maintenance Agreement for Sensor Drivers', articleName: 'EXT SMA for Sensor Driver ARAMIS', amount: '1' },
    ])

    // The article rows are derived from it, licence model first.
    expect(rows(xml).map((r) => r.name)).toEqual([
      'External Dongle without System',
      'EXT SMA for Sensor Driver ARAMIS',
    ])
    for (const row of rows(xml)) {
      expect(row.dongle).toBe('3-7619774')
      expect(row.start).toBe('2026-05-01T00:00:00')
      expect(row.endNew).toBe('2027-04-30T00:00:00')
    }
    expect(xml).toContain('<Reply1>licensing@trilion.com</Reply1>')
    expect(xml).toContain('<Reply2>Trilion Licensing</Reply2>')
    expect(describeViolations(validateOrderXml(xml))).toBe('')
  })

  it('writes the whole option tree, selected or not', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', { dongleId: 'd1', endOldContract: '2026-04-30' })
    const xml = xmlOf(order)
    // Every option the list offers is recorded, which is what the configurator
    // writes and what lets the operator change the choice later.
    expect(xml).toContain('<Name>PC bound</Name>')
    expect(xml).toContain('<Name>EXT SMA for ZEISS CORRELATE - Pro Line</Name>')
    const [dongle] = smaDongles(order)
    expect(dongle.selected.map((s) => s.articleName)).not.toContain('PC bound')
  })

  it('puts a second agreement on the same dongle row', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', { dongleId: '3-7619774', endOldContract: '2026-04-30' })
    addSmaExtensionToDongle(order, pdb, 0, 'EXT SMA for ZEISS CORRELATE - Pro Line')

    expect(smaDongles(order)).toHaveLength(1)
    expect(smaDongles(order)[0].selected.map((s) => s.articleName)).toEqual([
      'External Dongle without System',
      'EXT SMA for Sensor Driver ARAMIS',
      'EXT SMA for ZEISS CORRELATE - Pro Line',
    ])
    expect(rows(xmlOf(order))).toHaveLength(3)
  })

  it('takes an agreement off again', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, ['EXT SMA for Sensor Driver ARAMIS', 'EXT SMA for ZEISS CORRELATE - Pro Line'], {
      dongleId: '3-7619774', endOldContract: '2026-04-30',
    })
    removeSmaExtension(order, pdb, 0, 'EXT SMA for ZEISS CORRELATE - Pro Line')
    expect(rows(xmlOf(order)).map((r) => r.name)).toEqual([
      'External Dongle without System',
      'EXT SMA for Sensor Driver ARAMIS',
    ])
  })

  it('will not remove the licence model, which is what the group hangs from', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', { dongleId: 'd1', endOldContract: '2026-04-30' })
    expect(() => removeSmaExtension(order, pdb, 0, 'External Dongle without System')).toThrow(/licence model/)
  })

  it('changes the dongle and the term, and re-derives the article rows', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', { dongleId: 'old-id', endOldContract: '2026-04-30' })
    setSmaContract(order, pdb, 0, { dongleId: '3-9999999', endOldContract: '2027-06-30' })

    const [dongle] = smaDongles(order)
    expect(dongle.dongleId).toBe('3-9999999')
    expect(dongle.startNewContract).toBe('2027-07-01T00:00:00')
    expect(dongle.endNewContract).toBe('2028-06-30T00:00:00')
    // The dates are copied onto every derived row, so they must move too.
    for (const row of rows(xmlOf(order))) {
      expect(row.dongle).toBe('3-9999999')
      expect(row.start).toBe('2027-07-01T00:00:00')
      expect(row.endNew).toBe('2028-06-30T00:00:00')
    }
  })

  it('gives a second dongle its own row', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', { dongleId: '3-7619774', endOldContract: '2026-04-30' })
    addSmaExtension(order, pdb, 'EXT SMA for ZEISS CORRELATE - Pro Line', { dongleId: '3-8000001', endOldContract: '2026-04-30' })
    expect(smaDongles(order).map((d) => d.dongleId)).toEqual(['3-7619774', '3-8000001'])
    expect(rows(xmlOf(order))).toHaveLength(4)
  })

  it('removes a dongle row and everything on it', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', { dongleId: 'a', endOldContract: '2026-04-30' })
    addSmaExtension(order, pdb, 'EXT SMA for ZEISS CORRELATE - Pro Line', { dongleId: 'b', endOldContract: '2026-04-30' })
    removeSmaDongle(order, pdb, 0)
    expect(smaDongles(order).map((d) => d.dongleId)).toEqual(['b'])
    expect(rows(xmlOf(order))).toHaveLength(2)
  })

  it('refuses to build an agreement with no dongle', () => {
    const { order, pdb } = build()
    expect(() =>
      addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', { dongleId: '', endOldContract: '2026-04-30' })
    ).toThrow(/dongle id/)
  })
})

describe('term length and gaps', () => {
  it('ends a twelve-month term on the month boundary, as the reference does', () => {
    expect(contractDates({ endOldContract: '2026-04-30' })).toEqual({
      endOldContract: '2026-04-30T00:00:00',
      startNewContract: '2026-05-01T00:00:00',
      endNewContract: '2027-04-30T00:00:00',
    })
  })

  it('runs a longer term for as many months as asked', () => {
    const dates = contractDates({ endOldContract: '2026-04-30', months: 18 })
    expect(dates.startNewContract).toBe('2026-05-01T00:00:00')
    expect(dates.endNewContract).toBe('2027-10-31T00:00:00')
    // GPC prices from the month count, so the two must agree.
    expect(monthsBetween(dates.startNewContract, dates.endNewContract)).toBe(18)
  })

  it('never goes below the twelve-month minimum', () => {
    const dates = contractDates({ endOldContract: '2026-04-30', months: 3 })
    expect(monthsBetween(dates.startNewContract, dates.endNewContract)).toBe(MINIMUM_CONTRACT_MONTHS)
  })

  it('leaves a gap when the new term starts later', () => {
    // Old cover ran out in July; the new agreement starts in October, and the
    // three lapsed months are not charged for.
    const dates = contractDates({
      endOldContract: '2026-07-31',
      startNewContract: '2026-10-01',
      months: 12,
    })
    expect(dates.endOldContract).toBe('2026-07-31T00:00:00')
    expect(dates.startNewContract).toBe('2026-10-01T00:00:00')
    expect(dates.endNewContract).toBe('2027-09-30T00:00:00')
    expect(monthsBetween(dates.startNewContract, dates.endNewContract)).toBe(12)
  })

  it('charges nothing for the lapsed months', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', {
      dongleId: 'd1', endOldContract: '2026-07-31', startNewContract: '2026-10-01',
    })
    const xml = xmlOf(order)
    // MsrpForMissingMonth is what GPC would bill a lapse with; it stays null.
    expect(xml).toContain('<MsrpForMissingMonth xsi:nil="true" />')
    expect(xml).not.toMatch(/<MsrpForMissingMonth>[^<]/)
    const [dongle] = smaDongles(order)
    expect(dongle.gapMonths).toBe(2)
  })

  it('reports the term a dongle row is on', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', {
      dongleId: 'd1', endOldContract: '2026-04-30', months: 24,
    })
    const [dongle] = smaDongles(order)
    expect(dongle.months).toBe(24)
    expect(dongle.gapMonths).toBe(0)
    expect(dongle.endNewContract).toBe('2028-04-30T00:00:00')
  })

  it('keeps the gap when only the term length changes', () => {
    const { order, pdb } = build()
    addSmaExtension(order, pdb, 'EXT SMA for Sensor Driver ARAMIS', {
      dongleId: 'd1', endOldContract: '2026-07-31', startNewContract: '2026-10-01',
    })
    setSmaContract(order, pdb, 0, { months: 18 })
    const [dongle] = smaDongles(order)
    expect(dongle.startNewContract).toBe('2026-10-01T00:00:00')
    expect(dongle.months).toBe(18)
    expect(dongle.endNewContract).toBe('2028-03-31T00:00:00')
  })

  it('prices a longer term pro rata', () => {
    const twelve = build()
    addSmaExtension(twelve.order, twelve.pdb, 'EXT SMA for Sensor Driver ARAMIS', {
      dongleId: 'd1', endOldContract: '2026-04-30',
    })
    const twentyFour = build()
    addSmaExtension(twentyFour.order, twentyFour.pdb, 'EXT SMA for Sensor Driver ARAMIS', {
      dongleId: 'd1', endOldContract: '2026-04-30', months: 24,
    })
    const msrp = (o: typeof twelve) => Number(smaDongles(o.order)[0].totalMsrp)
    expect(msrp(twentyFour)).toBeCloseTo(msrp(twelve) * 2, 5)
  })
})
