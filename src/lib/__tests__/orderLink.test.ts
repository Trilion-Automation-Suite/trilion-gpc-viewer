import { describe, expect, it } from 'vitest'
import { buildOrderLink, readOrderLink, catalogOfLink } from '../orderLink.ts'
import { decodeOrderBlock } from '../gpc/orderBlock.ts'
import type { OrderBlock } from '../gpc/orderBlock.ts'

const BLOCK: OrderBlock = {
  gpcOrder: 1,
  catalog: 'PDB290_09-2026',
  account: { companyName: 'Zeiss — Oberkochen & Co' },
  items: [{ type: 'sma', dongleId: '2-2952297', endOldContract: '2026-09', articles: ['EXT SMA for Sensor Driver ARAMIS'] }],
}

describe('opening the viewer on a link', () => {
  it('round-trips a block through a URL', () => {
    const link = buildOrderLink('https://gpc.example.invalid/', BLOCK)
    const text = readOrderLink(link)
    expect(text).not.toBeNull()
    expect(decodeOrderBlock(text!)).toEqual(BLOCK)
  })

  it('puts the block in the fragment, never the query', () => {
    const link = buildOrderLink('https://gpc.example.invalid', BLOCK)
    // A fragment is not sent to the server, which is the whole point: the
    // block carries a customer's name and address.
    expect(link.split('#')[0]).not.toContain('order=')
    expect(link).toContain('/#order=')
  })

  it('needs no escaping in a URL', () => {
    const link = buildOrderLink('https://gpc.example.invalid', BLOCK)
    const encoded = link.slice(link.indexOf('#order=') + 7)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(encoded)).toBe(encoded)
  })

  it('survives non-ASCII in a company name', () => {
    const text = readOrderLink(buildOrderLink('https://x.invalid', BLOCK))!
    expect(decodeOrderBlock(text).account?.companyName).toBe('Zeiss — Oberkochen & Co')
  })

  it('tolerates a trailing slash, a query or an existing fragment on the base', () => {
    for (const base of ['https://x.invalid', 'https://x.invalid/', 'https://x.invalid/?a=1', 'https://x.invalid/#stale']) {
      expect(decodeOrderBlock(readOrderLink(buildOrderLink(base, BLOCK))!)).toEqual(BLOCK)
    }
  })

  it('names the catalog so the viewer can open the right one first', () => {
    expect(catalogOfLink(readOrderLink(buildOrderLink('https://x.invalid', BLOCK))!)).toBe('PDB290_09-2026')
  })

  it('ignores a URL that carries no order', () => {
    expect(readOrderLink('https://x.invalid/')).toBeNull()
    expect(readOrderLink('https://x.invalid/#tab=items')).toBeNull()
    expect(readOrderLink('https://x.invalid/#order=not!base64!')).toBeNull()
  })
})
