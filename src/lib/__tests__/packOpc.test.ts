import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { repackOpc } from '../packOpc.js'
import { unpackOpc } from '../unpack.js'

// ---------------------------------------------------------------------------
// Helper: build an in-memory ZIP with given entries
// ---------------------------------------------------------------------------

async function buildZip(entries: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content)
  }
  return zip.generateAsync({ type: 'arraybuffer' })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('repackOpc', () => {
  it('replaces order.xml with patched content', async () => {
    const original = await buildZip({
      'order.xml': '<OrderData><OrderNumber>OLD</OrderNumber></OrderData>',
      'config.xml': '<config/>',
      'version.xml': '<version>1.0</version>',
    })

    const repacked = await repackOpc(original, '<OrderData><OrderNumber>NEW</OrderNumber></OrderData>')
    const { orderXml } = await unpackOpc(repacked)

    expect(orderXml).toContain('NEW')
    expect(orderXml).not.toContain('OLD')
  })

  it('preserves config.xml and version.xml unchanged', async () => {
    const original = await buildZip({
      'order.xml': '<OrderData/>',
      'config.xml': '<AdministrationData><Articles/></AdministrationData>',
      'version.xml': '<VersionInfo><Version>2.9.8.0</Version></VersionInfo>',
    })

    const repacked = await repackOpc(original, '<OrderData/>')
    const { configXml, versionXml } = await unpackOpc(repacked)

    expect(configXml).toContain('AdministrationData')
    expect(versionXml).toContain('2.9.8.0')
  })

  it('works with leading-slash entry names (OPC convention)', async () => {
    const original = await buildZip({
      '/order.xml': '<OrderData><OrderNumber>SLASH</OrderNumber></OrderData>',
    })

    const repacked = await repackOpc(original, '<OrderData><OrderNumber>PATCHED</OrderNumber></OrderData>')
    const { orderXml } = await unpackOpc(repacked)

    expect(orderXml).toContain('PATCHED')
    expect(orderXml).not.toContain('SLASH')
  })

  it('works with mixed-case entry name (case-insensitive match)', async () => {
    const original = await buildZip({
      'Order.XML': '<OrderData><OrderNumber>UPPER</OrderNumber></OrderData>',
    })

    const repacked = await repackOpc(original, '<OrderData><OrderNumber>LOWER</OrderNumber></OrderData>')
    const { orderXml } = await unpackOpc(repacked)

    expect(orderXml).toContain('LOWER')
  })

  it('preserves extra files not known to the viewer', async () => {
    const original = await buildZip({
      'order.xml': '<OrderData/>',
      '[Content_Types].xml': '<?xml version="1.0"?><Types/>',
      '_rels/.rels': '<Relationships/>',
    })

    const repacked = await repackOpc(original, '<OrderData/>')
    const zip = await JSZip.loadAsync(repacked)

    const names = Object.keys(zip.files).map((n) => n.replace(/^\/+/, '').toLowerCase())
    expect(names).toContain('[content_types].xml')
    expect(names).toContain('_rels/.rels')
  })

  it('throws when order.xml is not present in the ZIP', async () => {
    const original = await buildZip({
      'config.xml': '<config/>',
    })

    await expect(repackOpc(original, '<OrderData/>')).rejects.toThrow(
      'repackOpc: order.xml not found in ZIP'
    )
  })

  it('throws on invalid ZIP bytes', async () => {
    const bad = new TextEncoder().encode('not a zip').buffer as ArrayBuffer
    await expect(repackOpc(bad, '<OrderData/>')).rejects.toThrow('repackOpc: failed to load ZIP')
  })

  it('result is a valid ZIP (can be loaded by JSZip)', async () => {
    const original = await buildZip({ 'order.xml': '<OrderData/>' })
    const repacked = await repackOpc(original, '<OrderData><NewField/></OrderData>')

    // Should not throw
    const zip = await JSZip.loadAsync(repacked)
    expect(zip.files['order.xml']).toBeDefined()
  })
})
