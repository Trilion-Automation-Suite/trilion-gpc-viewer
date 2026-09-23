import { describe, expect, it } from 'vitest'
import { parseOrderXml, serializeOrderXml } from '../orderXml.ts'
import { catalogContainer } from '../catalogContainer.ts'
import { parseOrder } from '../../parseOrder.js'
import { decodeOrderBlock, planOrderBlock, ORDER_BLOCK_VERSION } from '../orderBlock.ts'
import type { OrderBlock } from '../orderBlock.ts'
import { applyOrderBlockItems, applyOrderBlockFields, fieldChanges } from '../applyOrderBlock.ts'
import { smaDongles } from '../sma.ts'
import { validateOrderXml, describeViolations } from '../validateOrder.ts'

const ARTICLE = (name: string, sap: string, tags = '') => `
      <Article>
        <SapNr>${sap}</SapNr>
        <ApplicableFee>-2147483648</ApplicableFee>
        <ArticlePriceLists>
          <ArticlePriceList>
            <Name>Partner</Name>
            <Currency>EUR</Currency>
            <Dp>800</Dp>
            <Msrp>1000</Msrp>
            <EuroMsrp>1000</EuroMsrp>
          </ArticlePriceList>
        </ArticlePriceLists>
        <FilterTags>${tags}</FilterTags>
        <LongName>${name}</LongName>
        <Unit>pcs</Unit>
        <MPG>Spare</MPG>
      </Article>`

const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ParametersData>
    <VersionName>PDB290_09-2026</VersionName>
  </ParametersData>
  <ArticlesData>
    <Articles>${ARTICLE('Calibration Panel CPA30/210', '000250-0004-933', 'spare')}${ARTICLE('Twin Of CPA30', '000250-0004-933', 'spare')}${ARTICLE('External Dongle without System', 'SAP-DONGLE', 'spare')}${ARTICLE('EXT SMA for Sensor Driver ARAMIS', 'SAP-SMA', '&lt;software-support&gt;')}${ARTICLE('2026 Sensor Driver ARAMIS', 'SAP-LIC')}
    </Articles>
  </ArticlesData>
  <ConfigurationItemsData>
    <ConfigurationItems>
      <ConfigurationItem>
        <GroupLevel1>Spare Parts</GroupLevel1>
        <Name>Spare Parts</Name>
        <WorksheetArticleFilter>&lt;Articles&gt;spare</WorksheetArticleFilter>
        <ItemType>FreeList</ItemType>
      </ConfigurationItem>
      <ConfigurationItem>
        <GroupLevel1>ZEISS Metrology Care</GroupLevel1>
        <Name>Software Maintenance Agreement</Name>
        <WorksheetArticleFilter>&lt;Support&gt;SMA_EXT</WorksheetArticleFilter>
        <ItemType>Supportextension</ItemType>
      </ConfigurationItem>
      <ConfigurationItem>
        <GroupLevel1>Software License</GroupLevel1>
        <GroupLevel2>ZEISS Software</GroupLevel2>
        <Name>ZEISS Software</Name>
        <WorksheetArticleFilter>SASW2025</WorksheetArticleFilter>
        <ItemType>DependentList</ItemType>
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
            <Selection><SelectionMode>ExactlyOne</SelectionMode></Selection>
            <Articles>
              <SectionArticle>
                <LongName>External Dongle without System</LongName>
                <Step>1</Step>
                <DefaultAmount>1</DefaultAmount>
              </SectionArticle>
            </Articles>
          </Section>
          <Section>
            <LongName>Software Maintenance Agreement for Sensor Drivers</LongName>
            <Selection><SelectionMode>MinXMaxY</SelectionMode></Selection>
            <Articles>
              <SectionArticle>
                <LongName>EXT SMA for Sensor Driver ARAMIS</LongName>
                <Step>1</Step>
                <DefaultAmount>0</DefaultAmount>
              </SectionArticle>
            </Articles>
          </Section>
        </Sections>
      </DependentList>
      <DependentList>
        <DependentListName>SASW2025</DependentListName>
        <Sections>
          <Section>
            <LongName>Sensor Driver</LongName>
            <Selection><SelectionMode>OneOrMore</SelectionMode></Selection>
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
  <AccountDetailsData>
    <AccountNumber>2104995</AccountNumber>
    <IsDistributor>false</IsDistributor>
    <IsNewCustomer>false</IsNewCustomer>
  </AccountDetailsData>
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

const envelope = (value: unknown) =>
  `-----BEGIN GPC ORDER-----\n${btoa(JSON.stringify(value))
    .replace(/(.{60})/g, '$1\n')}\n-----END GPC ORDER-----`

const BLOCK: OrderBlock = {
  gpcOrder: ORDER_BLOCK_VERSION,
  source: { system: 'odoo', ref: 'S00211' },
  catalog: 'PDB290_09-2026',
  account: { companyName: 'Acme Metrology', city: 'Portland', country: 'United States of America' },
  contact: { firstName: 'Alex', lastName: 'Rivera', email: 'alex@example.com' },
  administration: { shippingCity: 'Portland', shippingMethod: 'Air' },
  items: [
    { type: 'article', sapNr: '000250-0004-933', name: 'Calibration Panel CPA30/210', amount: 2 },
    { type: 'license', name: '2026 Sensor Driver ARAMIS', userEmail: 'licensing@trilion.com', userName: 'Trilion Licensing' },
    {
      type: 'sma',
      dongleId: '3-7619774',
      endOldContract: '2026-07',
      startNewContract: '2026-10',
      months: 12,
      articles: ['EXT SMA for Sensor Driver ARAMIS'],
      licenseUserEmail: 'licensing@trilion.com',
      licenseUserName: 'Trilion Licensing',
    },
  ],
}

const build = () => ({
  doc: parseOrderXml(new TextEncoder().encode(ORDER)),
  pdb: catalogContainer(CONFIG),
})

describe('decoding a pasted block', () => {
  it('reads the base64 envelope, line breaks and all', () => {
    expect(decodeOrderBlock(envelope(BLOCK)).source?.ref).toBe('S00211')
  })

  it('reads bare JSON, so a generator can be debugged by eye', () => {
    expect(decodeOrderBlock(JSON.stringify(BLOCK)).catalog).toBe('PDB290_09-2026')
  })

  it('ignores whatever surrounds the envelope', () => {
    const pasted = `Here you go:\n\n${envelope(BLOCK)}\n\nRegards,\nSales`
    expect(decodeOrderBlock(pasted).gpcOrder).toBe(ORDER_BLOCK_VERSION)
  })

  it('refuses a future format version rather than guessing at it', () => {
    expect(() => decodeOrderBlock(JSON.stringify({ ...BLOCK, gpcOrder: 99 }))).toThrow(/version 99/)
  })

  it('names the problem when the block is truncated', () => {
    const cut = envelope(BLOCK).replace('-----END GPC ORDER-----', '')
    expect(() => decodeOrderBlock(cut)).toThrow(/missing its/)
  })

  it('rejects something that is not a block at all', () => {
    expect(() => decodeOrderBlock('{"hello":1}')).toThrow(/no "gpcOrder"/)
    expect(() => decodeOrderBlock('   ')).toThrow(/Nothing pasted/)
  })
})

describe('planning, before anything is applied', () => {
  it('resolves every kind of item', () => {
    const { pdb } = build()
    const plan = planOrderBlock(BLOCK, pdb, 'PDB290_09-2026')
    expect(plan.ok).toBe(true)
    expect(plan.items.map((i) => i.resolved?.kind)).toEqual(['article', 'license', 'sma'])
    expect(plan.warnings).toEqual([])
  })

  it('warns when the block came from another catalog', () => {
    const { pdb } = build()
    const plan = planOrderBlock(BLOCK, pdb, 'PDB285_01-2026')
    expect(plan.warnings.join(' ')).toMatch(/built against PDB290_09-2026.*on PDB285_01-2026/)
  })

  it('reports an unknown article instead of dropping it', () => {
    const { pdb } = build()
    const plan = planOrderBlock(
      { ...BLOCK, items: [{ type: 'article', sapNr: 'NOPE', name: 'Nothing Like This' }] },
      pdb
    )
    expect(plan.ok).toBe(false)
    expect(plan.items[0].problem).toMatch(/Neither SAP NOPE nor the name/)
  })

  it('asks for a name when a SAP number is ambiguous', () => {
    const { pdb } = build()
    const plan = planOrderBlock({ ...BLOCK, items: [{ type: 'article', sapNr: '000250-0004-933' }] }, pdb)
    expect(plan.items[0].problem).toMatch(/matches 2 articles/)
  })

  it('uses the name to settle an ambiguous SAP number', () => {
    const { pdb } = build()
    const plan = planOrderBlock(
      { ...BLOCK, items: [{ type: 'article', sapNr: '000250-0004-933', name: 'Twin Of CPA30' }] },
      pdb
    )
    expect(plan.items[0].resolved).toMatchObject({ articleName: 'Twin Of CPA30' })
  })

  it('will not take a term shorter than the minimum', () => {
    const { pdb } = build()
    const plan = planOrderBlock(
      { ...BLOCK, items: [{ type: 'sma', dongleId: 'd1', endOldContract: '2026-07', months: 3, articles: ['EXT SMA for Sensor Driver ARAMIS'] }] },
      pdb
    )
    expect(plan.items[0].problem).toMatch(/at least 12 months/)
  })

  it('names what a half-written item is missing', () => {
    const { pdb } = build()
    const plan = planOrderBlock(
      { ...BLOCK, items: [
        { type: 'sma', dongleId: '', endOldContract: '2026-07', articles: ['x'] },
        { type: 'license' },
        { type: 'mystery' },
      ] as never },
      pdb
    )
    expect(plan.items.map((i) => i.problem)).toEqual([
      'A maintenance agreement needs a "dongleId".',
      'A license item needs a "name".',
      'Unknown item type "mystery".',
    ])
  })
})

describe('applying a block', () => {
  it('builds the whole configuration in one pass', () => {
    const { doc, pdb } = build()
    const plan = planOrderBlock(BLOCK, pdb, 'PDB290_09-2026')
    const report = applyOrderBlockItems(doc, pdb, plan)

    expect(report.failed).toEqual([])
    expect(report.added).toHaveLength(3)

    const xml = new TextDecoder().decode(serializeOrderXml(doc))
    expect(xml).toContain('<LongName>Calibration Panel CPA30/210</LongName>')
    expect(xml).toContain('<Name>2026 Sensor Driver ARAMIS</Name>')
    expect(xml).toContain('<ItemType>DongleList</ItemType>')

    const [dongle] = smaDongles(doc)
    expect(dongle.dongleId).toBe('3-7619774')
    // 2026-07 -> the term starts in October, leaving two lapsed months.
    expect(dongle.startNewContract).toBe('2026-10-01T00:00:00')
    expect(dongle.endNewContract).toBe('2027-09-30T00:00:00')
    expect(dongle.gapMonths).toBe(2)

    expect(describeViolations(validateOrderXml(xml))).toBe('')
  })

  it('carries on past an item that fails, and says which', () => {
    const { doc, pdb } = build()
    const plan = planOrderBlock(
      {
        ...BLOCK,
        items: [
          { type: 'article', name: 'Calibration Panel CPA30/210' },
          { type: 'article', name: 'Not In This Catalog' },
          { type: 'article', name: 'External Dongle without System' },
        ],
      },
      pdb
    )
    const report = applyOrderBlockItems(doc, pdb, plan)
    expect(report.added).toHaveLength(2)
    expect(report.failed).toEqual([
      { what: 'item 2', problem: '"Not In This Catalog" is not in this catalog.' },
    ])
  })

  it('fills the customer fields and leaves the rest alone', () => {
    const order = parseOrder(ORDER)
    const { pdb } = build()
    const plan = planOrderBlock(BLOCK, pdb)
    const next = applyOrderBlockFields(order, plan)

    expect(next.account.companyName).toBe('Acme Metrology')
    expect(next.contact.firstName).toBe('Alex')
    expect(next.administration.shippingCity).toBe('Portland')
    // Not in the block, so not touched.
    expect(next.account.accountNumber).toBe(order.account.accountNumber)
    expect(next.account.vatId).toBe(order.account.vatId)
  })

  it('shows what it would change before it changes it', () => {
    const order = parseOrder(ORDER)
    const { pdb } = build()
    const changes = fieldChanges(order, planOrderBlock(BLOCK, pdb))
    expect(changes).toContain('Account · companyName: (empty) → Acme Metrology')
    expect(changes).toContain('Contact · email: (empty) → alex@example.com')
    expect(changes.some((c) => c.startsWith('Account · accountNumber'))).toBe(false)
  })
})

describe('values GPC has to recognise', () => {
  it('warns about an address type the configurator does not know', () => {
    const { pdb } = build()
    const plan = planOrderBlock(
      { ...BLOCK, administration: { invoiceAddressType: 'GPC Partner' }, items: [] },
      pdb
    )
    // Copied through verbatim, so an invented value reaches GPC as-is.
    expect(plan.warnings.join(' ')).toMatch(/invoiceAddressType is "GPC Partner", which GPC does not know/)
    expect(plan.warnings.join(' ')).toContain('GOM Partner')
  })

  it('accepts the four it does know', () => {
    const { pdb } = build()
    for (const value of ['Customer', 'GOM Partner', 'Order Process Center', 'Other Address']) {
      const plan = planOrderBlock(
        { ...BLOCK, administration: { shippingAddressType: value }, items: [] },
        pdb
      )
      expect(plan.warnings.join(' ')).not.toMatch(/does not know/)
    }
  })
})

describe('blocks that arrive damaged', () => {
  const body = () => envelope(BLOCK).split('\n').slice(1, -1).join('\n')

  it('reads the base64 body when the envelope lines are gone', () => {
    // A chat client that eats a line of dashes, or a selection that began on
    // the second line. The body alone is unambiguous.
    expect(decodeOrderBlock(body()).gpcOrder).toBe(ORDER_BLOCK_VERSION)
  })

  it('reads it as one unwrapped line too', () => {
    expect(decodeOrderBlock(body().replace(/\n/g, '')).catalog).toBe('PDB290_09-2026')
  })

  it('still says something useful about text that is neither', () => {
    expect(() => decodeOrderBlock('Dear Bob,\n\nplease find attached')).toThrow(/does not look like a GPC order block/)
  })
})
