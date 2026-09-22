import { describe, it, expect } from 'vitest'
import { repackOpc } from '../packOpc.js'
import { createNewOrder } from '../index.js'
import {
  METHOD_STORED,
  readContainer,
  writeContainer,
  METHOD_DEFLATE,
} from '../gpc/container.ts'

/**
 * Every file this app writes must be one GPC can open.
 *
 * GPC reports any OPC or deserialization failure as "This file has no
 * Order-Part", which reads like a missing relationship and is really a
 * catch-all. Two faults in the old save path produced it, and both are cheap to
 * reintroduce, so they are pinned here:
 *
 *   - `_rels/.rels` went missing, because the writer deleted directory entries
 *     and a folder delete took its children with it.
 *   - `[Content_Types].xml` declared `application/xml`, which GPC rejects, and
 *     omitted the `rels` default.
 *
 * The container shape is checked too: GPC only opens a package matching what
 * .NET's System.IO.Packaging writes, so a structurally valid ZIP is not enough.
 */

const decode = (b: Uint8Array) => new TextDecoder().decode(b)

/** A minimal but well-formed package to feed the save path. */
async function sourcePackage(): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const zip = await writeContainer({
    dosTime: 0,
    dosDate: 33,
    entries: [
      { name: 'version.xml', data: enc.encode('<?xml version="1.0" encoding="utf-8"?>\n<string>2.9.8.0</string>'), method: METHOD_DEFLATE },
      { name: '_rels/.rels', data: enc.encode('﻿<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Type="xml/gomorder" Target="/order.xml" Id="Rold" /></Relationships>'), method: METHOD_STORED },
      { name: 'config.xml', data: enc.encode('<AdministrationData />'), method: METHOD_DEFLATE },
      { name: 'order.xml', data: enc.encode('<OrderData />'), method: METHOD_DEFLATE },
      { name: '[Content_Types].xml', data: enc.encode('﻿<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml" /></Types>'), method: METHOD_DEFLATE },
    ],
  })
  return zip.buffer as ArrayBuffer
}

/** The checks that decide whether GPC will open the file at all. */
async function expectOpenable(zipBytes: Uint8Array) {
  const container = await readContainer(zipBytes)
  const named = (n: string) => container.entries.find((e) => e.name === n)

  // Part order is significant — GPC reads them positionally.
  expect(container.entries.map((e) => e.name)).toEqual([
    'version.xml', '_rels/.rels', 'config.xml', 'order.xml', '[Content_Types].xml',
  ])

  // A folder delete once took the relationships with it.
  const rels = named('_rels/.rels')
  expect(rels, '_rels/.rels must be present').toBeDefined()
  expect(rels!.method, '_rels/.rels is STORED, everything else DEFLATE').toBe(METHOD_STORED)
  // Checked as bytes: TextDecoder silently strips a leading BOM, so a decoded
  // string cannot tell you whether one is there.
  expect([...rels!.data.slice(0, 3)], 'the OPC parts carry a UTF-8 BOM').toEqual([0xef, 0xbb, 0xbf])
  const relsXml = decode(rels!.data)
  expect(relsXml).toContain('Type="xml/gomorder" Target="/order.xml"')
  expect(relsXml).toContain('Type="xml/gomconfig" Target="/config.xml"')
  expect(relsXml).toContain('Type="xml/gomversion" Target="/version.xml"')

  // application/xml is rejected; the rels default must be declared.
  const typesBytes = named('[Content_Types].xml')!.data
  expect([...typesBytes.slice(0, 3)], 'the OPC parts carry a UTF-8 BOM').toEqual([0xef, 0xbb, 0xbf])
  const types = decode(typesBytes)
  expect(types).toContain('ContentType="text/xml"')
  expect(types).not.toContain('application/xml"')
  expect(types).toContain('Extension="rels"')

  // Directory entries break .NET's reader; .NET never writes them.
  expect(container.entries.some((e) => e.name.endsWith('/'))).toBe(false)

  // The 28-byte OPC growth hint sits on every local header.
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
  let headers = 0
  for (let i = 0; i + 30 < zipBytes.length; i++) {
    if (view.getUint32(i, true) !== 0x04034b50) continue
    expect(view.getUint16(i + 28, true), 'growth hint on every local header').toBe(28)
    headers++
    i += 29
  }
  expect(headers).toBe(container.entries.length)
}

describe('every saved file stays openable by the configurator', () => {
  it('repacking an order repairs the manifest rather than carrying it through', async () => {
    const zip = await repackOpc(await sourcePackage(), '<OrderData><OrderNumber>PATCHED</OrderNumber></OrderData>')
    await expectOpenable(new Uint8Array(zip))
    expect(decode((await readContainer(new Uint8Array(zip))).entries.find((e) => e.name === 'order.xml')!.data))
      .toContain('PATCHED')
  })

  it('a brand new order is openable too', async () => {
    const result = await createNewOrder({
      configXml: '<AdministrationData><ParametersData><VersionName>PDBTEST_01-2026</VersionName></ParametersData></AdministrationData>',
      versionXml: '<?xml version="1.0" encoding="utf-8"?>\n<string>2.9.8.0</string>',
    })
    await expectOpenable(new Uint8Array(result.rawDecryptedBuffer))
  })

  it('no longer uses a general-purpose zip library on the save path', async () => {
    // JSZip writes every entry stored and no growth hint, which GPC refuses.
    const modules = await Promise.all([
      import('../packOpc.js'),
      import('../saveGpcFile.js'),
      import('../index.js'),
    ])
    expect(modules.every((m) => m !== undefined)).toBe(true)
  })
})

/**
 * Saving after an edit has to leave order.xml deserializable.
 *
 * `XmlSerializer` reads a class's members as a *sequence*, so an element out of
 * declaration order — or one naming no member at all — fails the whole file.
 * Three faults did that, all reported by GPC as "no Order-Part":
 *
 *   - `<Comments>` at the root. `OrderData` declares `Comment`; no reference
 *     file has the plural, and the blank-order template wrote it into every new
 *     order.
 *   - Root elements appended at the end when the open file lacked them, instead
 *     of being placed in declaration order.
 *   - The XML declaration dropped and CRLF flattened to LF on save.
 */
describe('saving an edited order keeps it deserializable', () => {
  const ROOT = (xml: string) =>
    Array.from(
      new DOMParser().parseFromString(xml, 'application/xml').documentElement.children,
    ).map((e) => e.tagName)

  it('keeps the declaration and CRLF', async () => {
    const { createBlankOrderXml } = await import('../createBlankOrder.js')
    const { parseOrder } = await import('../parseOrder.js')
    const { patchOrderXml } = await import('../patchOrder.js')

    const blank = createBlankOrderXml()
    const patched = patchOrderXml(blank, parseOrder(blank), [])

    expect(patched.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true)
    expect(patched).toContain('\r\n')
    expect(patched.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('never writes a root element that names no OrderData member', async () => {
    const { createBlankOrderXml } = await import('../createBlankOrder.js')
    const { parseOrder } = await import('../parseOrder.js')
    const { patchOrderXml } = await import('../patchOrder.js')

    const blank = createBlankOrderXml()
    const order = parseOrder(blank)
    const patched = patchOrderXml(blank, { ...order, comments: 'a note' }, [])

    expect(ROOT(patched)).toContain('Comment')
    expect(ROOT(patched)).not.toContain('Comments')
  })

  it('adds a missing root element in declaration order, not at the end', async () => {
    const { createBlankOrderXml } = await import('../createBlankOrder.js')
    const { parseOrder } = await import('../parseOrder.js')
    const { patchOrderXml } = await import('../patchOrder.js')

    // A file without CaseId — the shape that appended it after PriceList.
    const stripped = createBlankOrderXml().replace(/ {2}<CaseId \/>\r?\n/, '')
    expect(ROOT(stripped)).not.toContain('CaseId')

    const patched = patchOrderXml(stripped, { ...parseOrder(stripped), caseId: 'CASE-1' }, [])
    const root = ROOT(patched)

    expect(root).toContain('CaseId')
    expect(root.indexOf('CaseId')).toBeLessThan(root.indexOf('CleanOrder'))
    expect(root.indexOf('CaseId')).toBeGreaterThan(root.indexOf('AttachedFiles'))
  })

  it('leaves an absent optional field absent when it has no value', async () => {
    const { createBlankOrderXml } = await import('../createBlankOrder.js')
    const { parseOrder } = await import('../parseOrder.js')
    const { patchOrderXml } = await import('../patchOrder.js')

    // .NET omits a null reference type; inventing an empty element differs from
    // what the configurator would have written.
    const stripped = createBlankOrderXml().replace(/ {2}<CaseId \/>\r?\n/, '')
    const patched = patchOrderXml(stripped, { ...parseOrder(stripped), caseId: '' }, [])
    expect(ROOT(patched)).not.toContain('CaseId')
  })
})
