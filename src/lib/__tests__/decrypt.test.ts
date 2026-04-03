import { describe, it, expect } from 'vitest'
import { decryptGpcFile } from '../decrypt.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KEY_BYTES = new TextEncoder().encode('1234512345678976')

async function encryptWithSameKey(plaintext: BufferSource): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    KEY_BYTES,
    { name: 'AES-CBC' },
    false,
    ['encrypt']
  )
  return crypto.subtle.encrypt({ name: 'AES-CBC', iv: KEY_BYTES }, key, plaintext)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('decryptGpcFile', () => {
  it('decrypts a known round-trip: encrypt then decrypt returns original bytes', async () => {
    // Use a 32-byte plaintext (multiple of 16 to avoid padding complications in our helper)
    const original = new TextEncoder().encode('Hello GPC Viewer! Test payload!!')
    expect(original.byteLength).toBe(32) // sanity check

    const originalBuffer = original.buffer as ArrayBuffer
    const encrypted = await encryptWithSameKey(originalBuffer)
    const decrypted = await decryptGpcFile(encrypted)

    const decryptedBytes = new Uint8Array(decrypted)
    const originalBytes = new Uint8Array(originalBuffer)
    expect(decryptedBytes).toEqual(originalBytes)
  })

  it('produces a result with ZIP magic bytes when encrypting a PK-prefixed payload', async () => {
    // Build a minimal "ZIP-like" payload starting with PK (+ padding to 16 bytes)
    const payload = new Uint8Array(16)
    payload[0] = 0x50 // 'P'
    payload[1] = 0x4b // 'K'
    payload[2] = 0x03
    payload[3] = 0x04

    const encrypted = await encryptWithSameKey(payload)
    const decrypted = await decryptGpcFile(encrypted)

    const result = new Uint8Array(decrypted)
    expect(result[0]).toBe(0x50)
    expect(result[1]).toBe(0x4b)
  })

  it('throws on empty buffer', async () => {
    await expect(decryptGpcFile(new ArrayBuffer(0))).rejects.toThrow(
      'input buffer is empty'
    )
  })

  it('throws when input length is not a multiple of 16', async () => {
    const bad = new ArrayBuffer(17)
    await expect(decryptGpcFile(bad)).rejects.toThrow(
      'not a multiple of 16'
    )
  })

  it('decrypted output length matches plaintext block size', async () => {
    // Plaintext: 48 bytes → after AES-CBC encrypt → 64 bytes (one PKCS7 padding block)
    // After decrypt → 48 bytes
    const plaintext = new Uint8Array(48).fill(0x41) // 'A' * 48
    const encrypted = await encryptWithSameKey(plaintext)
    const decrypted = await decryptGpcFile(encrypted)
    expect(decrypted.byteLength).toBe(48)
  })

  it('returns an ArrayBuffer', async () => {
    const plaintext = new Uint8Array(16).fill(0x42)
    const encrypted = await encryptWithSameKey(plaintext)
    const decrypted = await decryptGpcFile(encrypted)
    // Use string-tag check instead of instanceof — Node's WebCrypto returns
    // an ArrayBuffer from its own realm which fails cross-realm instanceof.
    expect(Object.prototype.toString.call(decrypted)).toBe('[object ArrayBuffer]')
  })
})
