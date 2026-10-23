import express from 'express'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import {
  publicSyncConfig,
  readSyncConfig,
  recordDeletedProject,
  runSync,
  saveSyncConfig,
  testWebdav,
} from './sync.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'dist')
const DEFAULT_PORT = Number(process.env.ZHIZHANG_PORT || 8787)
const COLLECTIONS = ['volumes', 'chapters', 'outlines', 'timelines', 'events', 'characters', 'maps', 'places']
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }

let DATA_ROOT = path.resolve(process.env.ZHIZHANG_DATA || path.join(ROOT, 'data'))
let actualPort = DEFAULT_PORT
let serverInstance = null
const writeQueues = new Map()
const sseClients = new Map()
const backupTimers = new Map()

const now = () => new Date().toISOString()
const uid = () => crypto.randomUUID().replace(/-/g, '')

function bad(status, message) {
  const e = new Error(message)
  e.status = status
  return e
}

function projectDir(pid) {
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(String(pid || ''))) throw bad(400, '项目编号无效')
  return path.join(DATA_ROOT, 'projects', pid)
}

const chapterFile = (pid, cid) => {
  if (!/^[a-zA-Z0-9_-]{4,64}$/.test(String(cid || ''))) throw bad(400, '章节编号无效')
  return path.join(projectDir(pid), 'chapters', `${cid}.json`)
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return fallback
    if (err instanceof SyntaxError) {
      try {
        const broken = `${file}.broken-${Date.now()}`
        await fsp.rename(file, broken)
        console.error(`[data] JSON 损坏，已移至 ${broken}`)
      } catch {}
      return fallback
    }
    throw err
  }
}

function writeJson(file, value) {
  const task = async () => {
    await fsp.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
    try {
      await fsp.rename(tmp, file)
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EEXIST' || err.code === 'EACCES') {
        await fsp.rm(file, { force: true })
        await fsp.rename(tmp, file)
      } else {
        await fsp.rm(tmp, { force: true }).catch(() => {})
        throw err
      }
    }
  }
  const prev = writeQueues.get(file) || Promise.resolve()
  const next = prev.then(task, task)
  writeQueues.set(file, next.catch(() => {}))
  return next
}

async function ensureBase() {
  await fsp.mkdir(path.join(DATA_ROOT, 'projects'), { recursive: true })
  await fsp.mkdir(path.join(DATA_ROOT, 'trash'), { recursive: true })
  const indexFile = path.join(DATA_ROOT, 'projects.json')
  if (!fs.existsSync(indexFile)) await writeJson(indexFile, { projects: [] })
}

async function readIndex() {
  const idx = await readJson(path.join(DATA_ROOT, 'projects.json'), { projects: [] })
  if (!Array.isArray(idx.projects)) idx.projects = []
  return idx
}

async function writeIndex(idx) {
  await writeJson(path.join(DATA_ROOT, 'projects.json'), idx)
}

async function touchIndex(pid, patch = {}) {
  const idx = await readIndex()
  const i = idx.projects.findIndex((p) => p.id === pid)
  if (i >= 0) {
    idx.projects[i] = { ...idx.projects[i], ...patch, updatedAt: now() }
    await writeIndex(idx)
  }
}

async function getMeta(pid) {
  const meta = await readJson(path.join(projectDir(pid), 'project.json'), null)
  if (!meta) throw bad(404, '项目不存在')
  return meta
}

async function readCollection(pid, name) {
  if (!COLLECTIONS.includes(name)) throw bad(400, '未知数据集合')
  const data = await readJson(path.join(projectDir(pid), `${name}.json`), null)
  if (!data) return { rev: 0, updatedAt: null, items: [] }
  return {
    rev: Number(data.rev) || 0,
    updatedAt: data.updatedAt || null,
    items: Array.isArray(data.items) ? data.items : [],
  }
}

async function writeCollection(pid, name, data) {
  if (!COLLECTIONS.includes(name)) throw bad(400, '未知数据集合')
  await writeJson(path.join(projectDir(pid), `${name}.json`), data)
}

async function createProject(input = {}) {
  await ensureBase()
  const id = uid().slice(0, 16)
  const dir = projectDir(id)
  await fsp.mkdir(path.join(dir, 'chapters'), { recursive: true })
  await fsp.mkdir(path.join(dir, 'assets'), { recursive: true })
  await fsp.mkdir(path.join(dir, 'backups'), { recursive: true })

  const ts = now()
  const volId = uid()
  const chId = uid()
  const masterId = uid()
  const volOutId = uid()
  const chOutId = uid()
  const meta = {
    id,
    title: String(input.title || '').trim() || '未命名作品',
    author: String(input.author || '').trim(),
    description: String(input.description || '').trim(),
    calendar: { mode: 'date', era: '', monthsPerYear: 12, daysPerMonth: 30, hoursPerDay: 24 },
    settings: {
      theme: 'light',
      font: 'serif',
      fontSize: 18,
      lineHeight: 1.9,
      editorWidth: 760,
      indent: true,
    },
    createdAt: ts,
    updatedAt: ts,
    rev: 0,
  }

  await writeJson(path.join(dir, 'project.json'), meta)
  await writeCollection(id, 'volumes', {
    rev: 0,
    updatedAt: ts,
    items: [{ id: volId, title: '第一卷', order: 0, description: '' }],
  })
  await writeCollection(id, 'chapters', {
    rev: 0,
    updatedAt: ts,
    items: [
      {
        id: chId,
        title: '第一章',
        order: 0,
        volumeId: volId,
        status: 'draft',
        wordCount: 0,
        rev: 0,
        createdAt: ts,
        updatedAt: ts,
      },
    ],
  })
  await writeCollection(id, 'outlines', {
    rev: 0,
    updatedAt: ts,
    items: [
      {
        id: masterId,
        level: 'master',
        parentId: null,
        title: '总纲',
        summary: '',
        content: EMPTY_DOC,
        plainText: '',
        fields: {},
        order: 0,
        chapterId: null,
        volumeId: null,
        eventIds: [],
        characterIds: [],
        updatedAt: ts,
      },
      {
        id: volOutId,
        level: 'volume',
        parentId: masterId,
        title: '第一卷 · 大纲',
        summary: '',
        content: EMPTY_DOC,
        plainText: '',
        fields: {},
        order: 0,
        chapterId: null,
        volumeId: volId,
        eventIds: [],
        characterIds: [],
        updatedAt: ts,
      },
      {
        id: chOutId,
        level: 'chapter',
        parentId: volOutId,
        title: '第一章 · 章纲',
        summary: '',
        content: EMPTY_DOC,
        plainText: '',
        fields: {},
        order: 0,
        chapterId: chId,
        volumeId: volId,
        eventIds: [],
        characterIds: [],
        updatedAt: ts,
      },
    ],
  })
  await writeCollection(id, 'timelines', {
    rev: 0,
    updatedAt: ts,
    items: [
      {
        id: 'main',
        name: '主线',
        color: '#b4552d',
        description: '',
        forkEventId: null,
        parentTimelineId: null,
        order: 0,
      },
    ],
  })
  for (const name of ['events', 'characters', 'maps', 'places']) {
    await writeCollection(id, name, { rev: 0, updatedAt: ts, items: [] })
  }
  await writeJson(path.join(dir, 'chapters', `${chId}.json`), {
    id: chId,
    content: EMPTY_DOC,
    plainText: '',
    wordCount: 0,
    rev: 0,
    updatedAt: ts,
  })

  const idx = await readIndex()
  idx.projects.unshift({
    id,
    title: meta.title,
    author: meta.author,
    description: meta.description,
    wordCount: 0,
    createdAt: ts,
    updatedAt: ts,
  })
  await writeIndex(idx)
  return { id, chapterId: chId }
}

function scheduleBackup(pid) {
  if (backupTimers.has(pid)) return
  const timer = setTimeout(async () => {
    backupTimers.delete(pid)
    try {
      await createDailyBackup(pid)
    } catch (err) {
      console.error('[backup]', err)
    }
  }, 8000)
  backupTimers.set(pid, timer)
}

async function createDailyBackup(pid) {
  const backupDir = path.join(projectDir(pid), 'backups')
  await fsp.mkdir(backupDir, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  const file = path.join(backupDir, `${date}.json`)
  if (fs.existsSync(file)) return
  const meta = await getMeta(pid)
  const collections = {}
  for (const name of COLLECTIONS) collections[name] = await readCollection(pid, name)
  const chapters = {}
  for (const c of collections.chapters.items) {
    chapters[c.id] = await readJson(chapterFile(pid, c.id), null)
  }
  await writeJson(file, { createdAt: now(), meta, collections, chapters })
  const files = (await fsp.readdir(backupDir)).filter((f) => f.endsWith('.json')).sort()
  for (const f of files.slice(0, Math.max(0, files.length - 30))) {
    await fsp.rm(path.join(backupDir, f), { force: true })
  }
}

function lanUrls(port) {
  const urls = []
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) {
        urls.push(`http://${a.address}:${port}`)
      }
    }
  }
  return urls
}

function broadcast(pid, type, data, excludeClientId) {
  const clients = sseClients.get(pid)
  if (!clients) return
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
  for (const [res, clientId] of clients) {
    if (excludeClientId && clientId === excludeClientId) continue
    try {
      res.write(payload)
    } catch {}
  }
}

function contentDisposition(name, fallbackExt) {
  const fallback = `zhizhang-${Date.now()}.${fallbackExt}`
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

function buildExport(meta, volumes, chapters, contents, collections, format) {
  const volumeMap = new Map((volumes.items || []).map((v) => [v.id, v]))
  const sortedChapters = [...(chapters.items || [])].sort((a, b) => {
    const va = volumeMap.get(a.volumeId)?.order ?? 0
    const vb = volumeMap.get(b.volumeId)?.order ?? 0
    return va - vb || (a.order || 0) - (b.order || 0)
  })
  const sortedVolumes = [...(volumes.items || [])].sort((a, b) => (a.order || 0) - (b.order || 0))

  if (format === 'json') {
    return JSON.stringify(
      {
        exportedAt: now(),
        meta,
        volumes,
        chapters,
        outlines: collections.outlines,
        timelines: collections.timelines,
        events: collections.events,
        characters: collections.characters,
        maps: collections.maps,
        places: collections.places,
        contents,
      },
      null,
      2,
    )
  }

  const md = format === 'md'
  const lines = []
  lines.push(md ? `# ${meta.title}` : meta.title)
  if (meta.author) lines.push(md ? `*${meta.author}*` : `作者：${meta.author}`)
  if (meta.description) lines.push('', meta.description)
  lines.push('')

  for (const vol of sortedVolumes) {
    if (md) lines.push(`## ${vol.title}`)
    else lines.push('', vol.title, '')
    for (const ch of sortedChapters.filter((c) => c.volumeId === vol.id)) {
      if (md) lines.push(`### ${ch.title}`)
      else lines.push('', ch.title, '')
      const body = contents[ch.id]?.plainText || ''
      lines.push(body.trim())
      lines.push('')
    }
  }

  const orphan = sortedChapters.filter((c) => !volumeMap.has(c.volumeId))
  if (orphan.length) {
    lines.push(md ? '## 未分卷章节' : '', '')
    for (const ch of orphan) {
      if (md) lines.push(`### ${ch.title}`)
      else lines.push('', ch.title, '')
      lines.push((contents[ch.id]?.plainText || '').trim(), '')
    }
  }

  if (md) lines.push('---', '', '## 设定附录', '')
  else lines.push('', '===== 设定附录 =====', '')

  if (collections.characters.items.length) {
    lines.push(md ? '### 人物' : '【人物】', '')
    for (const c of collections.characters.items) {
      lines.push(md ? `- **${c.name}** — ${c.role || ''}` : `${c.name}（${c.role || ''}）`)
      const desc = c.background || c.personality || ''
      if (desc) lines.push(desc)
      lines.push('')
    }
  }
  if (collections.events.items.length) {
    lines.push(md ? '### 事件' : '【事件】', '')
    for (const e of collections.events.items) {
      lines.push(md ? `- **${e.title}** — ${e.time?.label || ''}` : `${e.time?.label || ''} ${e.title}`)
      if (e.plainText) lines.push(e.plainText)
      lines.push('')
    }
  }
  if (collections.places.items.length) {
    lines.push(md ? '### 地点' : '【地点】', '')
    for (const p of collections.places.items) {
      lines.push(md ? `- **${p.name}** — ${p.category || ''}` : `${p.name}（${p.category || ''}）`)
      if (p.plainText) lines.push(p.plainText)
      lines.push('')
    }
  }
  return lines.join('\n')
}

function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Client-Id, X-Filename')
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, DELETE, OPTIONS')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
  app.use(express.json({ limit: '40mb' }))

  const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
  const clientId = (req) => String(req.headers['x-client-id'] || req.query.clientId || '')

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, app: 'zhizhang', version: 1, port: actualPort })
  })

  app.get('/api/network', (req, res) => {
    res.json({
      port: actualPort,
      hostname: os.hostname(),
      local: `http://127.0.0.1:${actualPort}`,
      urls: lanUrls(actualPort),
      dataRoot: DATA_ROOT,
    })
  })

  app.get(
    '/api/sync',
    ah(async (req, res) => {
      res.json(publicSyncConfig(await readSyncConfig(DATA_ROOT)))
    }),
  )

  app.put(
    '/api/sync',
    ah(async (req, res) => {
      const cfg = await saveSyncConfig(DATA_ROOT, req.body || {})
      res.json(publicSyncConfig(cfg))
    }),
  )

  app.post(
    '/api/sync/test',
    ah(async (req, res) => {
      res.json(await testWebdav(DATA_ROOT, req.body || {}))
    }),
  )

  app.post(
    '/api/sync/run',
    ah(async (req, res) => {
      res.json(await runSync(DATA_ROOT))
    }),
  )

  app.get(
    '/api/qr',
    ah(async (req, res) => {
      const text = String(req.query.text || '')
      if (!text) throw bad(400, '缺少二维码内容')
      const buf = await QRCode.toBuffer(text, {
        width: 360,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#26231e', light: '#fffdf8' },
      })
      res.type('png').send(buf)
    }),
  )

  app.get(
    '/api/projects',
    ah(async (req, res) => {
      await ensureBase()
      const idx = await readIndex()
      res.json(idx.projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))))
    }),
  )

  app.post(
    '/api/projects',
    ah(async (req, res) => {
      const created = await createProject(req.body || {})
      res.json(created)
    }),
  )

  app.delete(
    '/api/projects/:pid',
    ah(async (req, res) => {
      const pid = req.params.pid
      const dir = projectDir(pid)
      if (!fs.existsSync(dir)) throw bad(404, '项目不存在')
      await fsp.mkdir(path.join(DATA_ROOT, 'trash'), { recursive: true })
      await fsp.rename(dir, path.join(DATA_ROOT, 'trash', `${pid}-${Date.now()}`))
      await recordDeletedProject(DATA_ROOT, pid)
      const idx = await readIndex()
      idx.projects = idx.projects.filter((p) => p.id !== pid)
      await writeIndex(idx)
      broadcast(pid, 'project-deleted', { id: pid }, clientId(req))
      res.json({ ok: true })
    }),
  )

  app.get(
    '/api/projects/:pid',
    ah(async (req, res) => {
      const pid = req.params.pid
      const meta = await getMeta(pid)
      const collections = {}
      for (const name of COLLECTIONS) collections[name] = await readCollection(pid, name)
      res.json({ meta, collections, port: actualPort })
    }),
  )

  app.put(
    '/api/projects/:pid/meta',
    ah(async (req, res) => {
      const pid = req.params.pid
      const current = await getMeta(pid)
      const { baseRev, meta: patch } = req.body || {}
      if (baseRev != null && Number(baseRev) !== Number(current.rev)) {
        return res.status(409).json({ error: 'conflict', current })
      }
      const next = {
        ...current,
        title: patch?.title ?? current.title,
        author: patch?.author ?? current.author,
        description: patch?.description ?? current.description,
        calendar: patch?.calendar ?? current.calendar,
        settings: patch?.settings ?? current.settings,
        updatedAt: now(),
        rev: Number(current.rev) + 1,
      }
      await writeJson(path.join(projectDir(pid), 'project.json'), next)
      await touchIndex(pid, { title: next.title, author: next.author, description: next.description })
      broadcast(pid, 'meta', next, clientId(req))
      scheduleBackup(pid)
      res.json(next)
    }),
  )

  app.get(
    '/api/projects/:pid/collections/:name',
    ah(async (req, res) => {
      res.json(await readCollection(req.params.pid, req.params.name))
    }),
  )

  app.put(
    '/api/projects/:pid/collections/:name',
    ah(async (req, res) => {
      const pid = req.params.pid
      const name = req.params.name
      const { items, baseRev } = req.body || {}
      if (!Array.isArray(items)) throw bad(400, 'items 必须是数组')
      const current = await readCollection(pid, name)
      if (baseRev != null && Number(baseRev) !== current.rev) {
        return res.status(409).json({ error: 'conflict', current })
      }
      const next = { rev: current.rev + 1, updatedAt: now(), items }
      await writeCollection(pid, name, next)
      await touchIndex(pid)
      broadcast(pid, 'collection', { name, data: next }, clientId(req))
      scheduleBackup(pid)
      res.json({ rev: next.rev, updatedAt: next.updatedAt })
    }),
  )

  app.get(
    '/api/projects/:pid/chapters',
    ah(async (req, res) => {
      const pid = req.params.pid
      const chapters = await readCollection(pid, 'chapters')
      const items = {}
      await Promise.all(
        chapters.items.map(async (c) => {
          items[c.id] = await readJson(chapterFile(pid, c.id), null)
        }),
      )
      res.json({ items })
    }),
  )

  app.get(
    '/api/projects/:pid/chapters/:cid',
    ah(async (req, res) => {
      const data = await readJson(chapterFile(req.params.pid, req.params.cid), null)
      res.json(
        data || {
          id: req.params.cid,
          content: EMPTY_DOC,
          plainText: '',
          wordCount: 0,
          rev: 0,
          updatedAt: null,
        },
      )
    }),
  )

  app.put(
    '/api/projects/:pid/chapters/:cid',
    ah(async (req, res) => {
      const pid = req.params.pid
      const cid = req.params.cid
      const { content, plainText, wordCount, baseRev, force } = req.body || {}
      const file = chapterFile(pid, cid)
      const current = await readJson(file, {
        id: cid,
        content: EMPTY_DOC,
        plainText: '',
        wordCount: 0,
        rev: 0,
        updatedAt: null,
      })
      if (!force && baseRev != null && Number(baseRev) !== Number(current.rev)) {
        return res.status(409).json({ error: 'conflict', current })
      }
      const next = {
        id: cid,
        content: content || EMPTY_DOC,
        plainText: typeof plainText === 'string' ? plainText : '',
        wordCount: Number(wordCount) || 0,
        rev: Number(current.rev) + 1,
        updatedAt: now(),
      }
      await writeJson(file, next)

      const chapters = await readCollection(pid, 'chapters')
      const i = chapters.items.findIndex((c) => c.id === cid)
      if (i >= 0) {
        chapters.items[i] = {
          ...chapters.items[i],
          wordCount: next.wordCount,
          updatedAt: next.updatedAt,
          rev: next.rev,
        }
        chapters.rev += 1
        chapters.updatedAt = next.updatedAt
        await writeCollection(pid, 'chapters', chapters)
        broadcast(pid, 'collection', { name: 'chapters', data: chapters }, clientId(req))
      }
      const total = chapters.items.reduce((s, c) => s + (Number(c.wordCount) || 0), 0)
      await touchIndex(pid, { wordCount: total })
      broadcast(pid, 'chapter', next, clientId(req))
      scheduleBackup(pid)
      res.json({
        ok: true,
        rev: next.rev,
        chaptersRev: chapters.rev,
        updatedAt: next.updatedAt,
      })
    }),
  )

  app.post(
    '/api/projects/:pid/upload',
    express.raw({ type: () => true, limit: '80mb' }),
    ah(async (req, res) => {
      const pid = req.params.pid
      await getMeta(pid)
      const body = req.body
      if (!body || !body.length) throw bad(400, '文件为空')
      const kind = String(req.query.kind || 'file').replace(/[^a-z0-9_-]/gi, '') || 'file'
      const explicitExt = String(req.query.ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase()
      const mime = String(req.headers['content-type'] || '')
      const ext =
        explicitExt ||
        (mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : mime.includes('png') ? 'png' : mime.includes('gif') ? 'gif' : 'bin')
      const name = `${kind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
      const dir = path.join(projectDir(pid), 'assets')
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(path.join(dir, name), body)
      res.json({ path: `/media/${pid}/${name}`, size: body.length })
    }),
  )

  app.get(
    '/media/:pid/:file',
    ah(async (req, res) => {
      const pid = req.params.pid
      const file = req.params.file
      if (!/^[a-zA-Z0-9_.-]+$/.test(file)) throw bad(400, '文件名无效')
      const full = path.join(projectDir(pid), 'assets', file)
      if (!fs.existsSync(full)) throw bad(404, '文件不存在')
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      res.sendFile(full)
    }),
  )

  app.get(
    '/api/projects/:pid/export/:format',
    ah(async (req, res) => {
      const pid = req.params.pid
      const format = ['txt', 'md', 'json'].includes(req.params.format) ? req.params.format : 'txt'
      const meta = await getMeta(pid)
      const collections = {}
      for (const name of COLLECTIONS) collections[name] = await readCollection(pid, name)
      const contents = {}
      for (const c of collections.chapters.items) {
        contents[c.id] = await readJson(chapterFile(pid, c.id), null)
      }
      const body = buildExport(
        meta,
        collections.volumes,
        collections.chapters,
        contents,
        collections,
        format,
      )
      const ext = format === 'md' ? 'md' : format === 'json' ? 'json' : 'txt'
      res.setHeader('Content-Disposition', contentDisposition(`${meta.title}.${ext}`, ext))
      res.setHeader(
        'Content-Type',
        format === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
      )
      res.send(body)
    }),
  )

  app.get('/api/projects/:pid/stream', (req, res) => {
    const pid = req.params.pid
    if (!/^[a-zA-Z0-9_-]{4,64}$/.test(pid)) return res.status(400).end()
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no',
    })
    res.write('retry: 3000\n\n')
    const cid = clientId(req)
    if (!sseClients.has(pid)) sseClients.set(pid, new Map())
    sseClients.get(pid).set(res, cid)
    req.on('close', () => {
      const clients = sseClients.get(pid)
      if (clients) {
        clients.delete(res)
        if (!clients.size) sseClients.delete(pid)
      }
    })
  })

  if (fs.existsSync(DIST)) {
    app.use(express.static(DIST, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next()
      if (req.path.startsWith('/api/') || req.path.startsWith('/media/')) return next()
      res.sendFile(path.join(DIST, 'index.html'))
    })
  }

  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err)
    console.error('[api]', err)
    res.status(err.status || 500).json({ error: err.message || '服务器错误' })
  })

  return app
}

function tryListen(app, port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => resolve(server))
    server.once('error', reject)
  })
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      const child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
      child.unref()
    } else {
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open'
      const child = spawn(cmd, [url], { detached: true, stdio: 'ignore' })
      child.unref()
    }
  } catch {}
}

export async function startServer(options = {}) {
  if (serverInstance) return serverInstance
  DATA_ROOT = path.resolve(options.dataRoot || process.env.ZHIZHANG_DATA || path.join(ROOT, 'data'))
  await ensureBase()
  const app = createApp()
  const desired = Number(options.port || DEFAULT_PORT)
  let server = null
  for (let p = desired; p < desired + 20; p += 1) {
    try {
      server = await tryListen(app, p)
      actualPort = p
      break
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err
    }
  }
  if (!server) throw new Error('没有可用端口')
  const heartbeat = setInterval(() => {
    for (const clients of sseClients.values()) {
      for (const res of clients.keys()) {
        try {
          res.write(': ping\n\n')
        } catch {}
      }
    }
  }, 25000)
  heartbeat.unref()
  serverInstance = {
    server,
    port: actualPort,
    dataRoot: DATA_ROOT,
    urls: lanUrls(actualPort),
    close: () =>
      new Promise((resolve) => {
        clearInterval(heartbeat)
        for (const clients of sseClients.values()) {
          for (const res of clients.keys()) {
            try {
              res.end()
            } catch {}
          }
        }
        sseClients.clear()
        let settled = false
        const done = () => {
          if (settled) return
          settled = true
          resolve()
        }
        server.close(done)
        server.closeAllConnections?.()
        setTimeout(done, 1200).unref()
      }),
  }
  if (options.open) openBrowser(`http://127.0.0.1:${actualPort}`)
  return serverInstance
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename
if (isMain) {
  startServer({ open: process.env.ZHIZHANG_NO_OPEN !== '1' })
    .then(({ port, urls, dataRoot }) => {
      console.log('')
      console.log('  织章 · 小说创作工作台已启动')
      console.log(`  本机访问: http://127.0.0.1:${port}`)
      if (urls.length) {
        console.log('  局域网访问（手机/平板）:')
        for (const u of urls) console.log(`    ${u}`)
      }
      console.log(`  数据目录: ${dataRoot}`)
      console.log('  按 Ctrl+C 停止服务')
      console.log('')
    })
    .catch((err) => {
      console.error('启动失败:', err)
      process.exit(1)
    })
}
