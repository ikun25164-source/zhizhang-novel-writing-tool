import { app, BrowserWindow, Menu, dialog, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { startServer } from '../server/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

let win = null
let server = null
let quitting = false

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
    }
  })

  app.setAppUserModelId('com.zhizhang.studio')

  app.whenReady().then(boot).catch((err) => {
    dialog.showErrorBox('织章启动失败', String(err?.stack || err))
    app.exit(1)
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', (event) => {
    if (quitting || !server) return
    event.preventDefault()
    quitting = true
    const force = setTimeout(() => app.exit(0), 2500)
    force.unref()
    server
      .close()
      .catch(() => {})
      .finally(() => app.exit(0))
  })
}

async function boot() {
  const dist = path.join(ROOT, 'dist', 'index.html')
  if (!fs.existsSync(dist)) {
    dialog.showErrorBox('缺少前端文件', '未找到 dist/index.html，请先运行 npm run build 再启动桌面端。')
    app.exit(1)
    return
  }

  const dataRoot = path.join(app.getPath('userData'), 'data')
  server = await startServer({ dataRoot, port: 8787 })
  const url = `http://127.0.0.1:${server.port}`

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 860,
    minHeight: 600,
    show: false,
    backgroundColor: '#f2f3f4',
    title: '织章 · 小说创作工作台',
    icon: path.join(ROOT, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/i.test(target) && !target.startsWith(url)) shell.openExternal(target)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault()
      if (/^https?:/i.test(target)) shell.openExternal(target)
    }
  })

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: '文件',
        submenu: [
          {
            label: '打开数据目录',
            click: () => shell.openPath(dataRoot),
          },
          { type: 'separator' },
          { label: '退出', role: 'quit' },
        ],
      },
      {
        label: '编辑',
        submenu: [
          { label: '撤销', role: 'undo' },
          { label: '重做', role: 'redo' },
          { type: 'separator' },
          { label: '剪切', role: 'cut' },
          { label: '复制', role: 'copy' },
          { label: '粘贴', role: 'paste' },
          { label: '全选', role: 'selectAll' },
        ],
      },
      {
        label: '视图',
        submenu: [
          { label: '重新载入', role: 'reload' },
          { label: '实际大小', role: 'resetZoom' },
          { label: '放大', role: 'zoomIn' },
          { label: '缩小', role: 'zoomOut' },
          { type: 'separator' },
          { label: '全屏', role: 'togglefullscreen' },
          { label: '开发者工具', click: () => win.webContents.toggleDevTools() },
        ],
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '局域网访问说明',
            click: () => {
              const urls = server?.urls || []
              dialog.showMessageBox(win, {
                type: 'info',
                title: '手机 / 平板连接',
                message: '在同一 Wi-Fi 下，用手机浏览器或「织章手机版」输入以下地址：',
                detail: urls.length
                  ? `${urls.map((item) => item).join('\n')}\n\n如无法打开，请在 Windows 防火墙中允许本程序访问专用网络。`
                  : '未检测到局域网地址，请检查网络连接。',
                buttons: ['知道了'],
              })
            },
          },
          {
            label: '关于织章',
            click: () => {
              dialog.showMessageBox(win, {
                type: 'info',
                title: '关于织章',
                message: `织章 ${app.getVersion()}`,
                detail: '本地优先的小说创作工作台。\n正文、章纲、大纲、事件线、人物与世界观地图相互联动。\n\n所有作品保存在本机，不会上传到任何服务器。',
                buttons: ['好'],
              })
            },
          },
        ],
      },
    ]),
  )

  await win.loadURL(url)
  win.show()
}
