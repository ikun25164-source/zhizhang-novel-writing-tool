import type {
  ChapterContent,
  ChapterMeta,
  Collection,
  CollectionName,
  NetworkInfo,
  ProjectMeta,
  ProjectPayload,
  ProjectSummary,
  SyncConfig,
  SyncInput,
  SyncResult,
  Volume,
} from '../types'
import { apiUrl, uid } from './utils'
import { ApiError } from './errors'
import { isLocalMode, localExport, localRequest, localUpload } from './localBackend'
import { localRunSync, localSaveSyncConfig, localSyncConfig, localTestSync } from './localSync'

export { ApiError }

const CLIENT_KEY = 'zhizhang.client'
let clientId = localStorage.getItem(CLIENT_KEY)
if (!clientId) {
  clientId = uid()
  localStorage.setItem(CLIENT_KEY, clientId)
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (isLocalMode()) return localRequest<T>(path, options)
  const headers = new Headers(options.headers || {})
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('X-Client-Id', clientId || '')
  const res = await fetch(apiUrl(path), { ...options, headers })
  if (!res.ok) {
    let data: unknown = null
    try {
      data = await res.json()
    } catch {}
    let message = `请求失败 (${res.status})`
    if (data && typeof data === 'object' && 'error' in data) {
      message = String((data as { error: unknown }).error)
    }
    throw new ApiError(message, res.status, data)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  clientId,
  health: () => request<{ ok: boolean; app: string; port: number }>('/api/health'),
  network: () => request<NetworkInfo>('/api/network'),
  projects: () => request<ProjectSummary[]>('/api/projects'),
  createProject: (input: { title: string; author?: string; description?: string }) =>
    request<{ id: string; chapterId: string }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  project: (id: string) => request<ProjectPayload>(`/api/projects/${id}`),
  updateMeta: (id: string, meta: Partial<ProjectMeta>, baseRev: number | null) =>
    request<ProjectMeta>(`/api/projects/${id}/meta`, {
      method: 'PUT',
      body: JSON.stringify({ meta, baseRev }),
    }),
  collection: <T>(pid: string, name: CollectionName) =>
    request<Collection<T>>(`/api/projects/${pid}/collections/${name}`),
  saveCollection: <T>(pid: string, name: CollectionName, items: T[], baseRev: number) =>
    request<{ rev: number; updatedAt: string }>(`/api/projects/${pid}/collections/${name}`, {
      method: 'PUT',
      body: JSON.stringify({ items, baseRev }),
    }),
  chapter: (pid: string, cid: string) =>
    request<ChapterContent>(`/api/projects/${pid}/chapters/${cid}`),
  allChapters: (pid: string) =>
    request<{ items: Record<string, ChapterContent> }>(`/api/projects/${pid}/chapters`),
  saveChapter: (
    pid: string,
    cid: string,
    payload: {
      content: ChapterContent['content']
      plainText: string
      wordCount: number
      baseRev: number
      force?: boolean
    },
  ) =>
    request<{ ok: boolean; rev: number; chaptersRev?: number; updatedAt: string }>(
      `/api/projects/${pid}/chapters/${cid}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      },
    ),
  upload: async (pid: string, blob: Blob, kind: string, ext: string) => {
    if (isLocalMode()) return localUpload(pid, blob)
    const res = await fetch(apiUrl(`/api/projects/${pid}/upload?kind=${kind}&ext=${ext}`), {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-Client-Id': clientId || '' },
      body: blob,
    })
    if (!res.ok) throw new ApiError('上传失败', res.status)
    return (await res.json()) as { path: string; size: number }
  },
  exportUrl: (pid: string, format: 'txt' | 'md' | 'json') =>
    apiUrl(`/api/projects/${pid}/export/${format}`),
  exportProject: async (pid: string, format: 'txt' | 'md' | 'json') => {
    if (isLocalMode()) return localExport(pid, format)
    const res = await fetch(apiUrl(`/api/projects/${pid}/export/${format}`))
    if (!res.ok) throw new ApiError('导出失败', res.status)
    return await res.blob()
  },
  syncConfig: async (): Promise<SyncConfig> => (isLocalMode() ? localSyncConfig() : request<SyncConfig>('/api/sync')),
  saveSyncConfig: async (input: SyncInput): Promise<SyncConfig> =>
    isLocalMode() ? localSaveSyncConfig(input) : request<SyncConfig>('/api/sync', { method: 'PUT', body: JSON.stringify(input) }),
  testSync: async (input: SyncInput): Promise<{ ok: boolean; message: string }> => {
    if (isLocalMode()) {
      localSaveSyncConfig(input)
      return localTestSync()
    }
    return request<{ ok: boolean; message: string }>('/api/sync/test', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  runSync: async (): Promise<SyncResult> => (isLocalMode() ? localRunSync() : request<SyncResult>('/api/sync/run', { method: 'POST' })),
  qrUrl: (text: string) => apiUrl(`/api/qr?text=${encodeURIComponent(text)}`),
  streamUrl: (pid: string) =>
    apiUrl(`/api/projects/${pid}/stream?clientId=${encodeURIComponent(clientId || '')}`),
}

export function volumeOf(chapters: ChapterMeta[], volumes: Volume[], volumeId: string | null) {
  if (!volumeId) return null
  return volumes.find((v) => v.id === volumeId) || null
}
