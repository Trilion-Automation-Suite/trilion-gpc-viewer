/**
 * Assembling a complete .gconfiguration.
 *
 * A saved order is the PDB's catalog with the order part swapped in: the same
 * `version.xml` and `config.xml`, a freshly written `order.xml`, and the two OPC
 * parts rebuilt. Confirmed against reference files, whose `version.xml` is
 * byte-identical to the source PDB's and whose ~50 MB `config.xml` differs from
 * it in exactly one field.
 *
 * The parts that change on every save — the ZIP timestamp and the three
 * relationship Ids — are inputs here rather than generated internally, so the
 * fidelity harness can pin them (spec §0) while the app supplies fresh ones.
 */
import type { GpcContainer, GpcEntry } from './container.ts'
import { METHOD_DEFLATE, METHOD_STORED, writeContainer } from './container.ts'
import type { OrderDocument } from './orderXml.ts'
import { serializeOrderXml } from './orderXml.ts'

const BOM = '﻿'

export interface GpcFilePins {
  /** Shared DOS date/time for every ZIP header. */
  dosTime: number
  dosDate: number
  /** `"R" + Guid.NewGuid().ToString("N").Substring(0,16)`, one per relationship. */
  versionRelId: string
  configRelId: string
  orderRelId: string
  /**
   * `CurrenciesData/LastUpdate` inside config.xml.
   *
   * GPC stamps this with the moment it last refreshed exchange rates, which is
   * neither a PDB fact nor derivable from the order — in reference files it
   * predates the order's own CreationDate by seconds. Optional and unset by
   * default, so a caller that does not refresh rates passes config.xml through
   * unchanged.
   */
  currenciesLastUpdate?: string
}

/** `_rels/.rels` — BOM, single line, three relationships in this exact order. */
export function buildRels(pins: GpcFilePins): Uint8Array {
  const xml =
    `${BOM}<?xml version="1.0" encoding="utf-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Type="xml/gomversion" Target="/version.xml" Id="${pins.versionRelId}" />` +
    `<Relationship Type="xml/gomconfig" Target="/config.xml" Id="${pins.configRelId}" />` +
    `<Relationship Type="xml/gomorder" Target="/order.xml" Id="${pins.orderRelId}" />` +
    `</Relationships>`
  return new TextEncoder().encode(xml)
}

/**
 * `[Content_Types].xml` — BOM, single line. `text/xml`, not `application/xml`:
 * GPC rejects the latter (spec §2).
 */
export function buildContentTypes(): Uint8Array {
  const xml =
    `${BOM}<?xml version="1.0" encoding="utf-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="text/xml" />` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />` +
    `</Types>`
  return new TextEncoder().encode(xml)
}

/** Replaces `CurrenciesData/LastUpdate` in config.xml, preserving every other byte. */
function stampCurrenciesLastUpdate(config: Uint8Array, ticks: string): Uint8Array {
  const text = new TextDecoder('utf-8').decode(config)
  const pattern = /(<CurrenciesData>\s*<LastUpdate>)(\d+)(<\/LastUpdate>)/
  if (!pattern.test(text)) throw new Error('writeGpcFile: config.xml has no CurrenciesData/LastUpdate')
  return new TextEncoder().encode(text.replace(pattern, `$1${ticks}$3`))
}

function part(pdb: GpcContainer, name: string): Uint8Array {
  const entry = pdb.entries.find((e) => e.name === name)
  if (!entry) throw new Error(`writeGpcFile: PDB has no ${name}`)
  return entry.data
}

/** Builds the OPC ZIP for a saved order. Encryption is the caller's step. */
export async function writeGpcFile(
  order: OrderDocument,
  pdb: GpcContainer,
  pins: GpcFilePins
): Promise<Uint8Array> {
  const config = pins.currenciesLastUpdate
    ? stampCurrenciesLastUpdate(part(pdb, 'config.xml'), pins.currenciesLastUpdate)
    : part(pdb, 'config.xml')

  // Entry order is significant (spec §2) and `_rels/.rels` is the only STORED part.
  const entries: GpcEntry[] = [
    { name: 'version.xml', data: part(pdb, 'version.xml'), method: METHOD_DEFLATE },
    { name: '_rels/.rels', data: buildRels(pins), method: METHOD_STORED },
    { name: 'config.xml', data: config, method: METHOD_DEFLATE },
    { name: 'order.xml', data: serializeOrderXml(order), method: METHOD_DEFLATE },
    { name: '[Content_Types].xml', data: buildContentTypes(), method: METHOD_DEFLATE },
  ]

  return writeContainer({ entries, dosTime: pins.dosTime, dosDate: pins.dosDate })
}
