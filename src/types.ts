import type { JSONContent } from '@tiptap/react'

export interface CalendarSettings {
  mode: 'date' | 'day' | 'free'
  era: string
  monthsPerYear: number
  daysPerMonth: number
  hoursPerDay: number
}

export interface ProjectSettings {
  theme: 'light' | 'dark'
  font: 'serif' | 'sans'
  fontSize: number
  lineHeight: number
  editorWidth: number
  indent: boolean
}

export interface ProjectMeta {
  id: string
  title: string
  author: string
  description: string
  calendar: CalendarSettings
  settings: ProjectSettings
  createdAt: string
  updatedAt: string
  rev: number
}

export interface ProjectSummary {
  id: string
  title: string
  author: string
  description: string
  wordCount: number
  createdAt: string
  updatedAt: string
}

export type SyncMethod = 'local' | 'webdav'

export interface SyncResult {
  at: string
  uploaded: number
  downloaded: number
  skipped: number
  conflicts: number
  projects: number
  error?: string
}

export interface WebdavConfig {
  url: string
  username: string
  remotePath: string
  hasPassword: boolean
}

export interface SyncConfig {
  method: SyncMethod
  webdav: WebdavConfig
  configured: boolean
  lastSyncAt: string | null
  lastResult: SyncResult | null
}

export interface SyncInput {
  method: SyncMethod
  webdav: {
    url: string
    username: string
    password?: string
    remotePath: string
  }
}

export interface Volume {
  id: string
  title: string
  description?: string
  order: number
}

export type ChapterStatus = 'draft' | 'revise' | 'done'

export interface ChapterMeta {
  id: string
  title: string
  order: number
  volumeId: string
  status: ChapterStatus
  wordCount: number
  rev: number
  createdAt: string
  updatedAt: string
}

export interface ChapterContent {
  id: string
  content: JSONContent
  plainText: string
  wordCount: number
  rev: number
  updatedAt: string | null
}

export type OutlineLevel = 'master' | 'volume' | 'chapter'

export interface OutlineNode {
  id: string
  level: OutlineLevel
  parentId: string | null
  title: string
  summary: string
  content: JSONContent
  plainText: string
  fields: Record<string, string>
  order: number
  chapterId: string | null
  volumeId: string | null
  eventIds: string[]
  characterIds: string[]
  status?: string
  createdAt?: string
  updatedAt?: string
}

export interface Timeline {
  id: string
  name: string
  color: string
  description?: string
  forkEventId: string | null
  parentTimelineId: string | null
  order: number
}

export interface EventTime {
  y?: number | null
  m?: number | null
  d?: number | null
  h?: number | null
  day?: number | null
  label?: string
  unscheduled?: boolean
}

export type EventStatus = 'planned' | 'happened' | 'alternate'

export interface StoryEvent {
  id: string
  timelineId: string
  title: string
  content: JSONContent
  plainText: string
  time: EventTime
  order: number
  locationId: string | null
  characterIds: string[]
  outlineIds: string[]
  status: EventStatus
  importance: number
  tags: string[]
  color?: string
  createdAt?: string
  updatedAt?: string
}

export interface Relationship {
  targetId: string
  type: string
  note: string
}

export interface Character {
  id: string
  name: string
  aliases: string[]
  avatar: string
  role: string
  identity: string
  faction: string
  gender: string
  age: string
  appearance: string
  personality: string
  goal: string
  abilities: string
  background: string
  secret: string
  arc: string
  tags: string[]
  relationships: Relationship[]
  notes: string
  createdAt?: string
  updatedAt?: string
}

export interface MapDoc {
  id: string
  name: string
  image: string
  width: number
  height: number
  order: number
  description: string
}

export interface Place {
  id: string
  mapId: string
  name: string
  x: number
  y: number
  category: string
  color: string
  icon: string
  description: JSONContent
  plainText: string
  tags: string[]
  characterIds: string[]
  createdAt?: string
  updatedAt?: string
}

export interface Collection<T> {
  rev: number
  updatedAt: string | null
  items: T[]
}

export interface Collections {
  volumes: Collection<Volume>
  chapters: Collection<ChapterMeta>
  outlines: Collection<OutlineNode>
  timelines: Collection<Timeline>
  events: Collection<StoryEvent>
  characters: Collection<Character>
  maps: Collection<MapDoc>
  places: Collection<Place>
}

export type CollectionName = keyof Collections

export interface ProjectPayload {
  meta: ProjectMeta
  collections: Collections
  port: number
}

export type ViewName = 'write' | 'structure' | 'timeline' | 'characters' | 'maps'

export type UiStyle = 'glass' | 'paper'

export type EntityType = 'character' | 'event' | 'place' | 'outline' | 'chapter' | 'map'

export interface PeekRef {
  type: EntityType
  id: string
}

export interface MentionSource {
  type: EntityType
  id: string
  label: string
  sub?: string
}

export interface MentionRef {
  type: EntityType
  id: string
  label: string
}

export type SaveState = 'saved' | 'saving' | 'dirty' | 'error' | 'conflict'

export interface ConflictState {
  chapterId: string
  server: ChapterContent
}

export interface NetworkInfo {
  port: number
  hostname: string
  local: string
  urls: string[]
  dataRoot: string
}
