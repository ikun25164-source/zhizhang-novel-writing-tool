import type {
  ChapterContent,
  ChapterMeta,
  Collection,
  CollectionName,
  Collections,
  MapDoc,
  Place,
  ProjectMeta,
  ProjectPayload,
  ProjectSummary,
  StoryEvent,
  Timeline,
  Volume,
} from '../types'
import type { JSONContent } from '@tiptap/react'
import { ApiError } from './errors'
import { isNativeApp, uid } from './utils'
import { EMPTY_DOC } from './tiptap'

const DB_NAME = 'zhizhang-local'
const DB_VERSION = 1
const FORCE_KEY = 'zhizhang.forceLocal'

export const COLLECTION_NAMES: CollectionName[] = [
  'volumes',
  'chapters',
  'outlines',
  'timelines',
  'events',
  'characters',
  'maps',
  'places',
]

type StoredMeta = ProjectMeta & { wordCount: number }

interface StoredCollection {
  key: string
  pid: string
  name: CollectionName
  rev: number
  updatedAt: string | null
  items: unknown[]
}

interface StoredChapter extends ChapterContent {
  key: string
  pid: string
  cid: string
  content: JSONContent
  updatedAt: string | null
}

let dbPromise: Promise<IDBDatabase> | null = null

export function isLocalMode(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (localStorage.getItem(FORCE_KEY) === '1') return true
  } catch {}
  return isNativeApp()
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('collections')) db.createObjectStore('collections', { keyPath: 'key' })
      if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('本地数据库打开失败'))
  })
  return dbPromise
}

async function read<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

async function readAll<T>(store: string): Promise<T[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll()
    request.onsuccess = () => resolve(request.result as T[])
    request.onerror = () => reject(request.error)
  })
}

async function write(store: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).put(value)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

async function remove(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readwrite').objectStore(store).delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

const now = () => new Date().toISOString()
const colKey = (pid: string, name: CollectionName) => `${pid}/${name}`
const chapKey = (pid: string, cid: string) => `${pid}/${cid}`

async function getMeta(pid: string): Promise<StoredMeta> {
  const meta = await read<StoredMeta>('projects', pid)
  if (!meta) throw new ApiError('项目不存在', 404)
  return meta
}

async function touchProject(pid: string, patch: Partial<StoredMeta> = {}): Promise<void> {
  const meta = await getMeta(pid)
  await write('projects', { ...meta, ...patch, updatedAt: now() })
}

async function readCollection<T>(pid: string, name: CollectionName): Promise<Collection<T>> {
  if (!COLLECTION_NAMES.includes(name)) throw new ApiError('未知数据集合', 400)
  const data = await read<StoredCollection>('collections', colKey(pid, name))
  if (!data) return { rev: 0, updatedAt: null, items: [] }
  return {
    rev: Number(data.rev) || 0,
    updatedAt: data.updatedAt || null,
    items: Array.isArray(data.items) ? (data.items as T[]) : [],
  }
}

async function writeCollection(pid: string, name: CollectionName, data: Collection<unknown>): Promise<void> {
  if (!COLLECTION_NAMES.includes(name)) throw new ApiError('未知数据集合', 400)
  const record: StoredCollection = {
    key: colKey(pid, name),
    pid,
    name,
    rev: data.rev,
    updatedAt: data.updatedAt,
    items: data.items,
  }
  await write('collections', record)
}

async function readChapter(pid: string, cid: string): Promise<StoredChapter | null> {
  return (await read<StoredChapter>('chapters', chapKey(pid, cid))) || null
}

function toChapterContent(record: StoredChapter): ChapterContent {
  return {
    id: record.id,
    content: record.content || EMPTY_DOC,
    plainText: record.plainText || '',
    wordCount: Number(record.wordCount) || 0,
    rev: Number(record.rev) || 0,
    updatedAt: record.updatedAt || null,
  }
}

export async function localProjects(): Promise<ProjectSummary[]> {
  const metas = await readAll<StoredMeta>('projects')
  return metas
    .map((meta) => ({
      id: meta.id,
      title: meta.title,
      author: meta.author,
      description: meta.description,
      wordCount: Number(meta.wordCount) || 0,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
}

export async function localCreateProject(input: {
  title?: string
  author?: string
  description?: string
}): Promise<{ id: string; chapterId: string }> {
  const id = uid().slice(0, 16)
  const ts = now()
  const volId = uid()
  const chId = uid()
  const masterId = uid()
  const volOutId = uid()
  const chOutId = uid()
  const meta: StoredMeta = {
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
    wordCount: 0,
  }

  await write('projects', meta)
  await writeCollection(id, 'volumes', {
    rev: 0,
    updatedAt: ts,
    items: [{ id: volId, title: '第一卷', order: 0, description: '' } as Volume],
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
      } as ChapterMeta,
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
      } as Timeline,
    ],
  })
  for (const name of ['events', 'characters', 'maps', 'places'] as CollectionName[]) {
    await writeCollection(id, name, { rev: 0, updatedAt: ts, items: [] })
  }
  await write('chapters', {
    key: chapKey(id, chId),
    pid: id,
    cid: chId,
    id: chId,
    content: EMPTY_DOC,
    plainText: '',
    wordCount: 0,
    rev: 0,
    updatedAt: ts,
  } satisfies StoredChapter)
  return { id, chapterId: chId }
}

export async function localDeleteProject(pid: string): Promise<void> {
  await getMeta(pid)
  for (const name of COLLECTION_NAMES) await remove('collections', colKey(pid, name))
  const chapters = await readAll<StoredChapter>('chapters')
  for (const chapter of chapters) {
    if (chapter.pid === pid) await remove('chapters', chapter.key)
  }
  await remove('projects', pid)
}

export async function localProject(pid: string): Promise<ProjectPayload> {
  const meta = await getMeta(pid)
  const collections = {} as Collections
  for (const name of COLLECTION_NAMES) {
    collections[name] = (await readCollection(pid, name)) as never
  }
  return { meta, collections, port: 0 }
}

export async function localUpdateMeta(
  pid: string,
  patch: Partial<ProjectMeta> | undefined,
  baseRev: number | null,
): Promise<ProjectMeta> {
  const current = await getMeta(pid)
  if (baseRev != null && Number(baseRev) !== Number(current.rev)) {
    throw new ApiError('conflict', 409, current)
  }
  const next: StoredMeta = {
    ...current,
    title: patch?.title ?? current.title,
    author: patch?.author ?? current.author,
    description: patch?.description ?? current.description,
    calendar: patch?.calendar ?? current.calendar,
    settings: patch?.settings ?? current.settings,
    updatedAt: now(),
    rev: Number(current.rev) + 1,
  }
  await write('projects', next)
  return next
}

export async function localCollection<T>(pid: string, name: CollectionName): Promise<Collection<T>> {
  return readCollection<T>(pid, name)
}

export async function localSaveCollection<T>(
  pid: string,
  name: CollectionName,
  items: T[],
  baseRev: number,
): Promise<{ rev: number; updatedAt: string }> {
  const current = await readCollection(pid, name)
  if (Number(baseRev) !== current.rev) {
    throw new ApiError('conflict', 409, { error: 'conflict', current })
  }
  const next = { rev: current.rev + 1, updatedAt: now(), items }
  await writeCollection(pid, name, next)
  await touchProject(pid)
  return { rev: next.rev, updatedAt: next.updatedAt }
}

export async function localChapter(pid: string, cid: string): Promise<ChapterContent> {
  const record = await readChapter(pid, cid)
  return record
    ? toChapterContent(record)
    : { id: cid, content: EMPTY_DOC, plainText: '', wordCount: 0, rev: 0, updatedAt: null }
}

export async function localAllChapters(pid: string): Promise<{ items: Record<string, ChapterContent> }> {
  const records = await readAll<StoredChapter>('chapters')
  const items: Record<string, ChapterContent> = {}
  for (const record of records) {
    if (record.pid === pid) items[record.cid] = toChapterContent(record)
  }
  return { items }
}

export async function localSaveChapter(
  pid: string,
  cid: string,
  payload: {
    content?: JSONContent
    plainText?: string
    wordCount?: number
    baseRev?: number
    force?: boolean
  },
): Promise<{ ok: boolean; rev: number; chaptersRev: number; updatedAt: string }> {
  const current = await readChapter(pid, cid)
  const currentRev = current ? Number(current.rev) || 0 : 0
  if (!payload.force && payload.baseRev != null && Number(payload.baseRev) !== currentRev) {
    throw new ApiError('conflict', 409, {
      error: 'conflict',
      current: current
        ? toChapterContent(current)
        : { id: cid, content: EMPTY_DOC, plainText: '', wordCount: 0, rev: 0, updatedAt: null },
    })
  }
  const next: StoredChapter = {
    key: chapKey(pid, cid),
    pid,
    cid,
    id: cid,
    content: payload.content || EMPTY_DOC,
    plainText: typeof payload.plainText === 'string' ? payload.plainText : '',
    wordCount: Number(payload.wordCount) || 0,
    rev: currentRev + 1,
    updatedAt: now(),
  }
  await write('chapters', next)

  const chapters = await readCollection<ChapterMeta>(pid, 'chapters')
  const index = chapters.items.findIndex((chapter) => chapter.id === cid)
  if (index >= 0) {
    chapters.items[index] = {
      ...chapters.items[index],
      wordCount: next.wordCount,
      updatedAt: next.updatedAt as string,
      rev: next.rev,
    }
    chapters.rev += 1
    chapters.updatedAt = next.updatedAt
    await writeCollection(pid, 'chapters', chapters)
  }
  const total = chapters.items.reduce((sum, chapter) => sum + (Number(chapter.wordCount) || 0), 0)
  await touchProject(pid, { wordCount: total })
  return { ok: true, rev: next.rev, chaptersRev: chapters.rev, updatedAt: next.updatedAt as string }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

export interface LocalSnapshot {
  kind: 'zhizhang.project'
  version: 1
  id: string
  updatedAt: string
  meta: StoredMeta
  collections: Collections
  chapters: Record<string, ChapterContent>
}

export async function localSnapshot(pid: string): Promise<LocalSnapshot> {
  const meta = await getMeta(pid)
  const collections = {} as Collections
  for (const name of COLLECTION_NAMES) {
    collections[name] = (await readCollection(pid, name)) as never
  }
  const records = await readAll<StoredChapter>('chapters')
  const chapters: Record<string, ChapterContent> = {}
  for (const record of records) {
    if (record.pid === pid) chapters[record.cid] = toChapterContent(record)
  }
  return { kind: 'zhizhang.project', version: 1, id: pid, updatedAt: meta.updatedAt, meta, collections, chapters }
}

export async function localApplySnapshot(snapshot: LocalSnapshot): Promise<void> {
  if (!snapshot || snapshot.kind !== 'zhizhang.project' || !snapshot.id) throw new ApiError('同步文件格式不正确', 400)
  const meta = snapshot.meta
  await write('projects', {
    ...meta,
    id: snapshot.id,
    rev: Number(meta.rev) || 0,
    wordCount: Number(meta.wordCount) || 0,
    settings: meta.settings,
    calendar: meta.calendar,
    updatedAt: meta.updatedAt || now(),
  } satisfies StoredMeta)

  for (const name of COLLECTION_NAMES) {
    const data = snapshot.collections?.[name] as Collection<unknown> | undefined
    if (!data) continue
    await writeCollection(snapshot.id, name, {
      rev: Number(data.rev) || 0,
      updatedAt: data.updatedAt ?? null,
      items: Array.isArray(data.items) ? data.items : [],
    })
  }

  const local = await readAll<StoredChapter>('chapters')
  const byCid = new Map(local.filter((record) => record.pid === snapshot.id).map((record) => [record.cid, record]))
  for (const [cid, content] of Object.entries(snapshot.chapters || {})) {
    const current = byCid.get(cid)
    const remoteMs = Date.parse(content?.updatedAt || '') || 0
    const localMs = current ? Date.parse(current.updatedAt || '') || 0 : -1
    if (current && localMs > remoteMs) continue
    await write('chapters', {
      key: chapKey(snapshot.id, cid),
      pid: snapshot.id,
      cid,
      id: cid,
      content: content?.content || EMPTY_DOC,
      plainText: content?.plainText || '',
      wordCount: Number(content?.wordCount) || 0,
      rev: Number(content?.rev) || 0,
      updatedAt: content?.updatedAt || null,
    } satisfies StoredChapter)
  }
}

export async function localUpload(pid: string, blob: Blob): Promise<{ path: string; size: number }> {
  await getMeta(pid)
  const path = await blobToDataUrl(blob)
  return { path, size: blob.size }
}

function buildExport(
  meta: ProjectMeta,
  volumes: Collection<Volume>,
  chapters: Collection<ChapterMeta>,
  contents: Record<string, ChapterContent | undefined>,
  collections: Collections,
  format: 'txt' | 'md' | 'json',
): string {
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

  const volumeMap = new Map(volumes.items.map((volume) => [volume.id, volume]))
  const sortedChapters = [...chapters.items].sort((a, b) => {
    const va = volumeMap.get(a.volumeId)?.order ?? 0
    const vb = volumeMap.get(b.volumeId)?.order ?? 0
    return va - vb || (a.order || 0) - (b.order || 0)
  })
  const sortedVolumes = [...volumes.items].sort((a, b) => (a.order || 0) - (b.order || 0))
  const md = format === 'md'
  const lines: string[] = []
  lines.push(md ? `# ${meta.title}` : meta.title)
  if (meta.author) lines.push(md ? `*${meta.author}*` : `作者：${meta.author}`)
  if (meta.description) lines.push('', meta.description)
  lines.push('')

  for (const volume of sortedVolumes) {
    if (md) lines.push(`## ${volume.title}`)
    else lines.push('', volume.title, '')
    for (const chapter of sortedChapters.filter((item) => item.volumeId === volume.id)) {
      if (md) lines.push(`### ${chapter.title}`)
      else lines.push('', chapter.title, '')
      lines.push((contents[chapter.id]?.plainText || '').trim())
      lines.push('')
    }
  }

  const orphans = sortedChapters.filter((chapter) => !volumeMap.has(chapter.volumeId))
  if (orphans.length) {
    lines.push(md ? '## 未分卷章节' : '', '')
    for (const chapter of orphans) {
      if (md) lines.push(`### ${chapter.title}`)
      else lines.push('', chapter.title, '')
      lines.push((contents[chapter.id]?.plainText || '').trim(), '')
    }
  }

  if (md) lines.push('---', '', '## 设定附录', '')
  else lines.push('', '===== 设定附录 =====', '')

  const characters = collections.characters.items
  if (characters.length) {
    lines.push(md ? '### 人物' : '【人物】', '')
    for (const character of characters) {
      lines.push(md ? `- **${character.name}** — ${character.role || ''}` : `${character.name}（${character.role || ''}）`)
      const desc = character.background || character.personality || ''
      if (desc) lines.push(desc)
      lines.push('')
    }
  }
  const events = collections.events.items as StoryEvent[]
  if (events.length) {
    lines.push(md ? '### 事件' : '【事件】', '')
    for (const event of events) {
      lines.push(md ? `- **${event.title}** — ${event.time?.label || ''}` : `${event.time?.label || ''} ${event.title}`)
      if (event.plainText) lines.push(event.plainText)
      lines.push('')
    }
  }
  const places = collections.places.items as Place[]
  if (places.length) {
    lines.push(md ? '### 地点' : '【地点】', '')
    for (const place of places) {
      lines.push(md ? `- **${place.name}** — ${place.category || ''}` : `${place.name}（${place.category || ''}）`)
      if (place.plainText) lines.push(place.plainText)
      lines.push('')
    }
  }
  return lines.join('\n')
}

export async function localExport(pid: string, format: 'txt' | 'md' | 'json'): Promise<Blob> {
  const payload = await localProject(pid)
  const contents: Record<string, ChapterContent | undefined> = {}
  for (const chapter of payload.collections.chapters.items) {
    contents[chapter.id] = { ...(await localChapter(pid, chapter.id)) }
  }
  const body = buildExport(
    payload.meta,
    payload.collections.volumes,
    payload.collections.chapters,
    contents,
    payload.collections,
    format,
  )
  return new Blob([body], {
    type: format === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8',
  })
}

export async function localRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = new URL(path, 'http://local')
  const parts = url.pathname.split('/').filter(Boolean)
  const method = (options.method || 'GET').toUpperCase()
  let body: any = undefined
  if (typeof options.body === 'string' && options.body) {
    try {
      body = JSON.parse(options.body)
    } catch {
      body = undefined
    }
  }

  if (parts[0] !== 'api') throw new ApiError('未知请求', 404)
  if (parts[1] === 'health' && method === 'GET') {
    return { ok: true, app: 'zhizhang', version: 1, port: 0 } as T
  }
  if (parts[1] === 'network' && method === 'GET') {
    return {
      port: 0,
      hostname: '本机',
      local: '',
      urls: [],
      dataRoot: '设备本地存储',
    } as T
  }
  if (parts[1] === 'sync') {
    throw new ApiError('同步接口需在应用层处理', 404)
  }
  if (parts[1] === 'projects') {
    const pid = parts[2]
    if (!pid) {
      if (method === 'GET') return (await localProjects()) as T
      if (method === 'POST') return (await localCreateProject(body || {})) as T
    } else if (!parts[3]) {
      if (method === 'GET') return (await localProject(pid)) as T
      if (method === 'DELETE') {
        await localDeleteProject(pid)
        return { ok: true } as T
      }
    } else if (parts[3] === 'meta' && method === 'PUT') {
      return (await localUpdateMeta(pid, body?.meta, body?.baseRev ?? null)) as T
    } else if (parts[3] === 'collections' && parts[4]) {
      const name = parts[4] as CollectionName
      if (method === 'GET') return (await localCollection(pid, name)) as T
      if (method === 'PUT') {
        if (!Array.isArray(body?.items)) throw new ApiError('items 必须是数组', 400)
        return (await localSaveCollection(pid, name, body.items, Number(body?.baseRev ?? 0))) as T
      }
    } else if (parts[3] === 'chapters') {
      if (!parts[4] && method === 'GET') return (await localAllChapters(pid)) as T
      if (parts[4]) {
        const cid = parts[4]
        if (method === 'GET') return (await localChapter(pid, cid)) as T
        if (method === 'PUT') return (await localSaveChapter(pid, cid, body || {})) as T
      }
    }
  }
  throw new ApiError('本地接口不存在', 404)
}
