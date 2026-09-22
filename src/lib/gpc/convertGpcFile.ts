/**
 * Whole-file catalog conversion, for the browser.
 *
 * Open any `.gconfiguration`, hand it a newer product database, and get back a
 * file targeting that catalog: refreshed article data, refreshed configuration
 * items, current currency, recomputed totals — plus a report of everything that
 * changed and everything that needs a human.
 *
 * The order's structure is never rebuilt, only substituted into, so line-item
 * shapes the add-item path cannot yet construct survive conversion intact.
 */
import { decryptGpcFile } from '../decrypt.js'
import { encryptGpcFile } from '../encryptGpcFile.js'
import { METHOD_DEFLATE, METHOD_STORED, readContainer, writeContainer } from './container.ts'
import type { GpcContainer } from './container.ts'
import { parseOrderXml, serializeOrderXml } from './orderXml.ts'
import { convertOrderToCatalog } from './convertCatalog.ts'
import type { ConversionReport } from './convertCatalog.ts'

const BOM = '﻿'

export interface ConvertedFile {
  /** Encrypted `.gconfiguration` bytes, ready to download. */
  bytes: ArrayBuffer
  report: ConversionReport
  /** The catalog the order came from, as it recorded itself. */
  sourceCatalog: string | null
  suggestedFilename: string
}

/** `"R" + Guid.NewGuid().ToString("N").Substring(0,16)` — fresh on every save. */
function relationshipId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return 'R' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** .NET round-trip-ish local timestamp: 7 fractional digits, ±HH:MM offset. */
function dotNetTimestamp(d: Date): string {
  const offset = -d.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}0000` +
    `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`
  )
}

function dosStamp(d: Date): { dosTime: number; dosDate: number } {
  return {
    dosTime: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dosDate: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

function part(container: GpcContainer, name: string): Uint8Array {
  const entry = container.entries.find((e) => e.name === name)
  if (!entry) throw new Error(`convertGpcFile: file has no ${name}`)
  return entry.data
}

function relsXml(): Uint8Array {
  return new TextEncoder().encode(
    `${BOM}<?xml version="1.0" encoding="utf-8"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Type="xml/gomversion" Target="/version.xml" Id="${relationshipId()}" />` +
    `<Relationship Type="xml/gomconfig" Target="/config.xml" Id="${relationshipId()}" />` +
    `<Relationship Type="xml/gomorder" Target="/order.xml" Id="${relationshipId()}" />` +
    `</Relationships>`
  )
}

function contentTypesXml(): Uint8Array {
  return new TextEncoder().encode(
    `${BOM}<?xml version="1.0" encoding="utf-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="text/xml" />` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />` +
    `</Types>`
  )
}

function textMember(root: { members: Array<{ name: string; value: unknown }> }, name: string): string | null {
  const m = root.members.find((x) => x.name === name)
  const v = m?.value as { kind?: string; value?: string } | undefined
  return v && v.kind === 'text' ? (v.value ?? null) : null
}

/**
 * Converts an opened `.gconfiguration` onto the catalog in `targetPdbBytes`.
 *
 * Both inputs are the raw encrypted file bytes, as read from disk.
 */
export async function convertGpcFile(
  sourceBytes: ArrayBuffer,
  targetPdbBytes: ArrayBuffer,
  sourceFilename = 'order.gconfiguration'
): Promise<ConvertedFile> {
  return convertOpenedGpc(await decryptGpcFile(sourceBytes), targetPdbBytes, sourceFilename)
}

/**
 * Same conversion, for a file the app has already decrypted — which is what it
 * keeps in memory once a configuration is open, so this avoids decrypting twice.
 */
export async function convertOpenedGpc(
  decryptedZip: ArrayBuffer,
  targetPdbBytes: ArrayBuffer,
  sourceFilename = 'order.gconfiguration'
): Promise<ConvertedFile> {
  const source = await readContainer(new Uint8Array(decryptedZip))
  const target = await readContainer(new Uint8Array(await decryptGpcFile(targetPdbBytes)))

  const order = parseOrderXml(part(source, 'order.xml'))
  const sourceCatalog = textMember(order.root, 'SourceFileName')

  const report = convertOrderToCatalog(order, target)

  // A conversion is a save: the timestamp moves, the relationship Ids are new.
  const now = new Date()
  const stamp = dotNetTimestamp(now)
  const lastModified = order.root.members.find((m) => m.name === 'LastModified')
  if (lastModified && lastModified.value.kind === 'text') lastModified.value.value = stamp

  // version.xml and config.xml come from the target: the order now *is* that catalog's.
  const zip = await writeContainer({
    ...dosStamp(now),
    entries: [
      { name: 'version.xml', data: part(target, 'version.xml'), method: METHOD_DEFLATE },
      { name: '_rels/.rels', data: relsXml(), method: METHOD_STORED },
      { name: 'config.xml', data: part(target, 'config.xml'), method: METHOD_DEFLATE },
      { name: 'order.xml', data: serializeOrderXml(order), method: METHOD_DEFLATE },
      { name: '[Content_Types].xml', data: contentTypesXml(), method: METHOD_DEFLATE },
    ],
  })

  const base = sourceFilename.replace(/\.gconfiguration$/i, '')
  const suffix = report.targetCatalog ? `-${report.targetCatalog}` : '-converted'

  return {
    bytes: await encryptGpcFile(zip.buffer as ArrayBuffer),
    report,
    sourceCatalog,
    suggestedFilename: `${base}${suffix}.gconfiguration`,
  }
}

/** True when the conversion left something a person should look at. */
export function needsReview(report: ConversionReport): boolean {
  return (
    report.issues.length > 0 ||
    report.dependentListsNotConverted.length > 0 ||
    report.configurationItems.unmatched.length > 0 ||
    report.totalsLeft.length > 0
  )
}
