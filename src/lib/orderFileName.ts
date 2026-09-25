/**
 * Naming the file an order saves to.
 *
 * A new order is called "New Order.gconfiguration" because at that moment
 * nothing is known about it. Once a block has been pasted, the order number and
 * the customer are both known, and that is what the file should be called —
 * a folder of "New Order (4).gconfiguration" is nobody's idea of a filing
 * system.
 */

/** What `createNewOrder` calls an order before anything is known about it. */
export const UNTITLED_ORDER = 'New Order.gconfiguration'

const EXTENSION = '.gconfiguration'

/**
 * Strips what a file system will not take, on any of the three.
 *
 * Windows is the strict one: `\ / : * ? " < > |` are forbidden outright, and a
 * trailing dot or space is silently dropped, which turns a careful name into a
 * confusing one.
 */
function sanitize(part: string): string {
  return part
    .replace(/[\\/:*?"<>|]/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '')
}

/**
 * `Q2608-181JG_Zimmer Biomet.gconfiguration`, from whichever parts are known.
 *
 * Returns null when neither part is, so the caller can leave the existing name
 * alone rather than write something meaningless over it.
 */
export function orderFileName(orderNumber: string, companyName: string): string | null {
  const parts = [sanitize(orderNumber), sanitize(companyName)].filter(Boolean)
  if (parts.length === 0) return null
  // 120 leaves room for the extension and for a browser's " (1)" on a
  // duplicate, inside the 255 bytes every common file system allows.
  return `${parts.join('_').slice(0, 120)}${EXTENSION}`
}

/**
 * True when the order has not been named by anything yet.
 *
 * Only an untitled order is renamed. A file opened from disk keeps the name it
 * came with: the operator chose it, and a save should not move their file.
 */
export function isUntitled(sourceFile: string): boolean {
  return sourceFile === UNTITLED_ORDER || sourceFile === '' || /^New Order( \(\d+\))?\.gconfiguration$/.test(sourceFile)
}
