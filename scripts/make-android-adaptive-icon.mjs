import fs from 'node:fs'
import path from 'node:path'

const RES = 'android/app/src/main/res'
const DAY = { bg: '#EDEEF0', fg: '#232629', soft: '#7A7F85' }
const NIGHT = { bg: '#232629', fg: '#F1F2F3', soft: '#8B9096' }

const line = (d, color, width) =>
  `    <path\n        android:fillColor="#00000000"\n        android:strokeColor="${color}"\n        android:strokeWidth="${width}"\n        android:strokeLineCap="round"\n        android:strokeLineJoin="round"\n        android:pathData="${d}" />`
const dot = (cx, cy, r, color) =>
  `    <path\n        android:fillColor="${color}"\n        android:pathData="M${cx - r},${cy} a${r},${r} 0 1,0 ${r * 2},0 a${r},${r} 0 1,0 -${r * 2},0 z" />`

function mark(fg, soft) {
  return [
    line('M32,42 L76,42', fg, 6.4),
    line('M32,54 L69,54', fg, 6.4),
    line('M32,66 L74,66', fg, 6.4),
    line('M60,58 C63,63 66,67 70,71 C66,76 61,79 56,81', soft, 4.2),
    dot(32, 42, 3.4, fg),
    dot(74, 66, 3.4, soft),
  ].join('\n')
}

const vector = (body) =>
  `<vector xmlns:android="http://schemas.android.com/apk/res/android"\n    android:width="108dp"\n    android:height="108dp"\n    android:viewportWidth="108"\n    android:viewportHeight="108">\n${body}\n</vector>\n`

const foreground = vector(mark('@color/ic_launcher_fg', '@color/ic_launcher_fg_soft'))
const monochrome = vector(mark('#FFFFFF', '#FFFFFF'))
const background = vector(
  '    <path\n        android:fillColor="@color/ic_launcher_bg"\n        android:pathData="M0,0 H108 V108 H0 Z" />',
)
const adaptive =
  '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@drawable/ic_launcher_background" />\n    <foreground android:drawable="@drawable/ic_launcher_foreground" />\n    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />\n</adaptive-icon>\n'
const palette = (c) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_bg">${c.bg}</color>\n    <color name="ic_launcher_fg">${c.fg}</color>\n    <color name="ic_launcher_fg_soft">${c.soft}</color>\n</resources>\n`

const files = {
  'drawable/ic_launcher_background.xml': background,
  'drawable/ic_launcher_foreground.xml': foreground,
  'drawable-v24/ic_launcher_foreground.xml': foreground,
  'drawable/ic_launcher_monochrome.xml': monochrome,
  'mipmap-anydpi-v26/ic_launcher.xml': adaptive,
  'mipmap-anydpi-v26/ic_launcher_round.xml': adaptive,
  'values/ic_launcher_palette.xml': palette(DAY),
  'values-night/ic_launcher_palette.xml': palette(NIGHT),
}

for (const [rel, content] of Object.entries(files)) {
  const target = path.join(RES, rel)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}

const legacy = path.join(RES, 'values/ic_launcher_background.xml')
if (fs.existsSync(legacy)) fs.rmSync(legacy)

console.log('Android 自适应图标已生成：浅色 / 深色 / 单色主题三套样式')
