/**
 * Decrypts a .gconfiguration file (AES-128-CBC).
 * Key and IV are both the UTF-8 bytes of "1234512345678976" (16 bytes each).
 * WebCrypto AES-CBC handles PKCS7 un-padding automatically on decrypt.
 */

const KEY_BYTES: Uint8Array<ArrayBuffer> = new Uint8Array(new TextEncoder().encode('1234512345678976'))

async function importAesKey(keyBytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  )
}

export async function decryptGpcFile(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  if (buffer.byteLength === 0) {
    throw new Error('decryptGpcFile: input buffer is empty')
  }
  if (buffer.byteLength % 16 !== 0) {
    throw new Error(
      `decryptGpcFile: input length ${buffer.byteLength} is not a multiple of 16 (AES block size)`
    )
  }

  const key = await importAesKey(KEY_BYTES)
  // IV is the same 16 bytes as the key
  const iv = KEY_BYTES

  let decrypted: ArrayBuffer
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      buffer
    )
  } catch (err) {
    throw new Error(
      `decryptGpcFile: AES-CBC decryption failed — ${err instanceof Error ? err.message : String(err)}`
    )
  }

  return decrypted
}
