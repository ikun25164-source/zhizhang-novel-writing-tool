import { create } from 'zustand'
import type {
  ChapterContent,
  ChapterMeta,
  ChapterStatus,
  Character,
  CollectionName,
  ConflictState,
  EntityType,
  EventStatus,
  MapDoc,
  NetworkInfo,
  OutlineNode,
  PeekRef,
  Place,
  ProjectMeta,
  ProjectSummary,
  SaveState,
  StoryEvent,
  Timeline,
  UiStyle,
  ViewName,
  Volume,
} from './types'
import { api, ApiError } from './lib/api'
import { countWords, isNativeApp, nextOrder, timelinePalette, uid } from './lib/utils'
import { EMPTY_DOC } from './lib/tiptap'
import { defaultEventTime } from './lib/time'

const nowIso = () => new Date().toISOString()

const dirtyChapters = new Set<string>()
const dirtyCollections = new Set<CollectionName>()
const chapterTimers = new Map<string, ReturnType<typeof setTimeout>>()
const collectionTimers = new Map<CollectionName, ReturnType<typeof setTimeout>>()
let metaDirty = false
let metaVersion = 0
let metaTimer: ReturnType<typeof setTimeout> | null = null
let sse: EventSource | null = null
let noticeTimer: ReturnType<typeof setTimeout> | null = null
let currentProjectId: string | null = null

function readUiStyle(): UiStyle {
  try {
    const saved = localStorage.getItem('zhizhang.uiStyle')
    if (saved === 'glass' || saved === 'paper') return saved
  } catch {
    /* storage may be unavailable */
  }
  return 'glass'
}

function readPanelOpen(key: string): boolean {
  try {
    return localStorage.getItem(key) !== 'closed'
  } catch {
    return true
  }
}

let panelAnimTimer: ReturnType<typeof setTimeout> | null = null

function readDrawerWide(): boolean {
  try {
    return localStorage.getItem('zhizhang.drawer') === 'wide'
  } catch {
    return false
  }
}

/** 折叠动画期间关掉毛玻璃 backdrop-filter：Android WebView 逐帧重采样会留下文字残影 */
function flagPanelAnim() {
  const root = document.documentElement
  root.classList.add('panel-anim')
  if (panelAnimTimer) clearTimeout(panelAnimTimer)
  panelAnimTimer = setTimeout(() => root.classList.remove('panel-anim'), 340)
}

function readPanelWidth(side: 'left' | 'right'): number {  const limits = side === 'left' ? [190, 420, 264] : [230, 460, 306]
  try {
    const raw = JSON.parse(localStorage.getItem('zhizhang.panelWidths') || '{}') as Record<string, number>
    const value = Number(raw[side])
    if (!Number.isFinite(value)) return limits[2]
    return Math.min(limits[1], Math.max(limits[0], Math.round(value)))
  } catch {
    return limits[2]
  }
}

const bootUiStyle = readUiStyle()
document.documentElement.dataset.ui = bootUiStyle
document.documentElement.dataset.drawer = readDrawerWide() ? 'wide' : 'narrow'

const emptyRevs = (): Record<CollectionName, number> => ({
  volumes: 0,
  chapters: 0,
  outlines: 0,
  timelines: 0,
  events: 0,
  characters: 0,
  maps: 0,
  places: 0,
})

interface EventInput {
  timelineId?: string
  title?: string
  time?: StoryEvent['time']
  locationId?: string | null
  status?: EventStatus
}

interface PlaceInput {
  mapId: string
  name?: string
  x: number
  y: number
}

export interface AppState {
  ready: boolean
  native: boolean
  projects: ProjectSummary[]
  project: ProjectMeta | null
  volumes: Volume[]
  chapters: ChapterMeta[]
  outlines: OutlineNode[]
  timelines: Timeline[]
  events: StoryEvent[]
  characters: Character[]
  maps: MapDoc[]
  places: Place[]
  contents: Record<string, ChapterContent>
  revs: Record<CollectionName, number>
  activeChapterId: string | null
  view: ViewName
  saveState: SaveState
  conflict: ConflictState | null
  notice: string | null
  network: NetworkInfo | null
  loading: boolean
  error: string | null
  peek: PeekRef | null
  peekStack: PeekRef[]
  selectedOutlineId: string | null
  selectedEventId: string | null
  selectedCharacterId: string | null
  selectedMapId: string | null
  selectedPlaceId: string | null
  searchOpen: boolean
  settingsOpen: boolean
  uiStyle: UiStyle
  rightOpen: boolean
  leftOpen: boolean
  leftWidth: number
  rightWidth: number
  drawerWide: boolean
  mobileSheet: 'none' | 'left' | 'right'
  focusTerm: string | null
  editorEpochs: Record<string, number>

  init: () => Promise<void>
  loadProjects: () => Promise<void>
  createProject: (title: string, author: string, description?: string) => Promise<string | null>
  deleteProject: (id: string) => Promise<void>
  openProject: (id: string) => Promise<void>
  closeProject: () => Promise<void>
  refreshNetwork: () => Promise<void>

  setView: (view: ViewName) => void
  setActiveChapter: (id: string) => void
  openChapter: (id: string, term?: string | null, keepSheet?: boolean) => Promise<void>
  createChapter: (volumeId?: string) => Promise<void>
  renameChapter: (id: string, title: string) => void
  setChapterStatus: (id: string, status: ChapterStatus) => void
  deleteChapter: (id: string) => Promise<void>
  moveChapter: (id: string, direction: -1 | 1) => void
  updateChapterContent: (
    id: string,
    content: ChapterContent['content'],
    plainText: string,
    wordCount: number,
  ) => void
  flushChapter: (id: string, force?: boolean) => Promise<void>
  resolveConflict: (choice: 'server' | 'mine') => Promise<void>

  mutateCollection: (
    name: CollectionName,
    updater: (items: any[]) => any[],
    immediate?: boolean,
  ) => void
  saveCollectionNow: (name: CollectionName) => Promise<void>
  updateMeta: (patch: Partial<ProjectMeta>, immediate?: boolean) => void
  flushMeta: () => Promise<void>
  flushAll: () => Promise<void>

  addVolume: (title: string) => Promise<string>
  deleteVolume: (id: string) => void
  updateOutline: (id: string, patch: Partial<OutlineNode>) => void
  updateEvent: (id: string, patch: Partial<StoryEvent>) => void
  addEvent: (input?: EventInput) => string | null
  deleteEvent: (id: string) => void
  addBranch: (eventId: string, name: string, color: string) => void
  addTimeline: (name?: string) => string | null
  updateTimeline: (id: string, patch: Partial<Timeline>) => void
  deleteTimeline: (id: string) => void
  addCharacter: (name?: string) => string | null
  updateCharacter: (id: string, patch: Partial<Character>) => void
  deleteCharacter: (id: string) => void
  updatePlace: (id: string, patch: Partial<Place>) => void
  addPlace: (input: PlaceInput) => string | null
  deletePlace: (id: string) => void
  addMap: (map: MapDoc) => void
  updateMap: (id: string, patch: Partial<MapDoc>) => void
  deleteMap: (id: string) => void

  openEntity: (type: EntityType, id: string) => void
  closePeek: () => void
  selectOutline: (id: string | null) => void
  selectEvent: (id: string | null) => void
  selectCharacter: (id: string | null) => void
  selectMap: (id: string | null) => void
  selectPlace: (id: string | null) => void
  setSearchOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setUiStyle: (style: UiStyle) => void
  setRightOpen: (open: boolean) => void
  setLeftOpen: (open: boolean) => void
  setPanelWidth: (side: 'left' | 'right', width: number) => void
  setDrawerWide: (wide: boolean) => void
  setMobileSheet: (sheet: 'none' | 'left' | 'right') => void
  setFocusTerm: (term: string | null) => void
  toast: (message: string) => void
  connectToSSE: () => void
}

function scheduleChapterSave(id: string) {
  const existing = chapterTimers.get(id)
  if (existing) clearTimeout(existing)
  chapterTimers.set(
    id,
    setTimeout(() => {
      chapterTimers.delete(id)
      void useApp.getState().flushChapter(id)
    }, 900),
  )
}

function scheduleCollectionSave(name: CollectionName, delay = 650) {
  const existing = collectionTimers.get(name)
  if (existing) clearTimeout(existing)
  collectionTimers.set(
    name,
    setTimeout(() => {
      collectionTimers.delete(name)
      void useApp.getState().saveCollectionNow(name)
    }, delay),
  )
}

function scheduleMetaSave(delay = 650) {
  if (metaTimer) clearTimeout(metaTimer)
  metaTimer = setTimeout(() => {
    metaTimer = null
    void useApp.getState().flushMeta()
  }, delay)
}

function applyRemoteCollection(name: CollectionName, data: { rev: number; items: any[] }) {
  const st = useApp.getState()
  if (dirtyCollections.has(name)) {
    st.toast('其他设备更新了同一模块，本地修改稍后会尝试保存')
    return
  }
  if (name === 'chapters') {
    useApp.setState({ chapters: data.items, revs: { ...st.revs, chapters: data.rev } })
    return
  }
  useApp.setState({
    [name]: data.items,
    revs: { ...st.revs, [name]: data.rev },
  } as unknown as Partial<AppState>)
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  native: isNativeApp(),
  projects: [],
  project: null,
  volumes: [],
  chapters: [],
  outlines: [],
  timelines: [],
  events: [],
  characters: [],
  maps: [],
  places: [],
  contents: {},
  revs: emptyRevs(),
  activeChapterId: null,
  view: 'write',
  saveState: 'saved',
  conflict: null,
  notice: null,
  network: null,
  loading: false,
  error: null,
  peek: null,
  peekStack: [],
  selectedOutlineId: null,
  selectedEventId: null,
  selectedCharacterId: null,
  selectedMapId: null,
  selectedPlaceId: null,
  searchOpen: false,
  settingsOpen: false,
  uiStyle: bootUiStyle,
  rightOpen: readPanelOpen('zhizhang.rightPanel'),
  leftOpen: readPanelOpen('zhizhang.leftPanel'),
  leftWidth: readPanelWidth('left'),
  rightWidth: readPanelWidth('right'),
  drawerWide: readDrawerWide(),
  mobileSheet: 'none',
  focusTerm: null,
  editorEpochs: {},

  init: async () => {
    const native = isNativeApp()
    set({ native })
    if (native) {
      try {
        localStorage.removeItem('zhizhang.server')
      } catch {}
    }
    await get().loadProjects()
  },

  loadProjects: async () => {
    try {
      const projects = await api.projects()
      set({ projects, ready: true, error: null })
      const last = localStorage.getItem('zhizhang.lastProject')
      if (!get().project && last && projects.some((p) => p.id === last)) {
        await get().openProject(last)
      }
    } catch (err) {
      set({
        ready: true,
        projects: [],
        error: err instanceof Error ? err.message : '无法连接本地服务',
      })
    }
  },

  createProject: async (title, author, description) => {
    try {
      const { id } = await api.createProject({ title, author, description })
      await get().loadProjects()
      await get().openProject(id)
      return id
    } catch (err) {
      get().toast(err instanceof Error ? err.message : '创建失败')
      return null
    }
  },

  deleteProject: async (id) => {
    try {
      await api.deleteProject(id)
      if (get().project?.id === id) {
        await get().closeProject()
      }
      await get().loadProjects()
    } catch (err) {
      get().toast(err instanceof Error ? err.message : '删除失败')
    }
  },

  openProject: async (id) => {
    sse?.close()
    sse = null
    set({ loading: true, error: null, conflict: null, peek: null, peekStack: [] })
    try {
      const data = await api.project(id)
      const payload = await api.allChapters(id)
      const contents: Record<string, ChapterContent> = {}
      for (const chapter of data.collections.chapters.items) {
        contents[chapter.id] = payload.items[chapter.id] || {
          id: chapter.id,
          content: EMPTY_DOC,
          plainText: '',
          wordCount: chapter.wordCount || 0,
          rev: 0,
          updatedAt: chapter.updatedAt,
        }
      }
      const revs: Record<CollectionName, number> = {
        volumes: data.collections.volumes.rev,
        chapters: data.collections.chapters.rev,
        outlines: data.collections.outlines.rev,
        timelines: data.collections.timelines.rev,
        events: data.collections.events.rev,
        characters: data.collections.characters.rev,
        maps: data.collections.maps.rev,
        places: data.collections.places.rev,
      }
      const sorted = [...data.collections.chapters.items].sort((a, b) => a.order - b.order)
      const savedActive = localStorage.getItem(`zhizhang.chapter.${id}`)
      const activeChapterId =
        savedActive && data.collections.chapters.items.some((c) => c.id === savedActive)
          ? savedActive
          : sorted[0]?.id || null
      const master = data.collections.outlines.items.find((o) => o.level === 'master')
      currentProjectId = id
      dirtyChapters.clear()
      dirtyCollections.clear()
      metaDirty = false
      localStorage.setItem('zhizhang.lastProject', id)
      set({
        project: data.meta,
        volumes: data.collections.volumes.items,
        chapters: data.collections.chapters.items,
        outlines: data.collections.outlines.items,
        timelines: data.collections.timelines.items,
        events: data.collections.events.items,
        characters: data.collections.characters.items,
        maps: data.collections.maps.items,
        places: data.collections.places.items,
        contents,
        revs,
        activeChapterId,
        view: 'write',
        loading: false,
        ready: true,
        saveState: 'saved',
        selectedOutlineId: master?.id || null,
        selectedEventId: null,
        selectedCharacterId: data.collections.characters.items[0]?.id || null,
        selectedMapId: data.collections.maps.items[0]?.id || null,
        selectedPlaceId: null,
        conflict: null,
        peek: null,
        peekStack: [],
      })
      get().connectToSSE()
      void get().refreshNetwork()
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : '项目打开失败',
      })
    }
  },

  closeProject: async () => {
    try {
      const st = get()
      if (st.activeChapterId && dirtyChapters.has(st.activeChapterId)) {
        await get().flushChapter(st.activeChapterId)
      }
      for (const name of [...dirtyCollections]) {
        await get().saveCollectionNow(name)
      }
      if (metaDirty) await get().flushMeta()
    } catch {}
    sse?.close()
    sse = null
    currentProjectId = null
    for (const timer of chapterTimers.values()) clearTimeout(timer)
    for (const timer of collectionTimers.values()) clearTimeout(timer)
    chapterTimers.clear()
    collectionTimers.clear()
    dirtyChapters.clear()
    dirtyCollections.clear()
    localStorage.removeItem('zhizhang.lastProject')
    set({
      project: null,
      volumes: [],
      chapters: [],
      outlines: [],
      timelines: [],
      events: [],
      characters: [],
      maps: [],
      places: [],
      contents: {},
      revs: emptyRevs(),
      activeChapterId: null,
      view: 'write',
      saveState: 'saved',
      conflict: null,
      peek: null,
      peekStack: [],
      selectedOutlineId: null,
      selectedEventId: null,
      selectedCharacterId: null,
      selectedMapId: null,
      selectedPlaceId: null,
      ready: true,
      error: null,
    })
  },

  refreshNetwork: async () => {
    if (get().native) {
      set({ network: null })
      return
    }
    try {
      const network = await api.network()
      set({ network })
    } catch {}
  },

  setView: (view) => set({ view, mobileSheet: 'none', peek: null }),
  setActiveChapter: (id) => {
    const st = get()
    if (st.activeChapterId === id) return
    if (st.activeChapterId && dirtyChapters.has(st.activeChapterId)) {
      void get().flushChapter(st.activeChapterId)
    }
    localStorage.setItem(`zhizhang.chapter.${st.project?.id || ''}`, id)
    set({ activeChapterId: id, focusTerm: null })
  },

  openChapter: async (id, term = null, keepSheet = false) => {
    const st = get()
    if (!st.contents[id] && st.project) {
      try {
        const content = await api.chapter(st.project.id, id)
        set((s) => ({ contents: { ...s.contents, [id]: content } }))
      } catch {}
    }
    get().setActiveChapter(id)
    set({
      view: 'write',
      focusTerm: term,
      peek: null,
      searchOpen: false,
      ...(keepSheet ? {} : { mobileSheet: 'none' as const }),
    })
    if (term) {
      setTimeout(() => {
        if (get().focusTerm === term) set({ focusTerm: null })
      }, 4000)
    }
  },

  createChapter: async (volumeId) => {
    const st = get()
    const pid = st.project?.id
    if (!pid) return
    let volId = volumeId || [...st.volumes].sort((a, b) => a.order - b.order)[0]?.id
    if (!volId) volId = await get().addVolume('第一卷')
    if (!volId) return

    const ts = nowIso()
    const id = uid()
    const chapter: ChapterMeta = {
      id,
      title: `第${st.chapters.length + 1}章`,
      order: nextOrder(st.chapters),
      volumeId: volId,
      status: 'draft',
      wordCount: 0,
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    }
    const current = get()
    const nextOutlines = [...current.outlines]
    let volOutline = nextOutlines.find((o) => o.level === 'volume' && o.volumeId === volId)
    if (!volOutline) {
      const master =
        nextOutlines.find((o) => o.level === 'master') ||
        ({
          id: uid(),
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
        } as OutlineNode)
      if (!nextOutlines.some((o) => o.level === 'master')) nextOutlines.push(master)
      volOutline = {
        id: uid(),
        level: 'volume',
        parentId: master.id,
        title: `${current.volumes.find((v) => v.id === volId)?.title || '新卷'} · 大纲`,
        summary: '',
        content: EMPTY_DOC,
        plainText: '',
        fields: {},
        order: nextOrder(nextOutlines.filter((o) => o.level === 'volume')),
        chapterId: null,
        volumeId: volId,
        eventIds: [],
        characterIds: [],
        updatedAt: ts,
      }
      nextOutlines.push(volOutline)
    }
    const outline: OutlineNode = {
      id: uid(),
      level: 'chapter',
      parentId: volOutline.id,
      title: `${chapter.title} · 章纲`,
      summary: '',
      content: EMPTY_DOC,
      plainText: '',
      fields: {},
      order: chapter.order,
      chapterId: id,
      volumeId: volId,
      eventIds: [],
      characterIds: [],
      updatedAt: ts,
    }
    const content: ChapterContent = {
      id,
      content: EMPTY_DOC,
      plainText: '',
      wordCount: 0,
      rev: 0,
      updatedAt: ts,
    }
    set({
      chapters: [...current.chapters, chapter],
      outlines: [...nextOutlines, outline],
      contents: { ...current.contents, [id]: content },
      activeChapterId: id,
      selectedOutlineId: outline.id,
    })
    dirtyCollections.add('chapters')
    dirtyCollections.add('outlines')
    await Promise.all([get().saveCollectionNow('chapters'), get().saveCollectionNow('outlines')])
    try {
      const res = await api.saveChapter(pid, id, {
        content: EMPTY_DOC,
        plainText: '',
        wordCount: 0,
        baseRev: 0,
      })
      set((s) => ({
        revs: res.chaptersRev != null ? { ...s.revs, chapters: res.chaptersRev } : s.revs,
        contents: {
          ...s.contents,
          [id]: { ...s.contents[id], rev: res.rev, updatedAt: res.updatedAt },
        },
      }))
    } catch (err) {
      get().toast(err instanceof Error ? err.message : '章节创建失败')
    }
  },

  renameChapter: (id, title) => {
    get().mutateCollection('chapters', (items) =>
      items.map((c) => (c.id === id ? { ...c, title, updatedAt: nowIso() } : c)),
    )
    get().mutateCollection('outlines', (items) =>
      items.map((o) =>
        o.level === 'chapter' && o.chapterId === id
          ? { ...o, title: `${title} · 章纲`, updatedAt: nowIso() }
          : o,
      ),
    )
  },

  setChapterStatus: (id, status) => {
    get().mutateCollection('chapters', (items) =>
      items.map((c) => (c.id === id ? { ...c, status, updatedAt: nowIso() } : c)),
    )
  },

  deleteChapter: async (id) => {
    const st = get()
    if (st.chapters.length <= 1) {
      get().toast('至少保留一章')
      return
    }
    const remaining = st.chapters.filter((c) => c.id !== id)
    const nextContents = { ...st.contents }
    delete nextContents[id]
    set({
      chapters: remaining,
      outlines: st.outlines.filter((o) => !(o.level === 'chapter' && o.chapterId === id)),
      contents: nextContents,
      activeChapterId: st.activeChapterId === id ? remaining[0]?.id || null : st.activeChapterId,
    })
    dirtyCollections.add('chapters')
    dirtyCollections.add('outlines')
    await Promise.all([get().saveCollectionNow('chapters'), get().saveCollectionNow('outlines')])
  },

  moveChapter: (id, direction) => {
    const st = get()
    const sorted = [...st.chapters].sort((a, b) => a.order - b.order)
    const index = sorted.findIndex((c) => c.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= sorted.length) return
    const a = sorted[index]
    const b = sorted[target]
    get().mutateCollection('chapters', (items) =>
      items.map((c) =>
        c.id === a.id ? { ...c, order: b.order } : c.id === b.id ? { ...c, order: a.order } : c,
      ),
    )
  },

  updateChapterContent: (id, content, plainText, wordCount) => {
    const st = get()
    const current = st.contents[id]
    if (!current) return
    set({
      contents: { ...st.contents, [id]: { ...current, content, plainText, wordCount } },
      chapters: st.chapters.map((c) => (c.id === id ? { ...c, wordCount } : c)),
      saveState: 'dirty',
    })
    dirtyChapters.add(id)
    scheduleChapterSave(id)
  },

  flushChapter: async (id, force = false) => {
    const timer = chapterTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      chapterTimers.delete(id)
    }
    const st = get()
    const pid = st.project?.id
    const current = st.contents[id]
    if (!pid || !current) return
    dirtyChapters.delete(id)
    set({ saveState: 'saving' })
    try {
      const res = await api.saveChapter(pid, id, {
        content: current.content,
        plainText: current.plainText,
        wordCount: current.wordCount,
        baseRev: current.rev,
        force,
      })
      set((s) => ({
        contents: {
          ...s.contents,
          [id]: { ...s.contents[id], rev: res.rev, updatedAt: res.updatedAt },
        },
        chapters: s.chapters.map((c) =>
          c.id === id ? { ...c, wordCount: current.wordCount, updatedAt: res.updatedAt } : c,
        ),
        revs:
          res.chaptersRev != null ? { ...s.revs, chapters: res.chaptersRev } : s.revs,
        saveState: dirtyChapters.size ? 'dirty' : 'saved',
        conflict: s.conflict?.chapterId === id ? null : s.conflict,
      }))
      if (dirtyChapters.has(id)) scheduleChapterSave(id)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const server = (err.data as { current?: ChapterContent } | null)?.current
        if (server) {
          set({ saveState: 'conflict', conflict: { chapterId: id, server } })
          return
        }
      }
      set({ saveState: 'error' })
      get().toast(err instanceof Error ? err.message : '正文保存失败')
      dirtyChapters.add(id)
      setTimeout(() => {
        if (dirtyChapters.has(id)) void get().flushChapter(id)
      }, 4000)
    }
  },

  resolveConflict: async (choice) => {
    const conflict = get().conflict
    if (!conflict) return
    if (choice === 'server') {
      dirtyChapters.delete(conflict.chapterId)
      set((s) => ({
        contents: { ...s.contents, [conflict.chapterId]: conflict.server },
        chapters: s.chapters.map((c) =>
          c.id === conflict.chapterId ? { ...c, wordCount: conflict.server.wordCount } : c,
        ),
        conflict: null,
        saveState: 'saved',
        editorEpochs: {
          ...s.editorEpochs,
          [conflict.chapterId]: (s.editorEpochs[conflict.chapterId] || 0) + 1,
        },
      }))
    } else {
      const current = get().contents[conflict.chapterId]
      set((s) => ({
        contents: {
          ...s.contents,
          [conflict.chapterId]: { ...current, rev: conflict.server.rev },
        },
        conflict: null,
      }))
      dirtyChapters.add(conflict.chapterId)
      await get().flushChapter(conflict.chapterId, true)
    }
  },

  mutateCollection: (name, updater, immediate = false) => {
    const st = get()
    if (!st.project) return
    const current = st[name] as unknown as any[]
    const next = updater(current)
    set({ [name]: next } as unknown as Partial<AppState>)
    dirtyCollections.add(name)
    if (immediate) void get().saveCollectionNow(name)
    else scheduleCollectionSave(name)
  },

  saveCollectionNow: async (name) => {
    const st = get()
    const pid = st.project?.id
    if (!pid || !dirtyCollections.has(name)) return
    dirtyCollections.delete(name)
    const items = st[name] as unknown as any[]
    const rev = st.revs[name] ?? 0
    try {
      const res = await api.saveCollection(pid, name, items, rev)
      set((s) => ({ revs: { ...s.revs, [name]: res.rev } }))
      if (dirtyCollections.has(name)) scheduleCollectionSave(name, 80)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const current = (err.data as { current?: { rev: number; items: any[] } } | null)?.current
        if (current) {
          dirtyCollections.delete(name)
          set({
            [name]: current.items,
            revs: { ...get().revs, [name]: current.rev },
            notice: '其他设备已更新，已刷新最新内容',
          } as unknown as Partial<AppState>)
        }
      } else {
        dirtyCollections.add(name)
        get().toast(err instanceof Error ? err.message : '保存失败')
        setTimeout(() => {
          if (dirtyCollections.has(name)) void get().saveCollectionNow(name)
        }, 4000)
      }
    }
  },

  updateMeta: (patch, immediate = false) => {
    const st = get()
    if (!st.project) return
    set({
      project: {
        ...st.project,
        ...patch,
        settings: patch.settings ? { ...st.project.settings, ...patch.settings } : st.project.settings,
        calendar: patch.calendar ? { ...st.project.calendar, ...patch.calendar } : st.project.calendar,
      },
    })
    metaDirty = true
    metaVersion += 1
    if (immediate) void get().flushMeta()
    else scheduleMetaSave()
  },

  flushMeta: async () => {
    const st = get()
    const project = st.project
    if (!project || !metaDirty) return
    metaDirty = false
    const version = metaVersion
    try {
      const res = await api.updateMeta(
        project.id,
        {
          title: project.title,
          author: project.author,
          description: project.description,
          calendar: project.calendar,
          settings: project.settings,
        },
        project.rev,
      )
      set((s) => ({
        project: s.project
          ? { ...s.project, rev: res.rev, updatedAt: res.updatedAt }
          : s.project,
      }))
      if (metaVersion !== version) scheduleMetaSave(60)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const current = (err.data as { current?: ProjectMeta } | null)?.current
        if (current) {
          set((s) => ({
            project: s.project ? { ...s.project, ...current } : current,
            notice: '其他设备已更新项目设置，已刷新',
          }))
        }
        metaDirty = false
      } else {
        metaDirty = true
        get().toast('设置保存失败')
        setTimeout(() => {
          if (metaDirty) void get().flushMeta()
        }, 4000)
      }
    }
  },

  flushAll: async () => {
    const st = get()
    if (st.activeChapterId) await get().flushChapter(st.activeChapterId)
    for (const name of [...dirtyCollections]) await get().saveCollectionNow(name)
    if (metaDirty) await get().flushMeta()
  },

  addVolume: async (title) => {
    const st = get()
    if (!st.project) return ''
    const ts = nowIso()
    const id = uid()
    const volume: Volume = { id, title: title || '新卷', description: '', order: nextOrder(st.volumes) }
    let master = st.outlines.find((o) => o.level === 'master')
    const nextOutlines = [...st.outlines]
    if (!master) {
      master = {
        id: uid(),
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
      }
      nextOutlines.push(master)
    }
    const outline: OutlineNode = {
      id: uid(),
      level: 'volume',
      parentId: master.id,
      title: `${volume.title} · 大纲`,
      summary: '',
      content: EMPTY_DOC,
      plainText: '',
      fields: {},
      order: volume.order,
      chapterId: null,
      volumeId: id,
      eventIds: [],
      characterIds: [],
      updatedAt: ts,
    }
    set({ volumes: [...st.volumes, volume], outlines: [...nextOutlines, outline] })
    dirtyCollections.add('volumes')
    dirtyCollections.add('outlines')
    await Promise.all([get().saveCollectionNow('volumes'), get().saveCollectionNow('outlines')])
    return id
  },

  deleteVolume: (id) => {
    const st = get()
    if (st.chapters.some((c) => c.volumeId === id)) {
      get().toast('请先移动或删除该卷内的章节')
      return
    }
    const outlineIds = new Set(
      st.outlines.filter((o) => o.volumeId === id || o.parentId === st.outlines.find((x) => x.level === 'volume' && x.volumeId === id)?.id).map((o) => o.id),
    )
    set({
      volumes: st.volumes.filter((v) => v.id !== id),
      outlines: st.outlines.filter((o) => !outlineIds.has(o.id)),
    })
    dirtyCollections.add('volumes')
    dirtyCollections.add('outlines')
    void get().saveCollectionNow('volumes')
    void get().saveCollectionNow('outlines')
  },

  updateOutline: (id, patch) => {
    get().mutateCollection('outlines', (items) =>
      items.map((o) => (o.id === id ? { ...o, ...patch, updatedAt: nowIso() } : o)),
    )
  },

  updateEvent: (id, patch) => {
    get().mutateCollection('events', (items) =>
      items.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: nowIso() } : e)),
    )
  },

  addEvent: (input = {}) => {
    const st = get()
    if (!st.project) return null
    const id = uid()
    const ts = nowIso()
    const event: StoryEvent = {
      id,
      timelineId: input.timelineId || 'main',
      title: input.title || '新事件',
      content: EMPTY_DOC,
      plainText: '',
      time: input.time || defaultEventTime(st.project.calendar),
      order: nextOrder(st.events),
      locationId: input.locationId || null,
      characterIds: [],
      outlineIds: [],
      status: input.status || 'planned',
      importance: 3,
      tags: [],
      createdAt: ts,
      updatedAt: ts,
    }
    get().mutateCollection('events', (items) => [...items, event])
    set({ selectedEventId: id })
    return id
  },

  deleteEvent: (id) => {
    get().mutateCollection('events', (items) => items.filter((e) => e.id !== id))
    get().mutateCollection('outlines', (items) =>
      items.map((o) => ({ ...o, eventIds: (o.eventIds || []).filter((x: string) => x !== id) })),
    )
    get().mutateCollection('timelines', (items) =>
      items.map((t) => (t.forkEventId === id ? { ...t, forkEventId: null } : t)),
    )
    if (get().selectedEventId === id) set({ selectedEventId: null })
  },

  addBranch: (eventId, name, color) => {
    const st = get()
    const event = st.events.find((e) => e.id === eventId)
    if (!event) return
    const timeline: Timeline = {
      id: uid(),
      name: name || '新支线',
      color,
      description: '',
      forkEventId: event.id,
      parentTimelineId: event.timelineId,
      order: nextOrder(st.timelines),
    }
    get().mutateCollection('timelines', (items) => [...items, timeline], true)
    set({ view: 'timeline', mobileSheet: 'none' })
    get().toast(`已创建支线「${timeline.name}」`)
  },

  addTimeline: (name) => {
    const st = get()
    if (!st.project) return null
    const timeline: Timeline = {
      id: uid(),
      name: name || `事件线${st.timelines.length}`,
      color: timelinePalette()[st.timelines.length % timelinePalette().length],
      description: '',
      forkEventId: null,
      parentTimelineId: null,
      order: nextOrder(st.timelines),
    }
    get().mutateCollection('timelines', (items) => [...items, timeline], true)
    return timeline.id
  },

  updateTimeline: (id, patch) => {
    get().mutateCollection('timelines', (items) =>
      items.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    )
  },

  deleteTimeline: (id) => {
    if (id === 'main') {
      get().toast('主线不能删除')
      return
    }
    const st = get()
    const deletedEventIds = new Set(st.events.filter((e) => e.timelineId === id).map((e) => e.id))
    set({
      timelines: st.timelines.filter((t) => t.id !== id),
      events: st.events.filter((e) => e.timelineId !== id),
      selectedEventId:
        st.selectedEventId && deletedEventIds.has(st.selectedEventId) ? null : st.selectedEventId,
    })
    dirtyCollections.add('timelines')
    dirtyCollections.add('events')
    void get().saveCollectionNow('timelines')
    void get().saveCollectionNow('events')
  },

  updateCharacter: (id, patch) => {
    get().mutateCollection('characters', (items) =>
      items.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c)),
    )
  },

  addCharacter: (name) => {
    const st = get()
    if (!st.project) return null
    const ts = nowIso()
    const character: Character = {
      id: uid(),
      name: name || `新人物${st.characters.length + 1}`,
      aliases: [],
      avatar: '',
      role: '',
      identity: '',
      faction: '',
      gender: '',
      age: '',
      appearance: '',
      personality: '',
      goal: '',
      abilities: '',
      background: '',
      secret: '',
      arc: '',
      tags: [],
      relationships: [],
      notes: '',
      createdAt: ts,
      updatedAt: ts,
    }
    get().mutateCollection('characters', (items) => [...items, character], true)
    set({ selectedCharacterId: character.id })
    return character.id
  },

  deleteCharacter: (id) => {
    const st = get()
    set({
      characters: st.characters.filter((c) => c.id !== id),
      events: st.events.map((e) => ({
        ...e,
        characterIds: (e.characterIds || []).filter((x) => x !== id),
      })),
      outlines: st.outlines.map((o) => ({
        ...o,
        characterIds: (o.characterIds || []).filter((x) => x !== id),
      })),
      places: st.places.map((p) => ({
        ...p,
        characterIds: (p.characterIds || []).filter((x) => x !== id),
      })),
      selectedCharacterId: st.selectedCharacterId === id ? null : st.selectedCharacterId,
      peek: st.peek?.type === 'character' && st.peek.id === id ? null : st.peek,
    })
    dirtyCollections.add('characters')
    dirtyCollections.add('events')
    dirtyCollections.add('outlines')
    dirtyCollections.add('places')
    for (const name of ['characters', 'events', 'outlines', 'places'] as CollectionName[]) {
      void get().saveCollectionNow(name)
    }
  },

  updatePlace: (id, patch) => {
    get().mutateCollection('places', (items) =>
      items.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p)),
    )
  },

  addPlace: (input) => {
    const st = get()
    if (!st.project) return null
    const ts = nowIso()
    const place: Place = {
      id: uid(),
      mapId: input.mapId,
      name: input.name || '新地点',
      x: input.x,
      y: input.y,
      category: '其他',
      color: '#5a5f65',
      icon: 'pin',
      description: EMPTY_DOC,
      plainText: '',
      tags: [],
      characterIds: [],
      createdAt: ts,
      updatedAt: ts,
    }
    get().mutateCollection('places', (items) => [...items, place])
    set({ selectedPlaceId: place.id })
    return place.id
  },

  deletePlace: (id) => {
    const st = get()
    set({
      places: st.places.filter((p) => p.id !== id),
      events: st.events.map((e) => (e.locationId === id ? { ...e, locationId: null } : e)),
      selectedPlaceId: st.selectedPlaceId === id ? null : st.selectedPlaceId,
      peek: st.peek?.type === 'place' && st.peek.id === id ? null : st.peek,
    })
    dirtyCollections.add('places')
    dirtyCollections.add('events')
    void get().saveCollectionNow('places')
    void get().saveCollectionNow('events')
  },

  addMap: (map) => {
    get().mutateCollection('maps', (items) => [...items, map], true)
    set({ selectedMapId: map.id, selectedPlaceId: null })
  },

  updateMap: (id, patch) => {
    get().mutateCollection('maps', (items) => items.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  },

  deleteMap: (id) => {
    const st = get()
    set({
      maps: st.maps.filter((m) => m.id !== id),
      places: st.places.filter((p) => p.mapId !== id),
      selectedMapId: st.selectedMapId === id ? null : st.selectedMapId,
      selectedPlaceId: null,
    })
    dirtyCollections.add('maps')
    dirtyCollections.add('places')
    void get().saveCollectionNow('maps')
    void get().saveCollectionNow('places')
  },

  openEntity: (type, id) => {
    if (type === 'chapter') {
      void get().openChapter(id)
      return
    }
    if (type === 'map') {
      set({ view: 'maps', selectedMapId: id, peek: null, mobileSheet: 'none' })
      return
    }
    set((s) => ({
      peek: { type, id },
      peekStack:
        s.peek && (s.peek.type !== type || s.peek.id !== id) ? [...s.peekStack, s.peek] : s.peekStack,
    }))
  },

  closePeek: () =>
    set((s) => {
      const stack = [...s.peekStack]
      const previous = stack.pop() || null
      return { peek: previous, peekStack: stack }
    }),

  selectOutline: (id) => set({ selectedOutlineId: id }),
  selectEvent: (id) => set({ selectedEventId: id }),
  selectCharacter: (id) => set({ selectedCharacterId: id }),
  selectMap: (id) => set({ selectedMapId: id, selectedPlaceId: null }),
  selectPlace: (id) => set({ selectedPlaceId: id }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setUiStyle: (style) => {
    try {
      localStorage.setItem('zhizhang.uiStyle', style)
    } catch {
      /* storage may be unavailable */
    }
    document.documentElement.dataset.ui = style
    set({ uiStyle: style })
  },
  setRightOpen: (open) => {
    flagPanelAnim()
    try {
      localStorage.setItem('zhizhang.rightPanel', open ? 'open' : 'closed')
    } catch {
      /* storage may be unavailable */
    }
    set({ rightOpen: open })
  },
  setMobileSheet: (sheet) => set({ mobileSheet: sheet }),
  setDrawerWide: (wide) => {
    try {
      localStorage.setItem('zhizhang.drawer', wide ? 'wide' : 'narrow')
    } catch {
      /* storage may be unavailable */
    }
    document.documentElement.dataset.drawer = wide ? 'wide' : 'narrow'
    set({ drawerWide: wide })
  },
  setLeftOpen: (open) => {
    flagPanelAnim()
    try {
      localStorage.setItem('zhizhang.leftPanel', open ? 'open' : 'closed')
    } catch {
      /* storage may be unavailable */
    }
    set({ leftOpen: open })
  },
  setPanelWidth: (side, width) => {
    const limits = side === 'left' ? [190, 420] : [230, 460]
    const next = Math.min(limits[1], Math.max(limits[0], Math.round(width)))
    const state = get()
    if (state[side === 'left' ? 'leftWidth' : 'rightWidth'] === next) return
    try {
      const raw = JSON.parse(localStorage.getItem('zhizhang.panelWidths') || '{}') as Record<string, number>
      raw[side] = next
      localStorage.setItem('zhizhang.panelWidths', JSON.stringify(raw))
    } catch {
      /* storage may be unavailable */
    }
    set(side === 'left' ? { leftWidth: next } : { rightWidth: next })
  },
  setFocusTerm: (term) => set({ focusTerm: term }),

  toast: (message) => {
    if (noticeTimer) clearTimeout(noticeTimer)
    set({ notice: message })
    noticeTimer = setTimeout(() => {
      set({ notice: null })
      noticeTimer = null
    }, 3500)
  },

  connectToSSE: () => {
    if (!currentProjectId || get().native) return
    sse?.close()
    sse = new EventSource(api.streamUrl(currentProjectId))
    sse.addEventListener('chapter', (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as ChapterContent
        const st = get()
        if (!st.contents[data.id] && st.activeChapterId !== data.id) {
          return
        }
        if (st.activeChapterId === data.id && dirtyChapters.has(data.id)) {
          st.toast('其他设备修改了当前章节，保存时可能冲突')
          return
        }
        set((s) => ({
          contents: { ...s.contents, [data.id]: data },
          chapters: s.chapters.map((c) =>
            c.id === data.id ? { ...c, wordCount: data.wordCount, updatedAt: data.updatedAt || c.updatedAt } : c,
          ),
        }))
      } catch {}
    })
    sse.addEventListener('collection', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          name: CollectionName
          data: { rev: number; items: any[] }
        }
        applyRemoteCollection(payload.name, payload.data)
      } catch {}
    })
    sse.addEventListener('meta', (event) => {
      try {
        const meta = JSON.parse((event as MessageEvent).data) as ProjectMeta
        if (metaDirty) {
          get().toast('其他设备修改了项目设置，本地修改稍后会尝试保存')
          return
        }
        set({ project: meta })
      } catch {}
    })
    sse.addEventListener('project-deleted', () => {
      get().toast('作品已在其他设备删除')
      void get().closeProject()
      void get().loadProjects()
    })
    sse.onerror = () => {}
  },
}))
