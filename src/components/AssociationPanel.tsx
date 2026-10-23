import { useEffect, useMemo, useState } from 'react'
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  Link2,
  ListTree,
  MapPin,
  Plus,
  Sparkles,
  Users,
} from 'lucide-react'
import { useApp } from '../store'
import { extractMentions } from '../lib/tiptap'
import type { EntityType, OutlineNode } from '../types'
import { cx, eventStatusLabel, formatNumber, placeCategoryOptions, statusLabel } from '../lib/utils'
import { formatEventTime } from '../lib/time'
import { MiniEditor } from './RichText'
import { Field, Segmented } from './ui'

const LEVEL_LABEL: Record<string, string> = { master: '总纲', volume: '大纲', chapter: '章纲' }

type InlineKind = 'outline' | 'event' | 'character' | 'place'
type InlineRef = { type: InlineKind; id: string }

function InlineHead({
  kind,
  title,
  onBack,
  onOpen,
}: {
  kind: string
  title: string
  onBack: () => void
  onOpen: () => void
}) {
  return (
    <div className="assoc-inline-head">
      <button className="top-icon" title="返回联动栏" onClick={onBack}>
        <ChevronLeft size={15} />
      </button>
      <div className="assoc-inline-head-text">
        <span className="assoc-inline-kind">{kind}</span>
        <span className="assoc-inline-title">{title}</span>
      </div>
      <button className="top-icon" title="在完整页面打开" onClick={onOpen}>
        <ArrowUpRight size={14} />
      </button>
    </div>
  )
}

function OutlineInline({
  id,
  onBack,
  onOpen,
  openEvent,
  openCharacter,
}: {
  id: string
  onBack: () => void
  onOpen: () => void
  openEvent: (id: string) => void
  openCharacter: (id: string) => void
}) {
  const outline = useApp((s) => s.outlines.find((o) => o.id === id))
  const chapters = useApp((s) => s.chapters)
  const contents = useApp((s) => s.contents)
  const events = useApp((s) => s.events)
  const characters = useApp((s) => s.characters)
  const updateOutline = useApp((s) => s.updateOutline)

  if (!outline) {
    return (
      <div className="assoc-inline-body">
        <div className="hint-box">这条内容已不存在。</div>
      </div>
    )
  }
  const chapter = chapters.find((c) => c.id === outline.chapterId)
  const eventIds = new Set(outline.eventIds || [])
  if (outline.level === 'chapter' && outline.chapterId) {
    extractMentions(contents[outline.chapterId]?.content).forEach((mention) => {
      if (mention.type === 'event') eventIds.add(mention.id)
    })
  }
  const linkedEvents = events.filter((event) => eventIds.has(event.id))
  const linkedCharacters = characters.filter((character) => (outline.characterIds || []).includes(character.id))

  return (
    <>
      <InlineHead kind={LEVEL_LABEL[outline.level] || '纲要'} title={outline.title} onBack={onBack} onOpen={onOpen} />
      <div className="assoc-inline-body">
        <div className="assoc-inline-meta">
          <span className="badge">{LEVEL_LABEL[outline.level]}</span>
          {chapter && <span className="badge">{chapter.title}</span>}
        </div>
        <Field label="标题">
          <input
            className="input sm"
            value={outline.title}
            onChange={(event) => updateOutline(outline.id, { title: event.target.value })}
          />
        </Field>
        <Field label="一句话概要">
          <textarea
            className="textarea"
            rows={2}
            value={outline.summary}
            placeholder="这一章要发生的事……"
            onChange={(event) => updateOutline(outline.id, { summary: event.target.value })}
          />
        </Field>
        <Field label="详细纲目">
          <MiniEditor
            doc={outline.content}
            placeholder="分场、情节推进、节奏、伏笔……"
            onChange={(content, plainText) => updateOutline(outline.id, { content, plainText })}
          />
        </Field>
        {linkedEvents.length > 0 && (
          <div className="assoc-inline-group">
            <div className="assoc-label">
              <span className="row gap-4">
                <GitBranch size={12} /> 关联事件
              </span>
              <span>{linkedEvents.length}</span>
            </div>
            <div className="col" style={{ gap: 1 }}>
              {linkedEvents.map((event) => (
                <button key={event.id} className="entity-row" onClick={() => openEvent(event.id)}>
                  <span
                    className="status-dot"
                    style={{ background: event.status === 'happened' ? 'var(--jade)' : 'var(--gold)' }}
                  />
                  <span className="grow">{event.title}</span>
                  <span className="badge">{eventStatusLabel(event.status)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {linkedCharacters.length > 0 && (
          <div className="assoc-inline-group">
            <div className="assoc-label">
              <span className="row gap-4">
                <Users size={12} /> 关联人物
              </span>
              <span>{linkedCharacters.length}</span>
            </div>
            <div className="link-chips">
              {linkedCharacters.map((character) => (
                <button key={character.id} className="chip" onClick={() => openCharacter(character.id)}>
                  {character.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function EventInline({
  id,
  onBack,
  onOpen,
  openCharacter,
  openPlace,
}: {
  id: string
  onBack: () => void
  onOpen: () => void
  openCharacter: (id: string) => void
  openPlace: (id: string) => void
}) {
  const event = useApp((s) => s.events.find((e) => e.id === id))
  const calendar = useApp((s) => s.project?.calendar)
  const timelines = useApp((s) => s.timelines)
  const characters = useApp((s) => s.characters)
  const places = useApp((s) => s.places)
  const updateEvent = useApp((s) => s.updateEvent)

  if (!event) {
    return (
      <div className="assoc-inline-body">
        <div className="hint-box">这个事件已不存在。</div>
      </div>
    )
  }
  const timeline = timelines.find((item) => item.id === event.timelineId)
  const linkedCharacters = characters.filter((character) => (event.characterIds || []).includes(character.id))
  const place = places.find((item) => item.id === event.locationId)

  return (
    <>
      <InlineHead kind="事件" title={event.title} onBack={onBack} onOpen={onOpen} />
      <div className="assoc-inline-body">
        <div className="assoc-inline-meta">
          {calendar && <span className="badge">{formatEventTime(event.time, calendar)}</span>}
          {timeline && <span className="badge">{timeline.name}</span>}
        </div>
        <Field label="标题">
          <input
            className="input sm"
            value={event.title}
            onChange={(input) => updateEvent(event.id, { title: input.target.value })}
          />
        </Field>
        <Field label="状态">
          <Segmented
            value={event.status}
            options={[
              { value: 'planned', label: '计划' },
              { value: 'happened', label: '已发生' },
              { value: 'alternate', label: '支线' },
            ]}
            onChange={(status) => updateEvent(event.id, { status })}
          />
        </Field>
        <Field label="事件内容">
          <MiniEditor
            doc={event.content}
            placeholder="发生了什么、谁在场、留下了什么……"
            onChange={(content, plainText) => updateEvent(event.id, { content, plainText })}
          />
        </Field>
        {linkedCharacters.length > 0 && (
          <div className="assoc-inline-group">
            <div className="assoc-label">
              <span className="row gap-4">
                <Users size={12} /> 涉及人物
              </span>
              <span>{linkedCharacters.length}</span>
            </div>
            <div className="link-chips">
              {linkedCharacters.map((character) => (
                <button key={character.id} className="chip" onClick={() => openCharacter(character.id)}>
                  {character.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {place && (
          <div className="assoc-inline-group">
            <div className="assoc-label">
              <span className="row gap-4">
                <MapPin size={12} /> 发生地点
              </span>
            </div>
            <button className="entity-row" onClick={() => openPlace(place.id)}>
              <span className="dot" />
              <span className="grow">{place.name}</span>
              <span className="badge">{place.category}</span>
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function CharacterInline({
  id,
  onBack,
  onOpen,
  openChapter,
}: {
  id: string
  onBack: () => void
  onOpen: () => void
  openChapter: (id: string) => void
}) {
  const character = useApp((s) => s.characters.find((c) => c.id === id))
  const chapters = useApp((s) => s.chapters)
  const contents = useApp((s) => s.contents)
  const updateCharacter = useApp((s) => s.updateCharacter)

  const appearances = useMemo(() => {
    if (!character) return []
    const names = [character.name, ...(character.aliases || [])].map((name) => name.trim()).filter(Boolean)
    return chapters
      .filter((chapter) => {
        const text = contents[chapter.id]?.plainText || ''
        return names.some((name) => name && text.includes(name))
      })
      .slice(0, 8)
  }, [character, chapters, contents])

  if (!character) {
    return (
      <div className="assoc-inline-body">
        <div className="hint-box">这个人物已不存在。</div>
      </div>
    )
  }

  return (
    <>
      <InlineHead kind="人物" title={character.name} onBack={onBack} onOpen={onOpen} />
      <div className="assoc-inline-body">
        {character.role && <div className="assoc-inline-meta"><span className="badge">{character.role}</span></div>}
        <Field label="姓名">
          <input
            className="input sm"
            value={character.name}
            onChange={(event) => updateCharacter(character.id, { name: event.target.value })}
          />
        </Field>
        <Field label="身份 / 立场">
          <input
            className="input sm"
            value={character.identity}
            placeholder="身份、所属势力……"
            onChange={(event) => updateCharacter(character.id, { identity: event.target.value })}
          />
        </Field>
        <Field label="性格">
          <textarea
            className="textarea"
            rows={2}
            value={character.personality}
            placeholder="说话方式、处事习惯……"
            onChange={(event) => updateCharacter(character.id, { personality: event.target.value })}
          />
        </Field>
        <Field label="背景">
          <textarea
            className="textarea"
            rows={3}
            value={character.background}
            placeholder="经历、来历、与主线的关系……"
            onChange={(event) => updateCharacter(character.id, { background: event.target.value })}
          />
        </Field>
        <div className="assoc-inline-group">
          <div className="assoc-label">
            <span className="row gap-4">
              <FileText size={12} /> 正文出现
            </span>
            <span>{appearances.length}</span>
          </div>
          {appearances.length === 0 ? (
            <div className="hint-box">正文里还没有写到这个名字。</div>
          ) : (
            <div className="col" style={{ gap: 1 }}>
              {appearances.map((chapter) => (
                <button key={chapter.id} className="entity-row" onClick={() => openChapter(chapter.id)}>
                  <span className="dot" />
                  <span className="grow">{chapter.title}</span>
                  <ChevronRight size={12} color="var(--muted)" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function PlaceInline({
  id,
  onBack,
  onOpen,
  openEvent,
}: {
  id: string
  onBack: () => void
  onOpen: () => void
  openEvent: (id: string) => void
}) {
  const place = useApp((s) => s.places.find((p) => p.id === id))
  const events = useApp((s) => s.events)
  const updatePlace = useApp((s) => s.updatePlace)

  if (!place) {
    return (
      <div className="assoc-inline-body">
        <div className="hint-box">这个地点已不存在。</div>
      </div>
    )
  }
  const here = events.filter((event) => event.locationId === place.id)

  return (
    <>
      <InlineHead kind="地点" title={place.name} onBack={onBack} onOpen={onOpen} />
      <div className="assoc-inline-body">
        <div className="assoc-inline-meta">
          {place.category && <span className="badge">{place.category}</span>}
          {(place.tags || []).map((tag) => (
            <span key={tag} className="badge">
              {tag}
            </span>
          ))}
        </div>
        <Field label="名称">
          <input
            className="input sm"
            value={place.name}
            onChange={(event) => updatePlace(place.id, { name: event.target.value })}
          />
        </Field>
        <Field label="类型">
          <select
            className="select sm"
            value={place.category}
            onChange={(event) => updatePlace(place.id, { category: event.target.value })}
          >
            {placeCategoryOptions().map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
        <Field label="地点描述">
          <MiniEditor
            doc={place.description}
            placeholder="地貌、氛围、住在这里的人……"
            onChange={(description, plainText) => updatePlace(place.id, { description, plainText })}
          />
        </Field>
        {here.length > 0 && (
          <div className="assoc-inline-group">
            <div className="assoc-label">
              <span className="row gap-4">
                <GitBranch size={12} /> 这里发生的事
              </span>
              <span>{here.length}</span>
            </div>
            <div className="col" style={{ gap: 1 }}>
              {here.map((event) => (
                <button key={event.id} className="entity-row" onClick={() => openEvent(event.id)}>
                  <span className="dot" />
                  <span className="grow">{event.title}</span>
                  <span className="badge">{eventStatusLabel(event.status)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default function AssociationPanel() {
  const activeChapterId = useApp((s) => s.activeChapterId)
  const chapters = useApp((s) => s.chapters)
  const contents = useApp((s) => s.contents)
  const outlines = useApp((s) => s.outlines)
  const events = useApp((s) => s.events)
  const characters = useApp((s) => s.characters)
  const places = useApp((s) => s.places)
  const setView = useApp((s) => s.setView)
  const selectOutline = useApp((s) => s.selectOutline)
  const selectEvent = useApp((s) => s.selectEvent)
  const selectCharacter = useApp((s) => s.selectCharacter)
  const openEntity = useApp((s) => s.openEntity)
  const openChapter = useApp((s) => s.openChapter)
  const addEvent = useApp((s) => s.addEvent)
  const addCharacter = useApp((s) => s.addCharacter)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const [inline, setInline] = useState<InlineRef | null>(null)
  const [inlineStack, setInlineStack] = useState<InlineRef[]>([])

  useEffect(() => {
    setInline(null)
    setInlineStack([])
  }, [activeChapterId])

  const chapter = chapters.find((c) => c.id === activeChapterId)
  const content = activeChapterId ? contents[activeChapterId] : null
  const outline = outlines.find((o) => o.level === 'chapter' && o.chapterId === activeChapterId)

  const mentions = useMemo(() => extractMentions(content?.content), [content?.content])

  const mentionedCharacters = useMemo(() => {
    const seen = new Set<string>()
    const result: typeof characters = []
    mentions.forEach((mention) => {
      if (mention.type !== 'character') return
      const found = characters.find((character) => character.id === mention.id)
      if (found && !seen.has(found.id)) {
        seen.add(found.id)
        result.push(found)
      }
    })
    const text = content?.plainText || ''
    characters.forEach((character) => {
      if (seen.has(character.id)) return
      const names = [character.name, ...(character.aliases || [])].filter(Boolean)
      if (names.some((name) => text.includes(name))) {
        seen.add(character.id)
        result.push(character)
      }
    })
    return result
  }, [mentions, characters, content?.plainText])

  const linkedEvents = useMemo(() => {
    const ids = new Set<string>(outline?.eventIds || [])
    mentions.forEach((mention) => mention.type === 'event' && ids.add(mention.id))
    return events.filter((event) => ids.has(event.id))
  }, [outline, mentions, events])

  const linkedPlaces = useMemo(() => {
    const ids = new Set<string>()
    mentions.forEach((mention) => mention.type === 'place' && ids.add(mention.id))
    return places.filter((place) => ids.has(place.id))
  }, [mentions, places])

  const linkedOutlines = useMemo(() => {
    const ids = new Set<string>()
    mentions.forEach((mention) => mention.type === 'outline' && ids.add(mention.id))
    return outlines.filter((item) => ids.has(item.id))
  }, [mentions, outlines])

  const structure = useMemo(() => {
    const rank = (node: OutlineNode) => (node.level === 'master' ? 0 : node.level === 'volume' ? 1 : 2)
    return [...outlines].sort((a, b) => rank(a) - rank(b) || a.order - b.order)
  }, [outlines])

  const openInline = (type: InlineKind, id: string) => {
    if (inline && (inline.type !== type || inline.id !== id)) setInlineStack([...inlineStack, inline])
    setInline({ type, id })
  }

  const backInline = () => {
    if (!inlineStack.length) {
      setInline(null)
      return
    }
    setInline(inlineStack[inlineStack.length - 1])
    setInlineStack(inlineStack.slice(0, -1))
  }

  const goFull = (type: InlineKind, id: string) => {
    if (type === 'outline') {
      setView('structure')
      selectOutline(id)
    } else if (type === 'event') {
      setView('timeline')
      selectEvent(id)
      openEntity('event', id)
    } else if (type === 'character') {
      setView('characters')
      selectCharacter(id)
      openEntity('character', id)
    } else {
      const place = places.find((p) => p.id === id)
      setView('maps')
      if (place) {
        useApp.getState().selectMap(place.mapId)
        useApp.getState().selectPlace(place.id)
      }
    }
    setMobileSheet('none')
  }

  const goChapter = (id: string, term?: string) => {
    void openChapter(id, term || null)
    setMobileSheet('none')
  }

  const mentionRow = (type: EntityType, id: string, label: string, sub?: string) => (
    <button
      key={`${type}-${id}`}
      className="entity-row"
      onClick={() => {
        if (type === 'character' || type === 'event' || type === 'outline' || type === 'place') {
          openInline(type, id)
        } else if (type === 'chapter') {
          goChapter(id)
        } else {
          openEntity(type, id)
        }
      }}
    >
      <span className="dot" />
      <span className="grow">{label}</span>
      {sub && <span className="badge">{sub}</span>}
    </button>
  )

  if (inline) {
    return (
      <div className="panel-body flush scroll-thin assoc-inline">
        {inline.type === 'outline' && (
          <OutlineInline
            id={inline.id}
            onBack={backInline}
            onOpen={() => goFull('outline', inline.id)}
            openEvent={(id) => openInline('event', id)}
            openCharacter={(id) => openInline('character', id)}
          />
        )}
        {inline.type === 'event' && (
          <EventInline
            id={inline.id}
            onBack={backInline}
            onOpen={() => goFull('event', inline.id)}
            openCharacter={(id) => openInline('character', id)}
            openPlace={(id) => openInline('place', id)}
          />
        )}
        {inline.type === 'character' && (
          <CharacterInline
            id={inline.id}
            onBack={backInline}
            onOpen={() => goFull('character', inline.id)}
            openChapter={(id) => goChapter(id)}
          />
        )}
        {inline.type === 'place' && (
          <PlaceInline
            id={inline.id}
            onBack={backInline}
            onOpen={() => goFull('place', inline.id)}
            openEvent={(id) => openInline('event', id)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="panel-body flush scroll-thin">
      <div className="assoc-section">
        <div className="assoc-label">
          <span className="row gap-4">
            <Sparkles size={12} /> 本章联动
          </span>
          <span className="small muted">{chapter ? statusLabel(chapter.status) : '未选择章节'}</span>
        </div>
        {chapter && (
          <div className="row gap-4 wrap" style={{ marginBottom: 8 }}>
            <span className="badge">{formatNumber(chapter.wordCount)} 字</span>
            <span className="badge badge-jade">{linkedEvents.length} 事件</span>
            <span className="badge">{mentionedCharacters.length} 人物</span>
          </div>
        )}
        <div
          className={cx('assoc-card outline-mini', !outline && 'is-empty')}
          onClick={() => outline && openInline('outline', outline.id)}
        >
          <div className="row gap-6" style={{ marginBottom: 4 }}>
            <FileText size={13} color="var(--jade)" />
            <span className="small" style={{ fontWeight: 600 }}>本章章纲</span>
            <div className="grow" />
            {outline ? <ChevronRight size={13} color="var(--muted)" /> : null}
          </div>
          {outline ? (
            <>
              <h4>{outline.title}</h4>
              <p>{outline.summary || outline.plainText || '还没有填写章纲。点击这里，把这一章要发生的事写清楚。'}</p>
            </>
          ) : (
            <p>当前章节还没有章纲，可在结构页检查。</p>
          )}
        </div>
        <div className="row gap-4" style={{ marginTop: 8 }}>
          <button
            className="btn btn-sm grow"
            onClick={() => {
              if (!outline) return
              openInline('outline', outline.id)
            }}
          >
            <ListTree size={12} /> 编辑章纲
          </button>
          <button className="btn btn-sm" onClick={() => setView('timeline')}>
            <GitBranch size={12} /> 事件线
          </button>
        </div>
      </div>

      {linkedEvents.length > 0 && (
        <div className="assoc-section">
          <div className="assoc-label">
            <span className="row gap-4">
              <GitBranch size={12} /> 关联事件
            </span>
            <span>{linkedEvents.length}</span>
          </div>
          <div className="col" style={{ gap: 1 }}>
            {linkedEvents.map((event) => (
              <button key={event.id} className="entity-row" onClick={() => openInline('event', event.id)}>
                <span
                  className="status-dot"
                  style={{ background: event.status === 'happened' ? 'var(--jade)' : 'var(--gold)' }}
                />
                <span className="grow">{event.title}</span>
                <span className="badge">{eventStatusLabel(event.status)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="assoc-section">
        <div className="assoc-label">
          <span className="row gap-4">
            <Users size={12} /> 正文提及人物
          </span>
          <span>{mentionedCharacters.length}</span>
        </div>
        {mentionedCharacters.length === 0 ? (
          <div className="hint-box">
            在正文中写入人物姓名会自动高亮并汇总到这里，也可以点工具栏「关联」插入人物。
          </div>
        ) : (
          <div className="link-chips">
            {mentionedCharacters.map((character) => (
              <button
                key={character.id}
                className="chip"
                onClick={() => openInline('character', character.id)}
              >
                {character.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {(linkedPlaces.length > 0 || linkedOutlines.length > 0) && (
        <div className="assoc-section">
          <div className="assoc-label">
            <span className="row gap-4">
              <Link2 size={12} /> 其他引用
            </span>
          </div>
          <div className="col" style={{ gap: 1 }}>
            {linkedPlaces.map((place) => mentionRow('place', place.id, place.name, place.category))}
            {linkedOutlines.map((item) => mentionRow('outline', item.id, item.title, LEVEL_LABEL[item.level]))}
          </div>
        </div>
      )}

      <div className="assoc-section">
        <div className="assoc-label">
          <span className="row gap-4">
            <ListTree size={12} /> 已创建的结构
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setView('structure')}>
            查看全部 <ArrowUpRight size={11} />
          </button>
        </div>
        <div className="col" style={{ gap: 1 }}>
          {structure.map((node) => (
            <button
              key={node.id}
              className={cx('entity-row', node.id === outline?.id && 'active')}
              onClick={() => openInline('outline', node.id)}
              style={node.id === outline?.id ? { background: 'var(--paper-3)' } : undefined}
            >
              <span className={`level-mark ${node.level}`} />
              <span className="grow">{node.title}</span>
              <span className="badge">{LEVEL_LABEL[node.level]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="assoc-section">
        <div className="assoc-label">
          <span className="row gap-4">
            <Plus size={12} /> 快速创建
          </span>
        </div>
        <div className="row wrap gap-4">
          <button
            className="chip"
            onClick={() => {
              const id = addEvent({ title: '新事件' })
              if (id) openInline('event', id)
            }}
          >
            <GitBranch size={11} /> 事件
          </button>
          <button
            className="chip"
            onClick={() => {
              const id = addCharacter('新人物')
              if (id) openInline('character', id)
            }}
          >
            <Users size={11} /> 人物
          </button>
          <button
            className="chip"
            onClick={() => {
              setView('maps')
              setMobileSheet('none')
            }}
          >
            <MapPin size={11} /> 地图
          </button>
        </div>
      </div>
    </div>
  )
}
