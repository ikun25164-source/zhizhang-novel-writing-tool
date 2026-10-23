import type { SyncConfig, SyncResult } from '../types'
import { ApiError } from './errors'
import { localApplySnapshot, localProjects, localSnapshot, type LocalSnapshot } from './localBackend'
import { webdavEnsure, webdavGet, webdavList, webdavPut, type WebdavTarget } from './webdav'

const CONFIG_KEY = 'zhizhang.webdav'
const PROJECT_DIR = 'projects'
const CONFLICT_DIR = 'conflicts'

interface StoredConfig {
  url: string
  username: string
  password: string
  remotePath: string
  lastSyncAt: string | null
  lastResult: SyncResult | null
}

const blank: StoredConfig = {
  url: '',
  username: '',
  password: '',
  remotePath: 'zhizhang',
  lastSyncAt: null,
  lastResult: null,
}

function load(): StoredConfig {
  try {
    return { ...blank, ...(JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') as Partial<StoredConfig>) }
  } catch {
    return { ...blank }
  }
}

function save(cfg: StoredConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
  } catch {
    /* storage may be unavailable */
  }
}

export function localSyncConfig(): SyncConfig {
  const cfg = load()
  return {
    method: cfg.url ? 'webdav' : 'local',
    webdav: {
      url: cfg.url,
      username: cfg.username,
      remotePath: cfg.remotePath,
      hasPassword: Boolean(cfg.password),
    },
    configured: Boolean(cfg.url && cfg.username && cfg.password),
    lastSyncAt: cfg.lastSyncAt,
    lastResult: cfg.lastResult,
  }
}

export function localSaveSyncConfig(input: {
  method?: 'local' | 'webdav'
  webdav?: { url?: string; username?: string; password?: string; remotePath?: string }
}): SyncConfig {
  const cfg = load()
  const next: StoredConfig = {
    ...cfg,
    url: (input.webdav?.url ?? cfg.url).trim(),
    username: (input.webdav?.username ?? cfg.username).trim(),
    remotePath: (input.webdav?.remotePath ?? cfg.remotePath).trim() || 'zhizhang',
    password: input.webdav?.password ? input.webdav.password : cfg.password,
  }
  if (input.method === 'local') next.url = ''
  save(next)
  return localSyncConfig()
}

function target(): WebdavTarget {
  const cfg = load()
  if (!cfg.url || !cfg.username || !cfg.password) throw new ApiError('请先填写 WebDAV 地址、用户名和密码', 400)
  return { url: cfg.url, username: cfg.username, password: cfg.password, remotePath: cfg.remotePath }
}

export async function localTestSync(): Promise<{ ok: boolean; message: string }> {
  const cfg = load()
  if (!cfg.url || !cfg.username) throw new ApiError('请先填写 WebDAV 地址与用户名', 400)
  const webdav = target()
  try {
    await webdavEnsure(webdav, PROJECT_DIR)
    const entries = await webdavList(webdav, PROJECT_DIR)
    return { ok: true, message: `连接成功：${cfg.remotePath}/${PROJECT_DIR} 下已有 ${entries.length} 个作品文件` }
  } catch (err) {
    const message = err instanceof TypeError ? '无法连接：可能是网络不通，或该 WebDAV 服务不允许跨域访问' : err instanceof Error ? err.message : '连接失败'
    throw new ApiError(message, 400)
  }
}

export async function localRunSync(): Promise<SyncResult> {
  const webdav = target()
  const at = new Date().toISOString()
  const result: SyncResult = { at, uploaded: 0, downloaded: 0, skipped: 0, conflicts: 0, projects: 0 }
  try {
    await webdavEnsure(webdav, PROJECT_DIR)
    const remote = await webdavList(webdav, PROJECT_DIR)
    const remoteFiles = remote.filter((entry) => !entry.isDir && entry.name.endsWith('.json'))
    const remoteById = new Map(remoteFiles.map((entry) => [entry.name.replace(/\.json$/, ''), entry]))
    const locals = await localProjects()
    const localById = new Map(locals.map((item) => [item.id, item]))

    for (const project of locals) {
      const entry = remoteById.get(project.id)
      const localMs = Date.parse(project.updatedAt || '') || 0
      if (entry && (entry.mtime || 0) >= localMs) {
        result.skipped += 1
        continue
      }
      const snapshot = await localSnapshot(project.id)
      if (entry && localMs > (entry.mtime || 0) && (entry.mtime || 0) > 0) {
        const currentRemote = await webdavGet(webdav, `${PROJECT_DIR}/${project.id}.json`)
        if (currentRemote) {
          await webdavPut(webdav, `${CONFLICT_DIR}/${project.id}-${entry.mtime}.json`, currentRemote)
          result.conflicts += 1
        }
      }
      await webdavPut(webdav, `${PROJECT_DIR}/${project.id}.json`, JSON.stringify(snapshot))
      result.uploaded += 1
    }

    for (const entry of remoteFiles) {
      const id = entry.name.replace(/\.json$/, '')
      if (localById.has(id)) continue
      const rawText = await webdavGet(webdav, `${PROJECT_DIR}/${id}.json`)
      if (!rawText) continue
      let snapshot: LocalSnapshot
      try {
        snapshot = JSON.parse(rawText) as LocalSnapshot
      } catch {
        continue
      }
      await localApplySnapshot(snapshot)
      result.downloaded += 1
    }

    result.projects = (await localProjects()).length
    const cfg = load()
    save({ ...cfg, lastSyncAt: at, lastResult: result })
    return result
  } catch (err) {
    const message =
      err instanceof ApiError
        ? err.message
        : err instanceof TypeError
          ? '无法连接：可能是网络不通，或该 WebDAV 服务不允许跨域访问'
          : err instanceof Error && err.message
            ? err.message
            : '同步失败'
    const failed: SyncResult = { ...result, error: message }
    const cfg = load()
    save({ ...cfg, lastResult: failed })
    throw new ApiError(message, 400, failed)
  }
}
