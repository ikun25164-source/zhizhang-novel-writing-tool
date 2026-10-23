import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const RES = 'android/app/src/main/res'
const ICON = 'build/icon.png'
const BG = { r: 242, g: 243, b: 244 }

const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }
const PORT = {
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
}
const LAND = {
  mdpi: [480, 320],
  hdpi: [800, 480],
  xhdpi: [1280, 720],
  xxhdpi: [1600, 960],
  xxxhdpi: [1920, 1280],
}

const icon = sharp(ICON).png()
const meta = await icon.metadata()
const roundMask = Buffer.from(
  `<svg width="${meta.width}" height="${meta.height}"><circle cx="${meta.width / 2}" cy="${
    meta.height / 2
  }" r="${meta.width / 2}" fill="#fff"/></svg>`,
)

for (const [density, size] of Object.entries(LAUNCHER)) {
  const dir = path.join(RES, `mipmap-${density}`)
  fs.mkdirSync(dir, { recursive: true })
  await sharp(ICON).resize(size, size, { fit: 'cover' }).png().toFile(path.join(dir, 'ic_launcher.png'))
  const rounded = await sharp(ICON).resize(size, size, { fit: 'cover' }).png().toBuffer()
  const mask = await sharp(roundMask).resize(size, size).png().toBuffer()
  await sharp(rounded)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toFile(path.join(dir, 'ic_launcher_round.png'))
}

for (const [density, size] of Object.entries(FOREGROUND)) {
  const dir = path.join(RES, `mipmap-${density}`)
  const inner = Math.round(size * 0.62)
  const offset = Math.round((size - inner) / 2)
  const glyph = await sharp(ICON).resize(inner, inner, { fit: 'cover' }).png().toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: glyph, left: offset, top: offset }])
    .png()
    .toFile(path.join(dir, 'ic_launcher_foreground.png'))
}

for (const [density, [width, height]] of Object.entries(PORT)) {
  const dir = path.join(RES, `drawable-port-${density}`)
  fs.mkdirSync(dir, { recursive: true })
  const logo = Math.round(Math.min(width, height) * 0.26)
  const glyph = await sharp(ICON).resize(logo, logo).png().toBuffer()
  await sharp({ create: { width, height, channels: 3, background: BG } })
    .composite([{ input: glyph, left: Math.round((width - logo) / 2), top: Math.round((height - logo) / 2) }])
    .png()
    .toFile(path.join(dir, 'splash.png'))
}

for (const [density, [width, height]] of Object.entries(LAND)) {
  const dir = path.join(RES, `drawable-land-${density}`)
  fs.mkdirSync(dir, { recursive: true })
  const logo = Math.round(Math.min(width, height) * 0.26)
  const glyph = await sharp(ICON).resize(logo, logo).png().toBuffer()
  await sharp({ create: { width, height, channels: 3, background: BG } })
    .composite([{ input: glyph, left: Math.round((width - logo) / 2), top: Math.round((height - logo) / 2) }])
    .png()
    .toFile(path.join(dir, 'splash.png'))
}

const base = path.join(RES, 'drawable')
fs.mkdirSync(base, { recursive: true })
const baseLogo = 192
const baseGlyph = await sharp(ICON).resize(baseLogo, baseLogo).png().toBuffer()
await sharp({ create: { width: 480, height: 480, channels: 3, background: BG } })
  .composite([{ input: baseGlyph, left: 144, top: 144 }])
  .png()
  .toFile(path.join(base, 'splash.png'))

console.log('Android 图标与启动图已生成')
