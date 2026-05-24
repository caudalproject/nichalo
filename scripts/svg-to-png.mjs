import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const svg = readFileSync(join(root, 'public/logo-social.svg'))

await sharp(svg)
  .resize(500, 500)
  .png()
  .toFile(join(root, 'public/logo-social.png'))

console.log('✓ public/logo-social.png generado (500×500)')
