import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const svg = path.join(root, 'public', 'favicon.svg')
const pub = path.join(root, 'public')
const build = path.join(root, 'build')

async function main() {
  await fs.mkdir(build, { recursive: true })
  for (const size of [192, 512]) {
    await sharp(svg, { density: 512 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(pub, `icon-${size}.png`))
  }
  const big = await sharp(svg, { density: 1024 }).resize(1024, 1024).png().toBuffer()
  await fs.writeFile(path.join(build, 'icon.png'), big)
  const sizes = [16, 24, 32, 48, 64, 128, 256]
  const buffers = await Promise.all(
    sizes.map((size) => sharp(svg, { density: 512 }).resize(size, size).png().toBuffer()),
  )
  await fs.writeFile(path.join(build, 'icon.ico'), await pngToIco(buffers))
  console.log('图标已生成: public/icon-*.png, build/icon.png, build/icon.ico')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
