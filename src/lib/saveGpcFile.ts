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
  sourceFilename: string,
  fileHandle?: FileSystemFileHandle
): Promise<void> {
  // 1. Patch order.xml DOM with edited values
  const patchedXml = patchOrderXml(rawOrderXml, order)

  // 2. Rebuild the ZIP with the patched order.xml (all other entries preserved)
  const newZipBuffer = await repackOpc(rawDecryptedBuffer, patchedXml)

  // 3. Re-encrypt with AES-128-CBC
  const encryptedBuffer = await encryptGpcFile(newZipBuffer)

  // 4. Write back — prefer in-place overwrite via File System Access API if a handle was supplied
  if (fileHandle) {
    try {
      // Ensure we have readwrite permission (shows a browser prompt if needed)
      let perm = await fileHandle.queryPermission({ mode: 'readwrite' })
      if (perm !== 'granted') {
        perm = await fileHandle.requestPermission({ mode: 'readwrite' })
      }
      if (perm === 'granted') {
        const writable = await fileHandle.createWritable()
        await writable.write(encryptedBuffer)
        await writable.close()
        return
      }
    } catch {
      // API unsupported or permission denied — fall through to download
    }
  }

  // 5. Fall back: trigger browser download
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
