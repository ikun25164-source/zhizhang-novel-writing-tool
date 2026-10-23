import { app, BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { startServer } from '../server/index.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shots = path.join(root, '.tmp')

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  await fs.mkdir(shots, { recursive: true })
  const server = await startServer({ dataRoot: path.join(root, 'data'), port: 8790 })
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  })
  const url = `http://127.0.0.1:${server.port}`
  await win.loadURL(url)
  await wait(1200)

  const pickerShot = await win.webContents.capturePage()
  await fs.writeFile(path.join(shots, 'desktop-picker.png'), pickerShot.toPNG())

  await win.webContents.executeJavaScript(
    "document.querySelector('.project-card')?.click(); true",
  )
  await wait(1600)

  const desktopShot = await win.webContents.capturePage()
  await fs.writeFile(path.join(shots, 'desktop-write.png'), desktopShot.toPNG())

  win.setSize(390, 844)
  await wait(900)
  const mobileShot = await win.webContents.capturePage()
  await fs.writeFile(path.join(shots, 'mobile-write.png'), mobileShot.toPNG())

  console.log('smoke shots saved')
  await server.close()
  app.quit()
})
