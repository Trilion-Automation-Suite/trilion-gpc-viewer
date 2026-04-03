import { describe, it, expect } from 'vitest'
import { parseOrder } from '../parseOrder.js'

// ---------------------------------------------------------------------------
// Fixture: minimal but realistic order.xml
// ---------------------------------------------------------------------------

const ORDER_XML = `<?xml version="1.0" encoding="utf-8"?>
<OrderData>
  <OrderNumber>ORD-2025-001</OrderNumber>
  <CaseId>CASE-123</CaseId>
  <OpportunityID>OPP-456</OpportunityID>
  <Distributor>Acme Corp</Distributor>
  <HOMCenter>Berlin</HOMCenter>
  <PriceList>PL-2025</PriceList>
  <Username>john.doe</Username>
  <OrderDate>2025-01-15</OrderDate>
  <Currency>
    <Display>EUR</Display>
    <Code>978</Code>
  </Currency>
  <DestinationNew>
    <Country>Germany</Country>
  </DestinationNew>
  <Msrp>200000.00</Msrp>
  <Dp>150000.00</Dp>
  <DiscountForCustomer>0.25</DiscountForCustomer>
  <FinalPriceForEndCustomer>150000.00</FinalPriceForEndCustomer>
  <OrderValueToGom>120000.00</OrderValueToGom>

  <DependentListsData>
    <DependentListScreenData>
      <No>1</No>
      <Label>Configuration item 1</Label>
      <ConfigurationItem>
        <Name>ARAMIS Adjustable</Name>
        <GroupLevel1>System</GroupLevel1>
      </ConfigurationItem>
      <TotalMsrp>111380.00</TotalMsrp>
      <TotalDp>82018.00</TotalDp>
      <Discount>0.26</Discount>
      <IsHidden>false</IsHidden>
      <Sections>
        <SectionScreenData>
          <Name>System type</Name>
          <SectionArticles>
            <SectionArticleScreenData>
              <Name>ARAMIS Adjustable</Name>
              <Amount>1</Amount>
            </SectionArticleScreenData>
          </SectionArticles>
        </SectionScreenData>
        <SectionScreenData>
          <Name>Camera resolution</Name>
          <SectionArticles>
            <SectionArticleScreenData>
              <Name>5MP Camera</Name>
              <Amount>2</Amount>
            </SectionArticleScreenData>
          </SectionArticles>
        </SectionScreenData>
      </Sections>
      <SubConfigurations>
        <DependentListScreenData>
          <No>1.1</No>
          <Label>Sub item 1.1</Label>
          <ConfigurationItem>
            <Name>ARAMIS Sub</Name>
            <GroupLevel1>Accessory</GroupLevel1>
          </ConfigurationItem>
          <TotalMsrp>5000.00</TotalMsrp>
          <TotalDp>4000.00</TotalDp>
          <Discount>0.20</Discount>
          <IsHidden>false</IsHidden>
          <Sections />
          <SubConfigurations />
        </DependentListScreenData>
      </SubConfigurations>
    </DependentListScreenData>
    <DependentListScreenData>
      <No>2</No>
      <Label>Configuration item 2</Label>
      <ConfigurationItem>
        <Name>GOM Inspect Pro</Name>
        <GroupLevel1>Software</GroupLevel1>
      </ConfigurationItem>
      <TotalMsrp>20000.00</TotalMsrp>
      <TotalDp>15000.00</TotalDp>
      <Discount></Discount>
      <IsHidden>true</IsHidden>
      <Sections>
        <SectionScreenData>
          <Name>License type</Name>
          <SectionArticles>
            <SectionArticleScreenData>
              <Name>Perpetual</Name>
              <Amount>1</Amount>
            </SectionArticleScreenData>
          </SectionArticles>
        </SectionScreenData>
      </Sections>
      <SubConfigurations />
    </DependentListScreenData>
  </DependentListsData>

  <FreeArticlesData>
    <FreeArticlesScreenData>
      <No>3</No>
      <ConfigurationItem>
        <Name>Training Day</Name>
        <GroupLevel1>Services</GroupLevel1>
      </ConfigurationItem>
      <TotalMsrp>2000.00</TotalMsrp>
      <TotalDp>1500.00</TotalDp>
      <Discount></Discount>
      <IsHidden>false</IsHidden>
    </FreeArticlesScreenData>
  </FreeArticlesData>

  <FreeListArticlesData>
    <FreeListScreenData>
      <No>4</No>
      <ConfigurationItem>
        <Name>Custom Cable</Name>
        <GroupLevel1>Accessories</GroupLevel1>
      </ConfigurationItem>
      <TotalMsrp>500.00</TotalMsrp>
      <TotalDp>400.00</TotalDp>
      <Discount></Discount>
      <IsHidden>false</IsHidden>
    </FreeListScreenData>
  </FreeListArticlesData>

  <SupportArticlesData>
    <SupportScreenData>
      <No>5</No>
      <ConfigurationItem>
        <Name>Annual Support</Name>
        <GroupLevel1>Support</GroupLevel1>
      </ConfigurationItem>
      <TotalMsrp>10000.00</TotalMsrp>
      <TotalDp>8000.00</TotalDp>
      <Discount></Discount>
      <IsHidden>false</IsHidden>
    </SupportScreenData>
  </SupportArticlesData>
</OrderData>`

// Fixture with GomCurrency fallback instead of Currency/Display
const ORDER_XML_GOMCURRENCY = `<?xml version="1.0" encoding="utf-8"?>
<OrderData>
  <OrderNumber>ORD-2025-002</OrderNumber>
  <CaseId></CaseId>
  <OpportunityID></OpportunityID>
  <Distributor></Distributor>
  <HOMCenter></HOMCenter>
  <PriceList></PriceList>
  <Username></Username>
  <OrderDate></OrderDate>
  <GomCurrency>USD</GomCurrency>
  <DestinationNew><Country>USA</Country></DestinationNew>
  <Msrp></Msrp>
  <Dp></Dp>
  <DiscountForCustomer></DiscountForCustomer>
  <FinalPriceForEndCustomer></FinalPriceForEndCustomer>
  <OrderValueToGom></OrderValueToGom>
  <DependentListsData />
  <FreeArticlesData />
  <FreeListArticlesData />
  <SupportArticlesData />
</OrderData>`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseOrder — header fields', () => {
  const order = parseOrder(ORDER_XML)

  it('parses orderNumber', () => {
    expect(order.orderNumber).toBe('ORD-2025-001')
  })

  it('parses caseId', () => {
    expect(order.caseId).toBe('CASE-123')
  })

  it('parses opportunityId', () => {
    expect(order.opportunityId).toBe('OPP-456')
  })

  it('parses distributor', () => {
    expect(order.distributor).toBe('Acme Corp')
  })

  it('parses homCenter', () => {
    expect(order.homCenter).toBe('Berlin')
  })

  it('parses priceList', () => {
    expect(order.priceList).toBe('PL-2025')
  })

  it('parses username', () => {
    expect(order.username).toBe('john.doe')
  })

  it('parses orderDate', () => {
    expect(order.orderDate).toBe('2025-01-15')
  })

  it('parses currency from Currency/Display', () => {
    expect(order.currency).toBe('EUR')
  })

  it('parses destination country', () => {
    expect(order.destination).toBe('Germany')
  })
})

describe('parseOrder — totals', () => {
  const order = parseOrder(ORDER_XML)

  it('parses msrp', () => {
    expect(order.msrp).toBe(200000)
  })

  it('parses dp', () => {
    expect(order.dp).toBe(150000)
  })

  it('parses discountForCustomer', () => {
    expect(order.discountForCustomer).toBe(0.25)
  })

  it('parses finalPriceForEndCustomer', () => {
    expect(order.finalPriceForEndCustomer).toBe(150000)
  })

  it('parses orderValueToGom', () => {
    expect(order.orderValueToGom).toBe(120000)
  })
})

describe('parseOrder — items from all 4 list types', () => {
  const order = parseOrder(ORDER_XML)

  it('finds all 6 items (2 dependent + 1 sub + 1 free + 1 freeList + 1 support)', () => {
    expect(order.items).toHaveLength(6)
  })

  it('includes dependent items', () => {
    const dep = order.items.filter((i) => i.itemType === 'dependent')
    expect(dep).toHaveLength(2)
  })

  it('includes sub-configuration items', () => {
    const sub = order.items.filter((i) => i.itemType === 'sub')
    expect(sub).toHaveLength(1)
  })

  it('includes free article items', () => {
    const free = order.items.filter((i) => i.itemType === 'free')
    expect(free).toHaveLength(1)
  })

  it('includes free list items', () => {
    const fl = order.items.filter((i) => i.itemType === 'freeList')
    expect(fl).toHaveLength(1)
  })

  it('includes support items', () => {
    const sup = order.items.filter((i) => i.itemType === 'support')
    expect(sup).toHaveLength(1)
  })
})

describe('parseOrder — dependent item details', () => {
  const order = parseOrder(ORDER_XML)
  const item1 = order.items.find((i) => i.no === '1')!

  it('parses no correctly', () => {
    expect(item1.no).toBe('1')
  })

  it('parses label', () => {
    expect(item1.label).toBe('Configuration item 1')
  })

  it('parses category from GroupLevel1', () => {
    expect(item1.category).toBe('System')
  })

  it('parses name from ConfigurationItem/Name', () => {
    expect(item1.name).toBe('ARAMIS Adjustable')
  })

  it('extracts systemType from "System type" section', () => {
    expect(item1.systemType).toBe('ARAMIS Adjustable')
  })

  it('parses totalMsrp', () => {
    expect(item1.totalMsrp).toBe(111380)
  })

  it('parses totalDp', () => {
    expect(item1.totalDp).toBe(82018)
  })

  it('parses discountOverride', () => {
    expect(item1.discountOverride).toBe(0.26)
  })

  it('isHidden is false', () => {
    expect(item1.isHidden).toBe(false)
  })

  it('isSub is false for top-level item', () => {
    expect(item1.isSub).toBe(false)
  })
})

describe('parseOrder — system type extraction', () => {
  const order = parseOrder(ORDER_XML)

  it('does NOT extract system type from "License type" section (only "System type")', () => {
    const item2 = order.items.find((i) => i.no === '2')!
    expect(item2.systemType).toBe('')
  })

  it('systemType is empty for free articles', () => {
    const free = order.items.find((i) => i.itemType === 'free')!
    expect(free.systemType).toBe('')
  })
})

describe('parseOrder — sub-configurations', () => {
  const order = parseOrder(ORDER_XML)
  const sub = order.items.find((i) => i.no === '1.1')!

  it('finds sub-configuration item', () => {
    expect(sub).toBeDefined()
  })

  it('sub item has isSub=true', () => {
    expect(sub.isSub).toBe(true)
  })

  it('sub item has itemType="sub"', () => {
    expect(sub.itemType).toBe('sub')
  })

  it('sub item name is parsed', () => {
    expect(sub.name).toBe('ARAMIS Sub')
  })
})

describe('parseOrder — hidden items', () => {
  const order = parseOrder(ORDER_XML)
  const hidden = order.items.find((i) => i.no === '2')!

  it('flags hidden items but includes them', () => {
    expect(hidden).toBeDefined()
    expect(hidden.isHidden).toBe(true)
  })
})

describe('parseOrder — null/missing price fields', () => {
  const order = parseOrder(ORDER_XML)
  const item2 = order.items.find((i) => i.no === '2')!

  it('returns null for empty Discount element', () => {
    expect(item2.discountOverride).toBeNull()
  })
})

describe('parseOrder — sort order', () => {
  const order = parseOrder(ORDER_XML)
  const nos = order.items.map((i) => i.no)

  it('items are sorted: 1, 1.1, 2, 3, 4, 5', () => {
    expect(nos).toEqual(['1', '1.1', '2', '3', '4', '5'])
  })
})

describe('parseOrder — GomCurrency fallback', () => {
  it('uses GomCurrency when Currency/Display is absent', () => {
    const order = parseOrder(ORDER_XML_GOMCURRENCY)
    expect(order.currency).toBe('USD')
  })

  it('returns null for empty numeric fields', () => {
    const order = parseOrder(ORDER_XML_GOMCURRENCY)
    expect(order.msrp).toBeNull()
    expect(order.dp).toBeNull()
  })
})

describe('parseOrder — section detail (dependent items)', () => {
  const order = parseOrder(ORDER_XML)
  const item1 = order.items.find((i) => i.no === '1')!

  it('parses sections for dependent items', () => {
    expect(item1.sections.length).toBeGreaterThan(0)
  })

  it('finds the "System type" section', () => {
    const sysSection = item1.sections.find((s) => s.name.toLowerCase() === 'system type')
    expect(sysSection).toBeDefined()
  })

  it('section articles have amount > 0', () => {
    item1.sections.forEach((sec) => {
      sec.articles.forEach((art) => {
        expect(art.amount).toBeGreaterThan(0)
      })
    })
  })

  it('section article names are non-empty', () => {
    item1.sections.forEach((sec) => {
      sec.articles.forEach((art) => {
        expect(art.name).toBeTruthy()
      })
    })
  })

  it('free/support items have empty sections array', () => {
    const freeItem = order.items.find((i) => i.itemType === 'free')!
    expect(freeItem.sections).toEqual([])
  })
})

describe('parseOrder — invalid XML', () => {
  it('throws on malformed XML', () => {
    expect(() => parseOrder('<broken><xml')).toThrow('parseOrder: XML parse error')
  })
})
