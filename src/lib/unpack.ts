import JSZip from 'jszip'

export interface OpcContents {
  orderXml: string | null
  configXml: string | null
  versionXml: string | null
}

/**
 * Normalize OPC part names: strip leading slashes, lowercase for comparison.
 */
function normalizeName(name: string): string {
  return name.replace(/^\/+/, '').toLowerCase()
}

/**
 * Find a file in the zip by normalized name (case-insensitive, leading slash stripped).
 */
async function findFile(zip: JSZip, target: string): Promise<string | null> {
  const targetNorm = target.toLowerCase()
  for (const [name, file] of Object.entries(zip.files)) {
    if (normalizeName(name) === targetNorm && !file.dir) {
      return file.async('string')
    }
  }
  return null
}

/**
 * Unpacks an OPC (ZIP-based) package and returns the three XML part contents.
 * Part names in the ZIP may have leading slashes — these are normalized when looking them up.
 */
export async function unpackOpc(buffer: ArrayBuffer): Promise<OpcContents> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(buffer)
  } catch (err) {
    throw new Error(
      `unpackOpc: failed to load ZIP — ${err instanceof Error ? err.message : String(err)}`
    )
  }

  const [orderXml, configXml, versionXml] = await Promise.all([
    findFile(zip, 'order.xml'),
    findFile(zip, 'config.xml'),
    findFile(zip, 'version.xml'),
  ])

  return { orderXml, configXml, versionXml }
}
