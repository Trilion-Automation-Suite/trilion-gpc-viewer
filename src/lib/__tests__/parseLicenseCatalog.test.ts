import { describe, it, expect } from 'vitest'
import { buildLicenseCatalogFromConfig } from '../parseLicenseCatalog.js'

/**
 * The licence picker was empty for every modern file: the catalog was read from
 * a <Database> element embedded in order.xml, which current files no longer
 * carry. config.xml is the real source.
 */
const CONFIG = `<AdministrationData>
  <ConfigurationItemsData>
    <ConfigurationItems>
      <ConfigurationItem>
        <GroupLevel1>Software License</GroupLevel1><GroupLevel2>ZEISS Software</GroupLevel2>
        <Name>ZEISS Software</Name><SapNr>SAP-1</SapNr><ItemType>DependentList</ItemType>
      </ConfigurationItem>
      <ConfigurationItem>
        <GroupLevel1>Accessories</GroupLevel1><Name>Custom Accessory</Name><ItemType>FreeArticles</ItemType>
      </ConfigurationItem>
      <ConfigurationItem>
        <GroupLevel1>Software License</GroupLevel1><GroupLevel2>Education License</GroupLevel2>
        <Name>Education License</Name><ItemType>DependentList</ItemType>
      </ConfigurationItem>
    </ConfigurationItems>
  </ConfigurationItemsData>
</AdministrationData>`

describe('buildLicenseCatalogFromConfig', () => {
  it('returns only Software License items, sorted', () => {
    const entries = buildLicenseCatalogFromConfig(CONFIG)
    expect(entries.map((e) => e.name)).toEqual(['Education License', 'ZEISS Software'])
  })

  it('carries the details the picker shows', () => {
    const zeiss = buildLicenseCatalogFromConfig(CONFIG).find((e) => e.name === 'ZEISS Software')
    expect(zeiss).toEqual({
      name: 'ZEISS Software',
      category: 'Software License',
      subCategory: 'ZEISS Software',
      sapNr: 'SAP-1',
    })
  })

  it('is empty, not broken, when there is no catalog', () => {
    expect(buildLicenseCatalogFromConfig('<AdministrationData />')).toEqual([])
  })
})
