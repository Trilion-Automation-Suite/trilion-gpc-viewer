import { describe, it, expect } from 'vitest'
import { scanArticles, scanCurrencyRates, sliceSection } from '../configScan.js'
import { buildArticlePriceMap, parseCurrencyRates } from '../parseConfig.js'

/**
 * A config exercising the cases the scanner has to get right: the named price
 * list, the fallback to the first when it is absent, MPG winning over
 * GroupLevel1, missing optional fields, and an article with no price list at
 * all (which both implementations skip).
 */
const CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<AdministrationData>
  <CurrenciesData>
    <Currencies>
      <Currency><Iso>EUR</Iso><ExchangeRate>1</ExchangeRate><ValidFrom>100</ValidFrom></Currency>
      <Currency><Iso>USD</Iso><ExchangeRate>1.10</ExchangeRate><ValidFrom>100</ValidFrom></Currency>
      <Currency><Iso>USD</Iso><ExchangeRate>1.15</ExchangeRate><ValidFrom>200</ValidFrom></Currency>
      <Currency><Iso>GBP</Iso><ExchangeRate>0.9</ExchangeRate><ValidFrom>150</ValidFrom></Currency>
    </Currencies>
  </CurrenciesData>
  <ArticlesData>
    <Articles>
      <Article>
        <LongName>Named list wins</LongName><SapNr>SAP-1</SapNr><Unit>pcs</Unit>
        <MPG>Spareparts</MPG><GroupLevel1>Ignored</GroupLevel1>
        <ArticlePriceLists>
          <ArticlePriceList><Name>Euro</Name><Currency>EUR</Currency><Dp>100</Dp><Msrp>200</Msrp></ArticlePriceList>
          <ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp>70</Dp><Msrp>200</Msrp></ArticlePriceList>
        </ArticlePriceLists>
      </Article>
      <Article>
        <LongName>Falls back to first</LongName><SapNr>SAP-2</SapNr><Unit>-</Unit>
        <GroupLevel1>Used when no MPG</GroupLevel1>
        <ArticlePriceLists>
          <ArticlePriceList><Name>Euro</Name><Currency>EUR</Currency><Dp>10</Dp><Msrp>20</Msrp></ArticlePriceList>
        </ArticlePriceLists>
      </Article>
      <Article>
        <LongName>No price list at all</LongName><SapNr>SAP-3</SapNr>
      </Article>
      <Article>
        <LongName>Empty price fields</LongName><SapNr>SAP-4</SapNr>
        <ArticlePriceLists>
          <ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Dp></Dp><Msrp></Msrp></ArticlePriceList>
        </ArticlePriceLists>
      </Article>
    </Articles>
  </ArticlesData>
</AdministrationData>`

describe('configScan matches the DOM implementation', () => {
  it('produces the same article prices', () => {
    const scanned = scanArticles(CONFIG, 'Partner')
    const dom = buildArticlePriceMap(CONFIG, 'Partner')

    expect(scanned.length).toBe(dom.size)
    for (const a of scanned) {
      const expected = dom.get(a.longName)
      expect(expected, `missing ${a.longName}`).toBeDefined()
      expect({ msrp: a.msrp, dp: a.dp, sapNr: a.sapNr, unit: a.unit, category: a.category, currency: a.currency })
        .toEqual(expected)
    }
  })

  it('produces the same currency rates', () => {
    expect(scanCurrencyRates(CONFIG)).toEqual(parseCurrencyRates(CONFIG))
  })

  it('picks the most recent rate per ISO', () => {
    expect(scanCurrencyRates(CONFIG).USD).toBe(1.15)
  })

  it('prefers MPG over GroupLevel1, and falls back when MPG is absent', () => {
    const byName = new Map(scanArticles(CONFIG, 'Partner').map((a) => [a.longName, a]))
    expect(byName.get('Named list wins')?.category).toBe('Spareparts')
    expect(byName.get('Falls back to first')?.category).toBe('Used when no MPG')
  })

  it('falls back to the first price list when the named one is absent', () => {
    expect(scanArticles(CONFIG, 'Partner').find((a) => a.longName === 'Falls back to first')?.dp).toBe(10)
  })

  it('skips articles with no price list, as the DOM version does', () => {
    expect(scanArticles(CONFIG, 'Partner').some((a) => a.longName === 'No price list at all')).toBe(false)
  })

  it('returns nothing for a missing section rather than throwing', () => {
    expect(sliceSection('<AdministrationData />', 'ArticlesData')).toBeNull()
    expect(scanArticles('<AdministrationData />', 'Partner')).toEqual([])
    expect(scanCurrencyRates('<AdministrationData />')).toEqual({})
  })
})

describe('software-support articles', () => {
  it('is flagged from the escaped filter tag the catalog writes', () => {
    const config = `<AdministrationData>
  <ArticlesData>
    <Articles>
      <Article>
        <LongName>EXT SMA for Sensor Driver ARAMIS</LongName>
        <SapNr>000250-1</SapNr>
        <Unit>pcs</Unit>
        <MPG>SMA</MPG>
        <FilterTags>&lt;software-support&gt;</FilterTags>
        <ArticlePriceLists>
          <ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Msrp>1563</Msrp><Dp>1563</Dp></ArticlePriceList>
        </ArticlePriceLists>
      </Article>
      <Article>
        <LongName>Calibration Panel CPA30/210</LongName>
        <SapNr>000250-2</SapNr>
        <Unit>pcs</Unit>
        <MPG>Spare</MPG>
        <FilterTags>&lt;Articles&gt;spare</FilterTags>
        <ArticlePriceLists>
          <ArticlePriceList><Name>Partner</Name><Currency>EUR</Currency><Msrp>1070</Msrp><Dp>749</Dp></ArticlePriceList>
        </ArticlePriceLists>
      </Article>
    </Articles>
  </ArticlesData>
</AdministrationData>`
    const found = scanArticles(config, 'Partner')
    expect(found.map((a) => [a.longName, a.isSoftwareSupport])).toEqual([
      ['EXT SMA for Sensor Driver ARAMIS', true],
      ['Calibration Panel CPA30/210', false],
    ])
  })
})
