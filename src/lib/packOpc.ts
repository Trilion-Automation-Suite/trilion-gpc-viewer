/**
 * Re-packages the OPC/ZIP container with a patched order.xml.
 * All other files in the archive (config.xml, version.xml, [Content_Types].xml, etc.)
 * are preserved unchanged from the original decrypted buffer.
 */

import JSZip from 'jszip'

/**
 * Loads the original decrypted ZIP, replaces the order.xml entry with
 * patchedOrderXml, and returns a new ZIP buffer ready for encryption.
 */
export async function repackOpc(
  decryptedBuffer: ArrayBuffer,
  patchedOrderXml: string
): Promise<ArrayBuffer> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(decryptedBuffer)
  } catch (err) {
    throw new Error(
      `repackOpc: failed to load ZIP — ${err instanceof Error ? err.message : String(err)}`
    )
  }

  // Find order.xml by normalised name (case-insensitive, strip leading slash)
  let found = false
  for (const name of Object.keys(zip.files)) {
    if (name.replace(/^\/+/, '').toLowerCase() === 'order.xml') {
      zip.file(name, patchedOrderXml)
      found = true
      break
    }
  }

  if (!found) {
    throw new Error('repackOpc: order.xml not found in ZIP')
  }

  // Remove empty directory entries that JSZip may have created — .NET's OPC
  // Package reader doesn't expect them.  Only remove dirs that have no file
  // children (zip.remove on a folder nukes its contents too).
  const allNames = Object.keys(zip.files)
  const dirs = allNames.filter(n => zip.files[n].dir)
  for (const d of dirs) {
    const hasChildren = allNames.some(n => n !== d && n.startsWith(d) && !zip.files[n].dir)
    if (!hasChildren) zip.remove(d)
  }

  return zip.generateAsync({ type: 'arraybuffer' })
}
