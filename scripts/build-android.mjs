import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const localJdk = 'E:/ZhizhangBuild/jdk21/jdk-21.0.2'
const javaHome =
  process.env.ZHIZHANG_JAVA_HOME || (fs.existsSync(localJdk) ? localJdk : process.env.JAVA_HOME || '')
const gradle = path.resolve('android/gradlew.bat')
const result = spawnSync(gradle, ['assembleRelease'], {
  cwd: path.resolve('android'),
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    ...(javaHome ? { JAVA_HOME: javaHome, PATH: `${javaHome}/bin;${process.env.PATH}` } : {}),
  },
})
if (result.status !== 0) process.exit(result.status || 1)

const src = path.resolve('android/app/build/outputs/apk/release/app-release.apk')
const outDir =
  process.env.ZHIZHANG_APK_OUT ||
  (fs.existsSync('E:/ZhizhangBuild') ? 'E:/ZhizhangBuild/android' : path.resolve('release/android'))
fs.mkdirSync(outDir, { recursive: true })
const dest = path.join(outDir, `织章-${pkg.version}.apk`)
if (fs.existsSync(dest)) {
  const mtime = new Date(fs.statSync(dest).mtimeMs)
  const pad = (n) => String(n).padStart(2, '0')
  const stamp = `${mtime.getFullYear()}${pad(mtime.getMonth() + 1)}${pad(mtime.getDate())}${pad(mtime.getHours())}${pad(mtime.getMinutes())}`
  const archive = path.join(outDir, `织章-${pkg.version}-${stamp}.apk`)
  if (!fs.existsSync(archive)) fs.copyFileSync(dest, archive)
  console.log(`上一版已留档: ${archive}`)
}
fs.copyFileSync(src, dest)
console.log(`APK 已输出: ${dest} (${(fs.statSync(dest).size / 1024 / 1024).toFixed(1)} MB)`)
