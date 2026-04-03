// Run with: node scripts/create-icons.mjs
// Creates placeholder 1x1 PNG icon files for the PWA manifest.
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

// Minimal 1x1 transparent PNG (base64 encoded)
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const png = Buffer.from(PNG_BASE64, 'base64')

try {
  mkdirSync(publicDir, { recursive: true })
} catch {
  // already exists
}

writeFileSync(join(publicDir, 'icon-192.png'), png)
writeFileSync(join(publicDir, 'icon-512.png'), png)

console.log('Placeholder icons written to public/')
