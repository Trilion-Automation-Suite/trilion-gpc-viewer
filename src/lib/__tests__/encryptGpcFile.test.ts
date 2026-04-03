import { describe, it, expect } from 'vitest'
import { encryptGpcFile } from '../encryptGpcFile.js'
import { decryptGpcFile } from '../decrypt.js'

describe('encryptGpcFile', () => {
  it('encrypt then decrypt round-trips to original bytes', async () => {
    const original = new TextEncoder().encode('Hello GPC Viewer! Test payload!!')
    expect(original.byteLength).toBe(32) // must be multiple of 16 to avoid padding

    const encrypted = await encryptGpcFile(original.buffer as ArrayBuffer)
    const decrypted = await decryptGpcFile(encrypted)

    // Wrap both sides in new Uint8Array() to avoid cross-realm comparison issues
    // (Node's WebCrypto returns ArrayBuffers from its own realm — same pattern
    // as used in decrypt.test.ts)
    expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(original.buffer as ArrayBuffer))
  })

  it('produces a result larger than the input (PKCS7 padding adds up to 16 bytes)', async () => {
    // 32-byte plaintext → 48 bytes after AES-CBC with PKCS7 (one full padding block)
    const input = new Uint8Array(32).fill(0x41)
    const encrypted = await encryptGpcFile(input.buffer as ArrayBuffer)
    expect(encrypted.byteLength).toBe(48)
  })

  it('output length is always a multiple of 16 (AES block size)', async () => {
    for (const size of [1, 15, 16, 17, 47]) {
      const input = new Uint8Array(size).fill(0x42)
      const encrypted = await encryptGpcFile(input.buffer as ArrayBuffer)
      expect(encrypted.byteLength % 16).toBe(0)
    }
  })

  it('returns an ArrayBuffer', async () => {
    const input = new Uint8Array(16).fill(0x00)
    const result = await encryptGpcFile(input.buffer as ArrayBuffer)
    expect(Object.prototype.toString.call(result)).toBe('[object ArrayBuffer]')
  })

  it('different plaintexts produce different ciphertexts', async () => {
    const a = new Uint8Array(16).fill(0x11)
    const b = new Uint8Array(16).fill(0x22)
    const encA = await encryptGpcFile(a.buffer as ArrayBuffer)
    const encB = await encryptGpcFile(b.buffer as ArrayBuffer)
    expect(new Uint8Array(encA)).not.toEqual(new Uint8Array(encB))
  })

  it('decrypt(encrypt(x)) round-trips for various lengths', async () => {
    for (const size of [16, 32, 48, 64, 128]) {
      const original = new Uint8Array(size)
      for (let i = 0; i < size; i++) original[i] = i % 256
      const encrypted = await encryptGpcFile(original.buffer as ArrayBuffer)
      const decrypted = await decryptGpcFile(encrypted)
      expect(new Uint8Array(decrypted)).toEqual(new Uint8Array(original.buffer as ArrayBuffer))
    }
  })
})
