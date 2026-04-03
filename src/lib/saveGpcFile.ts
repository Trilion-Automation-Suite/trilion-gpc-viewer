/**
 * End-to-end save pipeline: patches order XML → repacks ZIP → encrypts →
 * triggers a browser file download.
 *
 * The caller supplies the original decrypted buffer and raw order.xml so
 * that all other files in the archive (config.xml, version.xml, OPC manifests)
 * are preserved unchanged.
 */

import type { OrderSummary } from '../types/order.js'
import { patchOrderXml } from './patchOrder.js'
import { repackOpc } from './packOpc.js'
import { encryptGpcFile } from './encryptGpcFile.js'

export async function saveGpcFile(
  rawDecryptedBuffer: ArrayBuffer,
  rawOrderXml: string,
  order: OrderSummary,
  sourceFilename: string
): Promise<void> {
  // 1. Patch order.xml DOM with edited values
  const patchedXml = patchOrderXml(rawOrderXml, order)

  // 2. Rebuild the ZIP with the patched order.xml (all other entries preserved)
  const newZipBuffer = await repackOpc(rawDecryptedBuffer, patchedXml)

  // 3. Re-encrypt with AES-128-CBC
  const encryptedBuffer = await encryptGpcFile(newZipBuffer)

  // 4. Trigger browser download
  const blob = new Blob([encryptedBuffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = sourceFilename.endsWith('.gconfiguration')
    ? sourceFilename
    : `${sourceFilename}.gconfiguration`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
