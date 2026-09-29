/**
 * The upgrade GPC charges when software cover has lapsed.
 *
 * When an agreement restarts after a gap, GPC adds a charge it labels
 * **Upgrade** in its own UI — the code calls it a re-entry fee, and the catalog
 * gives it a SAP number of its own in the `666011-` family, distinct from the
 * licence (`666001-`) and the agreement (`666031-`). It is a real product, not
 * a surcharge.
 *
 * It does **not** scale with the length of the lapse. Any gap past the
 * catalog's goodwill window costs a flat share of the current licence price —
 * 40% in PDB290 — so three months and twenty-nine months cost the same.
 *
 * None of this is stored in the file: GPC recomputes it on open and keeps only
 * the totals. So the viewer computes it too, for display, and writes nothing.
 *
 * From `AdministrationDataExt.CalculateReEntryFee` and
 * `SupportArticleCalculationHelper`, and checked to the cent against a
 * configuration GPC produced.
 */
import type { GpcContainer } from './container.ts'
import type { SmaDependentList, SmaDetails } from '../../types/order.js'
import { readPdbConfig } from './blankOrder.ts'
import { findArticle, priceArticle } from './addItem.ts'
import { scanDiscounts, scanRoundingRules } from './roundingRules.ts'
import type { ElementValue } from './orderXml.ts'
import { formatDecimal, multiply, parseDecimal } from './decimal.ts'
import type { Dec } from './decimal.ts'

/** A licence whose name says the agreement is already in its price. */
const INCLUDES_SMA = /\(\s*incl[.\s]+sma\s*\)/i

export interface UpgradeLine {
  dongleId: string
  /** The agreement this upgrade belongs to. */
  smaArticleName: string
  /** The licence it brings up to date — the current year's. */
  licenseArticleName: string
  /** The catalog's own SAP number for the upgrade. */
  sapUpgradeNr: string
  msrp: number
  dp: number
  /** Months of lapsed cover, as GPC counts them. */
  missingMonths: number
}

function text(e: ElementValue, name: string): string | null {
  const v = e.members.find((m) => m.name === name)?.value
  return v && v.kind === 'text' ? (v.value ?? null) : null
}

function sub(e: ElementValue, name: string): ElementValue | null {
  const v = e.members.find((m) => m.name === name)?.value
  return v && v.kind === 'element' ? v : null
}

function kids(e: ElementValue | null): ElementValue[] {
  if (!e) return []
  return e.members.map((m) => m.value).filter((v): v is ElementValue => v.kind === 'element')
}

function parameter(config: ElementValue, name: string, fallback: number): number {
  const value = text(sub(config, 'ParametersData') ?? config, name)
  const n = value === null ? NaN : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** `SmaArticleName` → the licence it upgrades and the SAP number for it. */
function findUpgrade(config: ElementValue, smaArticleName: string):
  { licenseArticleName: string; sapUpgradeNr: string } | null {
  for (const row of kids(sub(sub(config, 'SmaUpgradesData') ?? config, 'SmaUpgrades'))) {
    if (text(row, 'SmaArticleName') !== smaArticleName) continue
    const licenseArticleName = text(row, 'LicenseArticleName')
    if (!licenseArticleName) return null
    return { licenseArticleName, sapUpgradeNr: text(row, 'SapUpgradeNr') ?? '' }
  }
  return null
}

/**
 * Months of cover missed, GPC's way.
 *
 * `isOlderSelected` means the operator chose "older" rather than a date, and
 * the catalog's maximum stands in. Otherwise it is the whole months between
 * the two contracts, less one, capped at that same maximum.
 */
export function missingMonths(row: Pick<SmaDependentList, 'endOldContract' | 'startNewContract' | 'isOlderSelected'>, max: number): number {
  if (row.isOlderSelected) return max
  const [ey, em] = row.endOldContract.slice(0, 10).split('-').map(Number)
  const [sy, sm] = row.startNewContract.slice(0, 10).split('-').map(Number)
  if (!ey || !sy) return 0
  return Math.min(max, (sy - ey) * 12 + (sm - em) - 1)
}

export interface UpgradeInputs {
  priceListName: string
  currencyIso: string
  /** The order's exchange rate, as a decimal string — `Currency/ExchangeRate`. */
  exchangeRate: string
}

/**
 * One upgrade line per agreement whose cover lapsed, or none.
 *
 * Computed, never written: the file carries only the totals, and a save must
 * leave those exactly as they are.
 */
export function upgradeLines(sma: SmaDetails, pdb: GpcContainer, inputs: UpgradeInputs): UpgradeLine[] {
  const config = readPdbConfig(pdb)
  const configText = new TextDecoder('utf-8').decode(
    pdb.entries.find((e) => e.name === 'config.xml')?.data ?? new Uint8Array()
  )
  const factor = parameter(config, 'ReEntryFactor', 0)
  const goodwill = parameter(config, 'GoodwillMonths', 0)
  const max = parameter(config, 'MaxFurtherPurchasePriceInMonth', 36)
  if (factor === 0) return []

  const rules = scanRoundingRules(configText)
  const discounts = scanDiscounts(configText)
  const rate = parseDecimal(inputs.exchangeRate || '1')

  const out: UpgradeLine[] = []
  for (const row of sma.dependentLists) {
    const months = missingMonths(row, max)
    if (months <= goodwill) continue

    for (const article of sma.softwareArticles) {
      if (article.dongleId !== row.dongleId) continue
      const upgrade = findUpgrade(config, article.name)
      if (!upgrade) continue

      let licensePrice
      let agreementPrice
      try {
        licensePrice = priceArticle(
          findArticle(config, upgrade.licenseArticleName),
          inputs.priceListName, rate, rules, inputs.currencyIso, discounts
        )
        agreementPrice = priceArticle(
          findArticle(config, article.name),
          inputs.priceListName, rate, rules, inputs.currencyIso, discounts
        )
      } catch {
        // The catalog does not carry one of them; say nothing rather than
        // show a price that is not the catalog's.
        continue
      }

      const num = (d: Dec): number => Number(formatDecimal(d))
      const licenseMsrp = num(licensePrice.msrp)
      const agreementMsrp = num(agreementPrice.msrp)
      const agreementDp = num(agreementPrice.dp)
      // A licence sold with the agreement already in it is charged only for
      // the difference — otherwise the agreement would be paid for twice.
      const base = INCLUDES_SMA.test(upgrade.licenseArticleName) ? licenseMsrp - agreementMsrp : licenseMsrp
      // Kept in the decimal type so the factor multiplies exactly, the way
      // .NET's decimal does, rather than through binary floating point.
      const msrp = Number(formatDecimal(multiply(parseDecimal(base.toFixed(6)), parseDecimal(String(factor)))))
      // GPC prices the whole support line at the agreement's own dp/msrp
      // ratio, the upgrade included.
      const ratio = agreementMsrp === 0 ? 0 : agreementDp / agreementMsrp

      out.push({
        dongleId: row.dongleId,
        smaArticleName: article.name,
        licenseArticleName: upgrade.licenseArticleName,
        sapUpgradeNr: upgrade.sapUpgradeNr,
        msrp,
        dp: msrp * ratio,
        missingMonths: months,
      })
    }
  }
  return out
}
