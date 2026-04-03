import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { unpackOpc } from '../unpack.js'

// ---------------------------------------------------------------------------
// Helpers to build in-memory ZIPs
// ---------------------------------------------------------------------------

async function buildZip(
  entries: Record<string, string>
): Promise<ArrayBuffer> {
  const zip = new JSZip()
  for (const [name, content] of Object.entries(entries)) {
    zip.file(name, content)
  }
  const blob = await zip.generateAsync({ type: 'arraybuffer' })
  return blob
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unpackOpc', () => {
  it('finds order.xml, config.xml, and version.xml by exact name', async () => {
    const buf = await buildZip({
      'order.xml': '<order/>',
      'config.xml': '<config/>',
      'version.xml': '<version>1.0</version>',
    })
    const result = await unpackOpc(buf)
    expect(result.orderXml).toBe('<order/>')
    expect(result.configXml).toBe('<config/>')
    expect(result.versionXml).toBe('<version>1.0</version>')
  })

  it('finds files with leading slash in zip entry name', async () => {
    const buf = await buildZip({
      '/order.xml': '<order id="slash"/>',
      '/config.xml': '<config/>',
      '/version.xml': '<version>2.0</version>',
    })
    const result = await unpackOpc(buf)
    expect(result.orderXml).toBe('<order id="slash"/>')
    expect(result.configXml).toBe('<config/>')
    expect(result.versionXml).toBe('<version>2.0</version>')
  })

  it('returns null for missing order.xml', async () => {
    const buf = await buildZip({
      'config.xml': '<config/>',
      'version.xml': '<version/>',
    })
    const result = await unpackOpc(buf)
    expect(result.orderXml).toBeNull()
  })

  it('returns null for missing config.xml', async () => {
    const buf = await buildZip({
      'order.xml': '<order/>',
      'version.xml': '<version/>',
    })
    const result = await unpackOpc(buf)
    expect(result.configXml).toBeNull()
  })

  it('returns null for missing version.xml', async () => {
    const buf = await buildZip({
      'order.xml': '<order/>',
      'config.xml': '<config/>',
    })
    const result = await unpackOpc(buf)
    expect(result.versionXml).toBeNull()
  })

  it('all three are null for an empty ZIP', async () => {
    const buf = await buildZip({})
    const result = await unpackOpc(buf)
    expect(result.orderXml).toBeNull()
    expect(result.configXml).toBeNull()
    expect(result.versionXml).toBeNull()
  })

  it('is case-insensitive when looking up files', async () => {
    const buf = await buildZip({
      'Order.XML': '<order case="upper"/>',
      'CONFIG.xml': '<config/>',
      'Version.Xml': '<version/>',
    })
    const result = await unpackOpc(buf)
    expect(result.orderXml).toBe('<order case="upper"/>')
    expect(result.configXml).toBe('<config/>')
    expect(result.versionXml).toBe('<version/>')
  })

  it('handles both leading slash and mixed case simultaneously', async () => {
    const buf = await buildZip({
      '/Order.XML': '<order mixed="true"/>',
    })
    const result = await unpackOpc(buf)
    expect(result.orderXml).toBe('<order mixed="true"/>')
  })

  it('throws on invalid ZIP bytes', async () => {
    const bad = new TextEncoder().encode('this is not a zip file').buffer as ArrayBuffer
    await expect(unpackOpc(bad)).rejects.toThrow('unpackOpc: failed to load ZIP')
  })

  it('reads actual XML content correctly', async () => {
    const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<OrderData>
  <OrderNumber>TEST-001</OrderNumber>
</OrderData>`
    const buf = await buildZip({ 'order.xml': xmlContent })
    const result = await unpackOpc(buf)
    expect(result.orderXml).toContain('TEST-001')
  })
})
