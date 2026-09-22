/**
 * Re-packages the OPC/ZIP container with a patched order.xml.
 *
 * This goes through src/lib/gpc/container.ts rather than a general-purpose zip
 * library. GPC opens a file only if its container matches what .NET's
 * System.IO.Packaging writes — the 28-byte growth-hint extra field on every
 * local header, `_rels/.rels` STORED while everything else is DEFLATE, specific
 * version and flag bytes. A structurally valid ZIP without those is rejected
 * with "This file has no Order-Part", which is GPC's catch-all for any OPC or
 * deserialization failure and reads misleadingly like a missing relationship.
 *
 * The two OPC parts are rewritten rather than copied through, so a file that
 * arrives with a broken manifest is repaired on save instead of staying broken.
 */
import {
  METHOD_DEFLATE,
  METHOD_STORED,
  readContainer,
  writeContainer,
} from './gpc/container.ts'
import type { GpcEntry } from './gpc/container.ts'

const BOM = '﻿'

/** Part order is significant: GPC reads them positionally. */
const PART_ORDER = ['version.xml', '_rels/.rels', 'config.xml', 'order.xml', '[Content_Types].xml']

/** `"R" + Guid.NewGuid().ToString("N").Substring(0,16)`, fresh per save. */
function relationshipId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return 'R' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** All three relationships, in the order GPC expects, `xml/gomorder` included. */
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

/** `text/xml`, not `application/xml` — GPC rejects the latter. */
function contentTypesXml(): Uint8Array {
  return new TextEncoder().encode(
    `${BOM}<?xml version="1.0" encoding="utf-8"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="xml" ContentType="text/xml" />` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />` +
    `</Types>`
  )
}

function dosStamp(d: Date): { dosTime: number; dosDate: number } {
  return {
    dosTime: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dosDate: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/**
 * Loads the original decrypted ZIP, replaces order.xml, and returns a new ZIP
 * buffer ready for encryption.
 */
export async function repackOpc(
  decryptedBuffer: ArrayBuffer,
  patchedOrderXml: string
): Promise<ArrayBuffer> {
  let container
  try {
    container = await readContainer(new Uint8Array(decryptedBuffer))
  } catch (err) {
    throw new Error(
      `repackOpc: failed to load ZIP — ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // Match part names loosely on the way in — OPC permits a leading slash and
  // other writers vary the case — then write them back under their canonical
  // spellings, which is what GPC produces and expects.
  const canonical = (name: string) => name.replace(/^\/+/, '').toLowerCase()
  const existing = new Map(container.entries.map((e) => [canonical(e.name), e]))
  if (!existing.has('order.xml')) throw new Error('repackOpc: order.xml not found in ZIP')

  const replacements: Record<string, Uint8Array> = {
    'order.xml': new TextEncoder().encode(patchedOrderXml),
    '_rels/.rels': relsXml(),
    '[Content_Types].xml': contentTypesXml(),
  }

  const entries: GpcEntry[] = []
  for (const name of PART_ORDER) {
    const data = replacements[name] ?? existing.get(canonical(name))?.data
    if (!data) continue
    entries.push({
      name,
      data,
      method: name === '_rels/.rels' ? METHOD_STORED : METHOD_DEFLATE,
    })
  }

  // Anything unexpected the source carried is kept, after the known parts, so a
  // save never silently drops content this code does not recognise.
  const known = new Set(PART_ORDER.map(canonical))
  for (const entry of container.entries) {
    if (!known.has(canonical(entry.name))) entries.push(entry)
  }

  const zip = await writeContainer({ entries, ...dosStamp(new Date()) })
  return zip.buffer as ArrayBuffer
}
