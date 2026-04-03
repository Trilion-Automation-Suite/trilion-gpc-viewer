/**
 * Encrypts data for saving as a .gconfiguration file (AES-128-CBC).
 * Key and IV are both the UTF-8 bytes of "1234512345678976" (16 bytes each).
 * WebCrypto AES-CBC handles PKCS7 padding automatically on encrypt.
 * Mirrors decrypt.ts in structure.
 */

const KEY_BYTES: Uint8Array<ArrayBuffer> = new Uint8Array(new TextEncoder().encode('1234512345678976'))

async function importAesKeyForEncrypt(keyBytes: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  )
}

export async function encryptGpcFile(buffer: ArrayBuffer): Promise<ArrayBuffer> {
  const key = await importAesKeyForEncrypt(KEY_BYTES)
  return crypto.subtle.encrypt({ name: 'AES-CBC', iv: KEY_BYTES }, key, buffer)
}
