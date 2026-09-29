import { describe, expect, it } from 'vitest'
import { missingMonths, upgradeLines } from '../reentry.ts'
import { catalogContainer } from '../catalogContainer.ts'
import type { SmaDetails } from '../../../types/order.ts'

/**
 * DP is derived from `DiscountsData`, not from a price list's Dp column: no row
 * for an MPG means the distributor price equals the list price.
 *
 * Prices and rules as PDB290 states them: a round-DOWN rule for licences (to
 * 10) and for agreements (to 1), ReEntryFactor 0.4, GoodwillMonths 0.
 */
const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <ParametersData>
    <ReEntryFactor>0.4</ReEntryFactor>
    <GoodwillMonths>0</GoodwillMonths>
    <MaxFurtherPurchasePriceInMonth>36</MaxFurtherPurchasePriceInMonth>
  </ParametersData>
  <ArticlesData>
    <Articles>
      <Article>
        <SapNr>666031-2000-333</SapNr>
        <ArticlePriceLists>
          <ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp>965</Dp><Msrp>1608</Msrp><EuroMsrp>1608</EuroMsrp><ExchangeRate>1</ExchangeRate><DestinationFactor>1</DestinationFactor></ArticlePriceList>
        </ArticlePriceLists>
        <LongName>EXT SMA for Sensor Driver ARAMIS 24M</LongName>
        <MPG>SMA (Stand-alone / Extension)</MPG>
      </Article>
      <Article>
        <SapNr>666001-2026-333</SapNr>
        <ArticlePriceLists>
          <ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp>7515</Dp><Msrp>10736</Msrp><EuroMsrp>10736</EuroMsrp><ExchangeRate>1</ExchangeRate><DestinationFactor>1</DestinationFactor></ArticlePriceList>
        </ArticlePriceLists>
        <LongName>2026 Sensor Driver ARAMIS 24M</LongName>
        <MPG>Software (in-sys)</MPG>
      </Article>
    </Articles>
  </ArticlesData>
  <SmaUpgradesData>
    <SmaUpgrades>
      <SmaUpgrade>
        <SmaArticleName>EXT SMA for Sensor Driver ARAMIS 24M</SmaArticleName>
        <SapUpgradeNr>666011-2026-333</SapUpgradeNr>
        <LicenseArticleName>2026 Sensor Driver ARAMIS 24M</LicenseArticleName>
      </SmaUpgrade>
    </SmaUpgrades>
  </SmaUpgradesData>
  <RoundingRules>
    <RoundingRule><Rule>3 - round down</Rule><Condition>MSRP</Condition><CurrencyIso>USD</CurrencyIso><MPG>*</MPG><RangeFrom>100</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>10</RoundTo></RoundingRule>
    <RoundingRule><Rule>3 - round down</Rule><Condition>MSRP</Condition><CurrencyIso>USD</CurrencyIso><MPG>SMA (Stand-alone / Extension)</MPG><RangeFrom>0</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>1</RoundTo></RoundingRule>
    <RoundingRule><Rule>3 - round down</Rule><Condition>DP</Condition><CurrencyIso>USD</CurrencyIso><MPG>*</MPG><RangeFrom>0</RangeFrom><RangeTo>79228162514264337593543950335</RangeTo><RoundTo>1</RoundTo></RoundingRule>
  </RoundingRules>
  <DiscountsData>
    <Discounts>
      <Discount><MPG>SMA (Stand-alone / Extension)</MPG><PriceListName>Partner</PriceListName><Factor>0.4</Factor></Discount>
      <Discount><MPG>Software (in-sys)</MPG><PriceListName>Partner</PriceListName><Factor>0.3</Factor></Discount>
    </Discounts>
  </DiscountsData>
</AdministrationData>`

const sma = (over: Partial<SmaDetails['dependentLists'][0]> = {}): SmaDetails => ({
  email: '', userName: '',
  softwareArticles: [{
    name: 'EXT SMA for Sensor Driver ARAMIS 24M', dongleId: '3-123567',
    startNewContract: '2026-03-01T00:00:00', endNewContract: '2028-01-31T00:00:00',
    endOldContract: '', msrp: 1608, dp: 965,
  }],
  dependentLists: [{
    name: 'SMA', dongleId: '3-123567',
    startNewContract: '2026-03-01T00:00:00', endNewContract: '2028-01-31T00:00:00',
    endOldContract: '', months: 23, gapMonths: 0, isOlderSelected: true,
    totalMsrp: null, totalDp: null, ...over,
  }],
})

describe('counting the lapse', () => {
  it('uses the catalog maximum when the operator chose "older"', () => {
    expect(missingMonths({ endOldContract: '', startNewContract: '2026-03-01', isOlderSelected: true }, 36)).toBe(36)
  })

  it('counts whole months between the contracts, less one', () => {
    // 2023-03-31 to 2025-09-01 is the Lululemon case: 29 months.
    expect(missingMonths({ endOldContract: '2023-03-31', startNewContract: '2025-09-01', isOlderSelected: false }, 36)).toBe(29)
  })

  it('caps at the catalog maximum', () => {
    expect(missingMonths({ endOldContract: '2015-01-31', startNewContract: '2026-03-01', isOlderSelected: false }, 36)).toBe(36)
  })

  it('is zero when the new term picks up the next month', () => {
    expect(missingMonths({ endOldContract: '2026-02-28', startNewContract: '2026-03-01', isOlderSelected: false }, 36)).toBe(0)
  })
})

describe('the upgrade charged for it', () => {
  const pdb = () => catalogContainer(CONFIG)
  const inputs = { priceListName: 'Partner', currencyIso: 'USD', exchangeRate: '1.15' }

  it('is 40% of the licence, converted and rounded as the catalog says', () => {
    const [line] = upgradeLines(sma(), pdb(), inputs)
    // 10,736 EUR x 1.15 = 12,346.4 -> round DOWN to 10 -> 12,340 -> x0.4.
    // GPC's own screen shows 4,936.00 for exactly this configuration.
    expect(line.msrp).toBeCloseTo(4936, 2)
    expect(line.sapUpgradeNr).toBe('666011-2026-333')
    expect(line.licenseArticleName).toBe('2026 Sensor Driver ARAMIS 24M')
    expect(line.missingMonths).toBe(36)
  })

  it('carries the agreement\'s own DP ratio, not the licence\'s', () => {
    // GPC prices the whole support line at the agreement's dp/msrp — the
    // upgrade included — even though the money is a share of the licence.
    // The agreement discounts 40%, the licence 30%, so ~0.6 is the one that
    // wins. Not exactly 0.6: the discount is rounded before the ratio is
    // taken, which is why this is a band and not an equality.
    const [line] = upgradeLines(sma(), pdb(), inputs)
    expect(line.dp / line.msrp).toBeCloseTo(0.6, 3)
    expect(line.dp / line.msrp).not.toBeCloseTo(0.7, 2)
  })

  it('does not charge when cover never lapsed', () => {
    const none = sma({ isOlderSelected: false, endOldContract: '2026-02-28T00:00:00' })
    expect(upgradeLines(none, pdb(), inputs)).toEqual([])
  })

  it('flat: the same whether three months lapsed or thirty-six', () => {
    const short = sma({ isOlderSelected: false, endOldContract: '2025-11-30T00:00:00' })
    const [a] = upgradeLines(short, pdb(), inputs)
    const [b] = upgradeLines(sma(), pdb(), inputs)
    expect(a.msrp).toBe(b.msrp)
    expect(a.missingMonths).toBeLessThan(b.missingMonths)
  })

  it('says nothing for an agreement the catalog has no upgrade for', () => {
    const unknown = sma()
    unknown.softwareArticles[0].name = 'EXT SMA for Something Else'
    expect(upgradeLines(unknown, pdb(), inputs)).toEqual([])
  })
})
