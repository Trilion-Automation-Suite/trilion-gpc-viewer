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

async function buildEncryptedBuffer(
  rawDecryptedBuffer: ArrayBuffer,
  rawOrderXml: string,
  order: OrderSummary,
  originalItemNos: string[]
): Promise<ArrayBuffer> {
  const patchedXml = patchOrderXml(rawOrderXml, order, originalItemNos)
  const newZipBuffer = await repackOpc(rawDecryptedBuffer, patchedXml)
  return encryptGpcFile(newZipBuffer)
}

function downloadBlob(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.gconfiguration')
    ? filename
    : `${filename}.gconfiguration`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function saveGpcFile(
  rawDecryptedBuffer: ArrayBuffer,
  rawOrderXml: string,
  order: OrderSummary,
  sourceFilename: string,
  fileHandle?: FileSystemFileHandle,
  originalItemNos: string[] = []
): Promise<void> {
  const encryptedBuffer = await buildEncryptedBuffer(rawDecryptedBuffer, rawOrderXml, order, originalItemNos)

  // Prefer in-place overwrite via File System Access API if a handle was supplied
  if (fileHandle) {
    try {
      type PermMode = { mode: 'readwrite' }
      type WithPerm = { queryPermission(d: PermMode): Promise<string>; requestPermission(d: PermMode): Promise<string> }
      const fh = fileHandle as FileSystemFileHandle & WithPerm
      let perm = await fh.queryPermission({ mode: 'readwrite' })
      if (perm !== 'granted') {
        perm = await fh.requestPermission({ mode: 'readwrite' })
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

  // Fall back: trigger browser download
  downloadBlob(encryptedBuffer, sourceFilename)
}

/**
 * Save As — shows a native file picker (if supported) or falls back to download.
 */
export async function saveGpcFileAs(
  rawDecryptedBuffer: ArrayBuffer,
  rawOrderXml: string,
  order: OrderSummary,
  suggestedName: string,
  originalItemNos: string[] = []
): Promise<FileSystemFileHandle | undefined> {
  const encryptedBuffer = await buildEncryptedBuffer(rawDecryptedBuffer, rawOrderXml, order, originalItemNos)
  const filename = suggestedName.endsWith('.gconfiguration')
    ? suggestedName
    : `${suggestedName}.gconfiguration`

  // Try native Save As picker (Chrome/Edge)
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as unknown as { showSaveFilePicker(opts: unknown): Promise<FileSystemFileHandle> })
        .showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'GPC Configuration',
            accept: { 'application/octet-stream': ['.gconfiguration'] },
          }],
        })
      const writable = await handle.createWritable()
      await writable.write(encryptedBuffer)
      await writable.close()
      return handle
    } catch (err) {
      // User cancelled the picker
      if (err instanceof DOMException && err.name === 'AbortError') return undefined
      // API failed — fall through to download
    }
  }

  // Fallback: browser download
  downloadBlob(encryptedBuffer, filename)
  return undefined
}
