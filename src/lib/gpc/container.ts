/**
 * The GPC container: the OPC ZIP that sits inside a .gconfiguration once the
 * AES layer is peeled off.
 *
 * GPC will only open a file whose ZIP matches what .NET's System.IO.Packaging
 * writes, down to bytes that no ZIP reader cares about — the 28-byte growth-hint
 * extra field, the max-compression flag bit, `_rels/.rels` being STORED while
 * everything else is DEFLATE. So this is a deliberate, exact writer rather than a
 * general-purpose zip library: every field is pinned to an observed value and the
 * oracle is byte identity against real configurator-written files.
 *
 * Compression goes through CompressionStream('deflate-raw'), which is available
 * both in browsers and in Node. Measured against all 9 corpus artifacts, its
 * output is byte-identical to the DEFLATE streams .NET produced, including the
 * 34.7 MB config.xml — so the save path needs no bundled zip library and no
 * Node-only import.
 */

/** DEFLATE for every part except `_rels/.rels`, which is STORED. */
export const METHOD_STORED = 0
export const METHOD_DEFLATE = 8

/**
 * The OPC "growth hint" .NET writes as a local-header extra field on every entry:
 * header id 0xA220, length 24, signature 0xA028, then 20 zero bytes of padding.
 * It is absent from the central directory. Present on all 9 artifacts, identical.
 */
const GROWTH_HINT = Uint8Array.from([
  0x20, 0xa2, 0x18, 0x00, 0x28, 0xa0, 0x14, 0x00,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
])

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50

/** .NET writes 45 ("4.5") as version-made-by on every entry. */
const VERSION_MADE_BY = 45

export interface GpcEntry {
  /** Part name as stored, e.g. `order.xml`, `_rels/.rels`. No leading slash. */
  name: string
  /** Uncompressed bytes. The container stores parts decompressed. */
  data: Uint8Array
  method: typeof METHOD_STORED | typeof METHOD_DEFLATE
}

export interface GpcContainer {
  /** In stored order, which is significant: GPC reads them positionally. */
  entries: GpcEntry[]
  /**
   * The single DOS date/time every header shares. Save-clock derived, so spec §0
   * pins it from the target artifact rather than regenerating it.
   */
  dosTime: number
  dosDate: number
}

/** Parses the OPC ZIP, decompressing each part. Throws on anything unexpected. */
export async function readContainer(zip: Uint8Array): Promise<GpcContainer> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)

  const eocd = findEocd(view, zip.length)
  const entryCount = view.getUint16(eocd + 10, true)
  const commentLen = view.getUint16(eocd + 20, true)
  if (commentLen !== 0) throw new Error(`container: ZIP comment present (${commentLen} bytes)`)

  const entries: GpcEntry[] = []
  const stamps = new Set<string>()
  let p = view.getUint32(eocd + 16, true)

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(p, true) !== SIG_CENTRAL) {
      throw new Error(`container: bad central directory signature at ${p}`)
    }
    const method = view.getUint16(p + 10, true)
    const time = view.getUint16(p + 12, true)
    const date = view.getUint16(p + 14, true)
    const crc = view.getUint32(p + 16, true)
    const csize = view.getUint32(p + 20, true)
    const usize = view.getUint32(p + 24, true)
    const nlen = view.getUint16(p + 28, true)
    const elen = view.getUint16(p + 30, true)
    const clen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = decodeName(zip.subarray(p + 46, p + 46 + nlen))

    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new Error(`container: ${name} uses unsupported method ${method}`)
    }
    stamps.add(`${time}:${date}`)

    // Directory entries would break GPC; .NET never writes them (spec §2).
    if (name.endsWith('/')) throw new Error(`container: directory entry ${name}`)

    const raw = readLocalData(view, zip, localOffset, name, csize)
    const data =
      method === METHOD_DEFLATE ? await inflateRaw(raw, usize) : Uint8Array.prototype.slice.call(raw)

    if (data.length !== usize) {
      throw new Error(`container: ${name} inflated to ${data.length}, header says ${usize}`)
    }
    const actualCrc = crc32(data)
    if (actualCrc !== crc) {
      throw new Error(
        `container: ${name} CRC ${actualCrc.toString(16)} != header ${crc.toString(16)}`
      )
    }

    entries.push({ name, data, method })
    p += 46 + nlen + elen + clen
  }

  if (stamps.size !== 1) {
    throw new Error(`container: expected one shared timestamp, found ${stamps.size}`)
  }
  const [time, date] = [...stamps][0].split(':').map(Number)
  return { entries, dosTime: time, dosDate: date }
}

/** Serializes a container back to the exact byte layout .NET produces. */
export async function writeContainer(container: GpcContainer): Promise<Uint8Array> {
  const { entries, dosTime, dosDate } = container

  const compressed = await Promise.all(
    entries.map(async (e) => (e.method === METHOD_DEFLATE ? deflateRaw(e.data) : e.data))
  )
  const names = entries.map((e) => encodeName(e.name))
  const crcs = entries.map((e) => crc32(e.data))

  let localSize = 0
  let centralSize = 0
  for (let i = 0; i < entries.length; i++) {
    localSize += 30 + names[i].length + GROWTH_HINT.length + compressed[i].length
    centralSize += 46 + names[i].length
  }

  const out = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(out.buffer)
  const localOffsets: number[] = []
  let off = 0

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    localOffsets.push(off)
    view.setUint32(off, SIG_LOCAL, true)
    view.setUint16(off + 4, versionNeeded(e.method), true)
    view.setUint16(off + 6, flagsFor(e.method), true)
    view.setUint16(off + 8, e.method, true)
    view.setUint16(off + 10, dosTime, true)
    view.setUint16(off + 12, dosDate, true)
    view.setUint32(off + 14, crcs[i], true)
    view.setUint32(off + 18, compressed[i].length, true)
    view.setUint32(off + 22, e.data.length, true)
    view.setUint16(off + 26, names[i].length, true)
    view.setUint16(off + 28, GROWTH_HINT.length, true)
    off += 30
    out.set(names[i], off); off += names[i].length
    out.set(GROWTH_HINT, off); off += GROWTH_HINT.length
    out.set(compressed[i], off); off += compressed[i].length
  }

  const centralStart = off
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    view.setUint32(off, SIG_CENTRAL, true)
    view.setUint16(off + 4, VERSION_MADE_BY, true)
    view.setUint16(off + 6, versionNeeded(e.method), true)
    view.setUint16(off + 8, flagsFor(e.method), true)
    view.setUint16(off + 10, e.method, true)
    view.setUint16(off + 12, dosTime, true)
    view.setUint16(off + 14, dosDate, true)
    view.setUint32(off + 16, crcs[i], true)
    view.setUint32(off + 20, compressed[i].length, true)
    view.setUint32(off + 24, e.data.length, true)
    view.setUint16(off + 28, names[i].length, true)
    view.setUint16(off + 30, 0, true)  // central extra: empty, unlike the local header
    view.setUint16(off + 32, 0, true)  // file comment
    view.setUint16(off + 34, 0, true)  // disk number start
    view.setUint16(off + 36, 0, true)  // internal attributes
    view.setUint32(off + 38, 0, true)  // external attributes
    view.setUint32(off + 42, localOffsets[i], true)
    off += 46
    out.set(names[i], off); off += names[i].length
  }

  view.setUint32(off, SIG_EOCD, true)
  view.setUint16(off + 4, 0, true)
  view.setUint16(off + 6, 0, true)
  view.setUint16(off + 8, entries.length, true)
  view.setUint16(off + 10, entries.length, true)
  view.setUint32(off + 12, off - centralStart, true)
  view.setUint32(off + 16, centralStart, true)
  view.setUint16(off + 20, 0, true)

  return out
}

/** STORED needs 1.0, DEFLATE needs 2.0 — what .NET writes, on every artifact. */
function versionNeeded(method: number): number {
  return method === METHOD_STORED ? 10 : 20
}

/**
 * Bit 1 set on DEFLATE entries: the "maximum compression" hint. .NET sets it
 * unconditionally; GPC's files all carry it, so the writer does too.
 */
function flagsFor(method: number): number {
  return method === METHOD_STORED ? 0x0000 : 0x0002
}

function findEocd(view: DataView, length: number): number {
  for (let i = length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) return i
  }
  throw new Error('container: no end-of-central-directory record')
}

function readLocalData(
  view: DataView,
  zip: Uint8Array,
  localOffset: number,
  name: string,
  csize: number
): Uint8Array {
  if (view.getUint32(localOffset, true) !== SIG_LOCAL) {
    throw new Error(`container: bad local header for ${name} at ${localOffset}`)
  }
  const nlen = view.getUint16(localOffset + 26, true)
  const elen = view.getUint16(localOffset + 28, true)
  const start = localOffset + 30 + nlen + elen
  return zip.subarray(start, start + csize)
}

/** Part names are ASCII in every artifact; UTF-8 round-trips them unchanged. */
function decodeName(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

function encodeName(name: string): Uint8Array {
  return new TextEncoder().encode(name)
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  return streamThrough(new CompressionStream('deflate-raw'), data)
}

async function inflateRaw(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  const out = await streamThrough(new DecompressionStream('deflate-raw'), data)
  if (out.length !== expectedSize) {
    throw new Error(`container: inflated ${out.length} bytes, expected ${expectedSize}`)
  }
  return out
}

async function streamThrough(
  transform: CompressionStream | DecompressionStream,
  data: Uint8Array
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter()
  // TS types the writer as taking only ArrayBuffer-backed views; nothing here is
  // ever backed by a SharedArrayBuffer, so the narrowing is safe.
  void writer.write(data as Uint8Array<ArrayBuffer>)
  void writer.close()
  const chunks: Uint8Array[] = []
  const reader = transform.readable.getReader()
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value as Uint8Array)
    total += (value as Uint8Array).length
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    out.set(c, at)
    at += c.length
  }
  return out
}

const CRC_TABLE = /* @__PURE__ */ (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
