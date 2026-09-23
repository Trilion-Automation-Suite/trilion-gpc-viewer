/**
 * Opening the viewer on an order that another system already holds.
 *
 * A sales order in the ERP knows everything the configuration needs. The
 * paste block closed most of that gap; a link closes the rest, so the button
 * over there opens the viewer over here with the order already in hand and
 * nothing to copy.
 *
 * The block travels in the URL **fragment**. A fragment is never sent to the
 * server — not to this app's host, not to any proxy or log in between — which
 * matters because the block carries a customer's name, address and contact.
 * A query string would put all of that in an access log.
 */
import { decodeOrderBlock } from './gpc/orderBlock.ts'
import type { OrderBlock } from './gpc/orderBlock.ts'

/** The fragment key. `#order=<base64url>`. */
const PARAM = 'order'

/** base64url — `-_` and no padding — so nothing needs escaping in a URL. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  return padded + '='.repeat((4 - (padded.length % 4)) % 4)
}

/**
 * A link that opens the viewer on this block.
 *
 * `base` is where the app is served from. The generator in the sending system
 * builds this; it lives here so both ends read the same code when something
 * does not line up.
 */
export function buildOrderLink(base: string, block: OrderBlock): string {
  const json = JSON.stringify(block)
  const encoded = toBase64Url(new TextEncoder().encode(json))
  return `${base.replace(/[#?].*$/, '').replace(/\/$/, '')}/#${PARAM}=${encoded}`
}

/**
 * The block a link carried, or null.
 *
 * Returns the *text*, not a parsed block, so the caller hands it to the same
 * preview a paste goes through. A link must not apply anything by itself: it
 * is a URL, it can arrive from anywhere, and it changes a customer's order.
 */
export function readOrderLink(href: string): string | null {
  const hash = href.includes('#') ? href.slice(href.indexOf('#') + 1) : ''
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const value = params.get(PARAM)
  if (!value) return null
  try {
    // Handed on as JSON text: decodeOrderBlock accepts that, and a failure
    // then names the real problem rather than "not valid base64".
    const binary = atob(fromBase64Url(value))
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
    return new TextDecoder().decode(bytes)
  } catch {
    return null
  }
}

/** The catalog a link names, so the viewer can open the right one first. */
export function catalogOfLink(text: string): string | null {
  try {
    return decodeOrderBlock(text).catalog ?? null
  } catch {
    return null
  }
}

/**
 * Drops the block from the address bar once it has been read.
 *
 * Without this a refresh re-offers an order the operator may have already
 * applied, and the customer's details sit in the address bar and in the
 * browser history for as long as the tab is open.
 */
export function clearOrderLink(): void {
  if (typeof history === 'undefined' || typeof location === 'undefined') return
  history.replaceState(null, '', location.pathname + location.search)
}
