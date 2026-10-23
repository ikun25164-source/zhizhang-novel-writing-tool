import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

const DEFAULT_WEBDAV = {
  url: '',
  username: '',
  password: '',
  remotePath: 'zhizhang',
}
const SKIP_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])
const TOLERANCE = 2000
const running = new Map()

const iso = () => new Date().toISOString()

function bad(status, message) {
  const err = new Error(message)
  err.status = status
  return err
}

const syncFile = (root) => path.join(root, 'sync.json')

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'))
  } catch (err) {
    if (err.code === 'ENOENT') return fallback
    return fallback
  }
}

async function writeJsonAtomic(file, value) {
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

function normalizeRemotePath(input) {
  const raw = String(input ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const parts = raw.split('/').filter(Boolean)
  if (parts.some((part) => part === '.' || part === '..')) throw bad(400, '远程目录无效')
  return parts.join('/') || 'zhizhang'
}

export async function readSyncConfig(root) {
  const raw = await readJson(syncFile(root), {})
  return {
    method: raw.method === 'webdav' ? 'webdav' : 'local',
    webdav: { ...DEFAULT_WEBDAV, ...(raw.webdav || {}) },
    lastSyncAt: raw.lastSyncAt || null,
    lastResult: raw.lastResult || null,
    deletedProjects:
      raw.deletedProjects && typeof raw.deletedProjects === 'object' ? raw.deletedProjects : {},
  }
}

export function publicSyncConfig(cfg) {
  return {
    method: cfg.method,
    webdav: {
      url: cfg.webdav.url,
      username: cfg.webdav.username,
      remotePath: cfg.webdav.remotePath,
      hasPassword: Boolean(cfg.webdav.password),
    },
    configured: cfg.method === 'webdav' && Boolean(cfg.webdav.url),
    lastSyncAt: cfg.lastSyncAt,
    lastResult: cfg.lastResult,
  }
}

export async function saveSyncConfig(root, input = {}) {
  const current = await readSyncConfig(root)
  const method = input.method === 'webdav' ? 'webdav' : 'local'
  const patch = input.webdav || {}
  const url = String(patch.url ?? current.webdav.url).trim()
  if (url) {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      throw bad(400, 'WebDAV 地址格式无效')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw bad(400, 'WebDAV 地址需以 http:// 或 https:// 开头')
    }
  }
  const next = {
    ...current,
    method,
    webdav: {
      url,
      username: String(patch.username ?? current.webdav.username).trim(),
      password:
        typeof patch.password === 'string' && patch.password.length
          ? patch.password
          : current.webdav.password,
      remotePath: normalizeRemotePath(patch.remotePath ?? current.webdav.remotePath),
    },
  }
  await writeJsonAtomic(syncFile(root), next)
  return next
}

export async function recordDeletedProject(root, pid) {
  if (!pid) return
  const cfg = await readSyncConfig(root)
  cfg.deletedProjects[pid] = iso()
  const entries = Object.entries(cfg.deletedProjects).sort((a, b) =>
    String(b[1]).localeCompare(String(a[1])),
  )
  cfg.deletedProjects = Object.fromEntries(entries.slice(0, 200))
  await writeJsonAtomic(syncFile(root), cfg)
}

function davBase(cfg) {
  const raw = String(cfg.webdav.url || '').trim()
  if (!raw) throw bad(400, '请先填写 WebDAV 地址')
  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw bad(400, 'WebDAV 地址格式无效')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw bad(400, 'WebDAV 地址需以 http:// 或 https:// 开头')
  }
  parsed.hash = ''
  parsed.search = ''
  return parsed.toString().replace(/\/+$/, '')
}

function remoteSegments(cfg) {
  return String(cfg.webdav.remotePath || '')
    .split('/')
    .filter(Boolean)
}

function davUrl(cfg, rel = '') {
  const segments = [
    ...remoteSegments(cfg).map(encodeURIComponent),
    ...String(rel).split('/').filter(Boolean).map(encodeURIComponent),
  ]
  return `${davBase(cfg)}/${segments.join('/')}`
}

function davHeaders(cfg, extra = {}) {
  const headers = { ...extra }
  if (cfg.webdav.username || cfg.webdav.password) {
    headers.Authorization = `Basic ${Buffer.from(`${cfg.webdav.username}:${cfg.webdav.password}`).toString('base64')}`
  }
  return headers
}

async function davFetch(cfg, url, init = {}) {
  try {
    return await fetch(url, {
      ...init,
      headers: davHeaders(cfg, init.headers),
      signal: AbortSignal.timeout(60000),
    })
  } catch (err) {
    const code = err?.cause?.code || err?.code || ''
    const detail =
      err?.name === 'TimeoutError'
        ? '连接超时，请检查地址或网络'
        : code === 'ENOTFOUND' || code === 'EAI_AGAIN'
          ? '找不到服务器，请检查地址是否填写正确'
          : code === 'ECONNREFUSED'
            ? '服务器拒绝连接，请确认 WebDAV 服务已开启'
            : code === 'ECONNRESET' || code === 'EPIPE'
              ? '连接被中断，请稍后重试'
              : code === 'CERT_HAS_EXPIRED' || code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
                ? 'HTTPS 证书校验失败，请更换有效证书或使用 http 地址'
                : err?.message || '网络错误'
    throw bad(502, `无法连接 WebDAV：${detail}`)
  }
}

function davError(res, action) {
  if (res.status === 401 || res.status === 403) {
    return bad(401, 'WebDAV 认证失败，请检查用户名和密码')
  }
  return bad(502, `${action}失败（HTTP ${res.status}）`)
}

async function mkcol(cfg, segments, ctx) {
  let current = ''
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment
    if (ctx?.dirs.has(current)) continue
    const url = `${davBase(cfg)}/${current.split('/').map(encodeURIComponent).join('/')}`
    const res = await davFetch(cfg, url, { method: 'MKCOL' })
    if (![200, 201, 204, 405].includes(res.status)) throw davError(res, '创建远程目录')
    ctx?.dirs.add(current)
  }
}

async function ensureDir(cfg, relDir, ctx) {
  const segments = String(relDir).split('/').filter(Boolean)
  await mkcol(cfg, [...remoteSegments(cfg), ...segments], ctx)
}

function decodeHrefPath(href, base) {
  try {
    return decodeURIComponent(new URL(href, base).pathname).replace(/\/+$/, '')
  } catch {
    return ''
  }
}

async function davList(cfg, relDir, ctx) {
  await ensureDir(cfg, '', ctx)
  const url = `${davUrl(cfg, relDir)}/`
  const body =
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<d:propfind xmlns:d="DAV:"><d:prop>' +
    '<d:resourcetype/><d:getlastmodified/><d:getcontentlength/>' +
    '</d:prop></d:propfind>'
  const res = await davFetch(cfg, url, {
    method: 'PROPFIND',
    headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    body,
  })
  if (res.status === 404) return []
  if (!res.ok) throw davError(res, '读取远程目录')
  const xml = await res.text()
  const requested = decodeHrefPath(url, url)
  const entries = []
  const blocks = xml.match(/<(?:[\w-]+:)?response\b[\s\S]*?<\/(?:[\w-]+:)?response>/g) || []
  for (const block of blocks) {
    const href = block.match(/<(?:[\w-]+:)?href>([^<]+)</)?.[1]
    if (!href) continue
    const hrefPath = decodeHrefPath(href, url)
    if (!hrefPath || hrefPath === requested) continue
    const parent = hrefPath.slice(0, hrefPath.lastIndexOf('/'))
    if (parent !== requested) continue
    const name = hrefPath.slice(hrefPath.lastIndexOf('/') + 1)
    if (!name || name === '.' || name === '..' || name.includes('\\') || name.includes('\0')) continue
    if (SKIP_NAMES.has(name)) continue
    const isDir = /<(?:[\w-]+:)?collection\b/.test(block)
    const lastmod = block.match(/<(?:[\w-]+:)?getlastmodified>([^<]+)</)?.[1] || ''
    const size = Number(block.match(/<(?:[\w-]+:)?getcontentlength>([^<]+)</)?.[1]) || 0
    entries.push({ name, isDir, lastmod, size })
  }
  return entries
}

async function davGet(cfg, rel) {
  const res = await davFetch(cfg, davUrl(cfg, rel), { method: 'GET' })
  if (res.status === 404) return null
  if (!res.ok) throw davError(res, '下载远程文件')
  return {
    buffer: Buffer.from(await res.arrayBuffer()),
    lastmod: res.headers.get('last-modified') || '',
  }
}

function mimeOf(name) {
  const ext = path.extname(name).toLowerCase()
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.svg') return 'image/svg+xml'
  return 'application/octet-stream'
}

async function davPut(cfg, rel, buffer, ctx) {
  const parent = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/')) : ''
  if (parent) await ensureDir(cfg, parent, ctx)
  const upload = () =>
    davFetch(cfg, davUrl(cfg, rel), {
      method: 'PUT',
      headers: { 'Content-Type': mimeOf(rel) },
      body: buffer,
    })
  let res = await upload()
  if (res.status === 409) {
    if (parent) await ensureDir(cfg, parent, ctx)
    res = await upload()
  }
  if (![200, 201, 204].includes(res.status)) throw davError(res, '上传文件')
}

async function walkLocal(dir, rel, out, top = true) {
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch (err) {
    if (err.code === 'ENOENT') return
    throw err
  }
  for (const entry of entries) {
    if (SKIP_NAMES.has(entry.name) || entry.name.endsWith('.tmp') || entry.name.includes('.broken-')) {
      continue
    }
    if (top && entry.name === 'backups') continue
    const abs = path.join(dir, entry.name)
    const nextRel = rel ? `${rel}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      await walkLocal(abs, nextRel, out, false)
    } else if (entry.isFile()) {
      const stat = await fsp.stat(abs)
      out.set(nextRel, { mtime: stat.mtimeMs, size: stat.size })
    }
  }
}

async function walkRemote(cfg, absDir, relPrefix, out, ctx, top = true) {
  const entries = await davList(cfg, absDir, ctx)
  for (const entry of entries) {
    if (top && entry.name === 'backups') continue
    if (entry.name.endsWith('.tmp')) continue
    const nextAbs = `${absDir}/${entry.name}`
    const nextRel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
    if (entry.isDir) {
      await walkRemote(cfg, nextAbs, nextRel, out, ctx, false)
    } else {
      out.set(nextRel, {
        mtime: Date.parse(entry.lastmod) || 0,
        size: entry.size,
      })
    }
  }
}

async function writeBufferAtomic(file, buffer) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(tmp, buffer)
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

function mergeIndex(localProjects, remoteProjects, tombstones) {
  const map = new Map()
  for (const entry of [...localProjects, ...remoteProjects]) {
    if (!entry?.id) continue
    const previous = map.get(entry.id)
    if (!previous || String(entry.updatedAt || '').localeCompare(String(previous.updatedAt || '')) > 0) {
      map.set(entry.id, entry)
    }
  }
  for (const [pid, deletedAt] of Object.entries(tombstones || {})) {
    const entry = map.get(pid)
    if (!entry) continue
    if (Date.parse(deletedAt) >= Date.parse(entry.updatedAt || 0)) map.delete(pid)
  }
  return [...map.values()].sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
  )
}

function mergeTestConfig(current, draft = {}) {
  const patch = draft.webdav || {}
  return {
    ...current,
    webdav: {
      ...current.webdav,
      ...patch,
      url: String(patch.url ?? current.webdav.url).trim(),
      username: String(patch.username ?? current.webdav.username),
      password:
        typeof patch.password === 'string' && patch.password.length
          ? patch.password
          : current.webdav.password,
      remotePath: normalizeRemotePath(patch.remotePath ?? current.webdav.remotePath),
    },
  }
}

export async function testWebdav(root, draft) {
  const current = await readSyncConfig(root)
  const cfg = mergeTestConfig(current, draft)
  davBase(cfg)
  const ctx = { dirs: new Set() }
  await ensureDir(cfg, '', ctx)
  const res = await davFetch(cfg, `${davUrl(cfg, '')}/`, {
    method: 'PROPFIND',
    headers: { Depth: '0', 'Content-Type': 'application/xml; charset=utf-8' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
  })
  if (res.status === 404) throw bad(502, '远程目录不可用，请检查地址与目录权限')
  if (!res.ok) throw davError(res, '连接 WebDAV')
  return { ok: true, message: '连接成功，可以开始同步' }
}

async function syncProject(cfg, root, pid, ctx, result, stamp) {
  const localDir = path.join(root, 'projects', pid)
  const local = new Map()
  if (fs.existsSync(localDir)) await walkLocal(localDir, '', local)
  const remote = new Map()
  await walkRemote(cfg, `projects/${pid}`, '', remote, ctx)

  const names = new Set([...local.keys(), ...remote.keys()])
  for (const name of names) {
    const localInfo = local.get(name)
    const remoteInfo = remote.get(name)
    const abs = path.join(localDir, ...name.split('/'))

    if (localInfo && !remoteInfo) {
      await davPut(cfg, `projects/${pid}/${name}`, await fsp.readFile(abs), ctx)
      await fsp.utimes(abs, new Date(), new Date())
      result.uploaded += 1
      continue
    }

    if (!localInfo && remoteInfo) {
      const got = await davGet(cfg, `projects/${pid}/${name}`)
      if (!got) continue
      await writeBufferAtomic(abs, got.buffer)
      const when = got.lastmod ? new Date(got.lastmod) : new Date()
      if (!Number.isNaN(when.getTime())) await fsp.utimes(abs, when, when)
      result.downloaded += 1
      continue
    }

    if (!localInfo || !remoteInfo) continue

    const localTime = localInfo.mtime
    const remoteTime = remoteInfo.mtime
    const remoteNewer = remoteTime
      ? remoteTime > localTime + TOLERANCE
      : localInfo.size !== remoteInfo.size
    const localNewer = remoteTime ? localTime > remoteTime + TOLERANCE : false

    if (remoteNewer) {
      const got = await davGet(cfg, `projects/${pid}/${name}`)
      if (!got) continue
      const existing = await fsp.readFile(abs).catch(() => null)
      if (existing && existing.equals(got.buffer)) {
        const when = got.lastmod ? new Date(got.lastmod) : new Date()
        if (!Number.isNaN(when.getTime())) await fsp.utimes(abs, when, when)
        result.skipped += 1
        continue
      }
      if (existing) {
        const backup = path.join(
          root,
          'sync-conflicts',
          stamp,
          'projects',
          pid,
          ...name.split('/'),
        )
        await fsp.mkdir(path.dirname(backup), { recursive: true })
        await fsp.writeFile(backup, existing)
        result.conflicts += 1
      }
      await writeBufferAtomic(abs, got.buffer)
      const when = got.lastmod ? new Date(got.lastmod) : new Date()
      if (!Number.isNaN(when.getTime())) await fsp.utimes(abs, when, when)
      result.downloaded += 1
      continue
    }

    if (localNewer) {
      await davPut(cfg, `projects/${pid}/${name}`, await fsp.readFile(abs), ctx)
      await fsp.utimes(abs, new Date(), new Date())
      result.uploaded += 1
      continue
    }

    result.skipped += 1
  }
  result.projects += 1
}

async function doRun(root) {
  const cfg = await readSyncConfig(root)
  if (cfg.method !== 'webdav') throw bad(400, '当前同步方式为「仅本机」，请先切换为 WebDAV')
  if (!cfg.webdav.url) throw bad(400, '请先填写 WebDAV 地址')

  const stamp = iso().replace(/[:.]/g, '-')
  const result = {
    at: iso(),
    uploaded: 0,
    downloaded: 0,
    skipped: 0,
    conflicts: 0,
    projects: 0,
  }
  const ctx = { dirs: new Set() }

  try {
    await ensureDir(cfg, '', ctx)

    const localIndex = await readJson(path.join(root, 'projects.json'), { projects: [] })
    const remoteRaw = await davGet(cfg, 'projects.json')
    let remoteIndex = { projects: [] }
    if (remoteRaw) {
      try {
        remoteIndex = JSON.parse(remoteRaw.buffer.toString('utf8'))
      } catch {
        remoteIndex = { projects: [] }
      }
    }

    const merged = mergeIndex(
      Array.isArray(localIndex.projects) ? localIndex.projects : [],
      Array.isArray(remoteIndex.projects) ? remoteIndex.projects : [],
      cfg.deletedProjects,
    )
    await writeJsonAtomic(path.join(root, 'projects.json'), { projects: merged })
    await davPut(cfg, 'projects.json', Buffer.from(JSON.stringify({ projects: merged }, null, 2)), ctx)

    for (const entry of merged) {
      if (!/^[a-zA-Z0-9_-]{4,64}$/.test(String(entry.id || ''))) continue
      await syncProject(cfg, root, entry.id, ctx, result, stamp)
    }

    const latest = await readSyncConfig(root)
    latest.lastSyncAt = result.at
    latest.lastResult = result
    await writeJsonAtomic(syncFile(root), latest)
    return result
  } catch (err) {
    const latest = await readSyncConfig(root)
    latest.lastResult = {
      at: iso(),
      ...result,
      error: err instanceof Error ? err.message : '同步失败',
    }
    await writeJsonAtomic(syncFile(root), latest)
    throw err
  }
}

export function runSync(root) {
  const key = path.resolve(root)
  if (running.has(key)) return running.get(key)
  const task = doRun(key).finally(() => running.delete(key))
  running.set(key, task)
  return task
}
