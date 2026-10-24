import { useMemo, useState } from 'react'
import {
  AtSign,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  Flag,
  GitBranch,
  ImagePlus,
  Link2,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { useApp } from '../store'
import type { EntityType, OutlineNode, StoryEvent } from '../types'
import { api } from '../lib/api'
import { prepareImage } from '../lib/image'
import { eventStatusLabel, formatDate, formatNumber, mediaUrl, placeCategoryOptions, timelinePalette } from '../lib/utils'
import { formatEventTime } from '../lib/time'
import { MiniEditor } from './RichText'
import { Confirm, Dropdown, Empty, Field, Modal, TagInput } from './ui'

function useNavigate() {
  const openChapter = useApp((s) => s.openChapter)
  const setView = useApp((s) => s.setView)
  const selectEvent = useApp((s) => s.selectEvent)
  const selectOutline = useApp((s) => s.selectOutline)
  const openEntity = useApp((s) => s.openEntity)
  const selectMap = useApp((s) => s.selectMap)
  const selectPlace = useApp((s) => s.selectPlace)
  return {
    chapter: (id: string, term?: string) => void openChapter(id, term || null),
    event: (id: string) => {
      setView('timeline')
      selectEvent(id)
      openEntity('event', id)
    },
    outline: (id: string) => {
      setView('structure')
      selectOutline(id)
      useApp.getState().closePeek()
    },
    place: (id: string) => {
      const place = useApp.getState().places.find((p) => p.id === id)
      setView('maps')
      if (place) {
        selectMap(place.mapId)
        selectPlace(id)
      }
      useApp.getState().closePeek()
    },
  }
}

export function CharacterDetail({ id }: { id: string }) {
  const character = useApp((s) => s.characters.find((c) => c.id === id))
  const characters = useApp((s) => s.characters)
  const chapters = useApp((s) => s.chapters)
  const contents = useApp((s) => s.contents)
  const events = useApp((s) => s.events)
  const outlines = useApp((s) => s.outlines)
  const places = useApp((s) => s.places)
  const updateCharacter = useApp((s) => s.updateCharacter)
  const deleteCharacter = useApp((s) => s.deleteCharacter)
  const projectId = useApp((s) => s.project?.id)
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState(false)

  const appearances = useMemo(() => {
    if (!character) return []
    const names = [character.name, ...(character.aliases || [])].map((n) => n.trim()).filter(Boolean)
    const match = (text: string) => names.some((name) => name && text.includes(name))
    const list: Array<{ key: string; kind: string; title: string; sub: string; onClick: () => void }> = []
    chapters.forEach((chapter) => {
      const content = contents[chapter.id]
      if (content && (match(content.plainText) || content.plainText.includes(`@${character.name}`))) {
        list.push({
          key: `c-${chapter.id}`,
          kind: '正文',
          title: chapter.title,
          sub: `${formatNumber(chapter.wordCount)} 字`,
          onClick: () => navigate.chapter(chapter.id, character.name),
        })
      }
    })
    events.forEach((event) => {
      if (event.characterIds?.includes(character.id) || match(event.plainText || '')) {
        list.push({
          key: `e-${event.id}`,
          kind: '事件',
          title: event.title,
          sub: eventStatusLabel(event.status),
          onClick: () => navigate.event(event.id),
        })
      }
    })
    outlines.forEach((outline) => {
      if (outline.characterIds?.includes(character.id) || match(outline.plainText || '')) {
        list.push({
          key: `o-${outline.id}`,
          kind: outline.level === 'master' ? '总纲' : outline.level === 'volume' ? '大纲' : '章纲',
          title: outline.title,
          sub: '',
          onClick: () => navigate.outline(outline.id),
        })
      }
    })
    places.forEach((place) => {
      if (place.characterIds?.includes(character.id)) {
        list.push({
          key: `p-${place.id}`,
          kind: '地点',
          title: place.name,
          sub: place.category,
          onClick: () => navigate.place(place.id),
        })
      }
    })
    return list
  }, [character, chapters, contents, events, outlines, places])

  if (!character) return <Empty>人物不存在或已被删除</Empty>
  const patch = (value: Partial<typeof character>) => updateCharacter(character.id, value)

  const uploadAvatar = async (file: File) => {
    if (!projectId) return
    setUploading(true)
    try {
      const prepared = await prepareImage(file, { maxDim: 720 })
      const result = await api.upload(projectId, prepared.blob, 'avatar', prepared.ext)
      patch({ avatar: result.path })
    } catch {
      useApp.getState().toast('头像上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="char-main">
      <div className="char-hero">
        <label className="char-avatar lg" title="上传头像">
          {character.avatar ? <img src={mediaUrl(character.avatar)} alt="" /> : character.name.slice(0, 2) || <Users size={20} />}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void uploadAvatar(file)
              event.target.value = ''
            }}
          />
          {uploading && (
            <span
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,.35)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <span className="spinner" />
            </span>
          )}
        </label>
        <div className="char-hero-main">
          <input
            className="char-name-input"
            value={character.name}
            placeholder="人物姓名"
            onChange={(event) => patch({ name: event.target.value })}
          />
          <div className="row gap-6 small muted" style={{ marginTop: 3, flexWrap: 'wrap' }}>
            <span className="badge badge-accent">{character.role || '待定角色'}</span>
            <span>{character.faction || '无所属'}</span>
            {character.identity && <span>· {character.identity}</span>}
          </div>
        </div>
        <Dropdown
          trigger={
            <button className="btn btn-icon btn-ghost" title="更多">
              <span style={{ letterSpacing: 1, fontWeight: 700 }}>···</span>
            </button>
          }
        >
          <button className="menu-item danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} /> 删除人物
          </button>
        </Dropdown>
      </div>

      <div className="form-grid" style={{ marginBottom: 12 }}>
        <Field label="别名 / 称呼">
          <TagInput value={character.aliases} onChange={(aliases) => patch({ aliases })} placeholder="如：阿昭、小昭" />
        </Field>
        <Field label="身份定位">
          <input className="input" value={character.identity} onChange={(e) => patch({ identity: e.target.value })} placeholder="主角 / 反派 / 引路人" />
        </Field>
        <Field label="阵营势力">
          <input className="input" value={character.faction} onChange={(e) => patch({ faction: e.target.value })} />
        </Field>
        <Field label="性别">
          <input className="input" value={character.gender} onChange={(e) => patch({ gender: e.target.value })} />
        </Field>
        <Field label="年龄">
          <input className="input" value={character.age} onChange={(e) => patch({ age: e.target.value })} />
        </Field>
        <Field label="角色标签">
          <TagInput value={character.tags} onChange={(tags) => patch({ tags })} placeholder="如：成长型、傲娇" />
        </Field>
      </div>

      <details className="detail-section" open>
        <summary>
          人物内核
          <ChevronRight size={14} className="chev" />
        </summary>
        <div className="detail-section-body">
          <Field label="外貌特征">
            <textarea className="textarea" rows={2} value={character.appearance} onChange={(e) => patch({ appearance: e.target.value })} />
          </Field>
          <Field label="性格">
            <textarea className="textarea" rows={2} value={character.personality} onChange={(e) => patch({ personality: e.target.value })} />
          </Field>
          <Field label="目标与动机">
            <textarea className="textarea" rows={2} value={character.goal} onChange={(e) => patch({ goal: e.target.value })} />
          </Field>
          <Field label="能力 / 特长">
            <textarea className="textarea" rows={2} value={character.abilities} onChange={(e) => patch({ abilities: e.target.value })} />
          </Field>
        </div>
      </details>

      <details className="detail-section">
        <summary>
          背景与成长
          <ChevronRight size={14} className="chev" />
        </summary>
        <div className="detail-section-body">
          <Field label="背景故事">
            <textarea className="textarea" rows={4} value={character.background} onChange={(e) => patch({ background: e.target.value })} />
          </Field>
          <Field label="秘密">
            <textarea className="textarea" rows={2} value={character.secret} onChange={(e) => patch({ secret: e.target.value })} />
          </Field>
          <Field label="人物弧光">
            <textarea className="textarea" rows={3} value={character.arc} onChange={(e) => patch({ arc: e.target.value })} />
          </Field>
          <Field label="其他备注">
            <textarea className="textarea" rows={2} value={character.notes} onChange={(e) => patch({ notes: e.target.value })} />
          </Field>
        </div>
      </details>

      <details className="detail-section" open>
        <summary>
          人物关系
          <span className="row gap-4">
            <button
              className="btn btn-sm btn-ghost"
              onClick={(event) => {
                event.preventDefault()
                const target = characters.find((c) => c.id !== character.id)
                if (!target) return
                patch({
                  relationships: [...(character.relationships || []), { targetId: target.id, type: '关系', note: '' }],
                })
              }}
            >
              <Plus size={12} /> 添加
            </button>
            <ChevronRight size={14} className="chev" />
          </span>
        </summary>
        <div className="detail-section-body">
          {(character.relationships || []).length === 0 && (
            <div className="small muted">还没有建立关系。点击右上角「添加」关联其他人物。</div>
          )}
          {(character.relationships || []).map((relationship, index) => (
            <div className="rel-row" key={`${relationship.targetId}-${index}`}>
              <select
                className="select sm"
                value={relationship.targetId}
                onChange={(event) =>
                  patch({
                    relationships: character.relationships.map((item, i) =>
                      i === index ? { ...item, targetId: event.target.value } : item,
                    ),
                  })
                }
              >
                {characters
                  .filter((c) => c.id !== character.id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
              <input
                className="input sm"
                style={{ maxWidth: 78 }}
                value={relationship.type}
                placeholder="关系"
                onChange={(event) =>
                  patch({
                    relationships: character.relationships.map((item, i) =>
                      i === index ? { ...item, type: event.target.value } : item,
                    ),
                  })
                }
              />
              <button
                className="tool-btn"
                title="查看人物"
                onClick={() => useApp.getState().openEntity('character', relationship.targetId)}
              >
                <ChevronRight size={14} />
              </button>
              <button
                className="tool-btn"
                title="移除"
                onClick={() =>
                  patch({ relationships: character.relationships.filter((_item, i) => i !== index) })
                }
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      </details>

      <div className="detail-section">
        <div className="detail-card-head">
          出场索引
          <span className="badge">{appearances.length}</span>
        </div>
        <div style={{ padding: 6 }}>
          {appearances.length === 0 && <div className="small muted" style={{ padding: 8 }}>正文中出现名字、或在事件/纲目中关联后，会在这里汇总。</div>}
          {appearances.slice(0, 40).map((item) => (
            <button key={item.key} className="appearance-row" onClick={item.onClick}>
              <span className="badge">{item.kind}</span>
              <span className="grow">{item.title}</span>
              <span className="muted small">{item.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="small muted" style={{ marginTop: 10 }}>
        创建于 {formatDate(character.createdAt)} · 最近更新 {formatDate(character.updatedAt)}
      </div>

      <Confirm
        open={confirmDelete}
        title="删除人物"
        message={`确定删除「${character.name}」吗？会同时解除事件、纲目、地点中的关联。`}
        confirmText="删除"
        onConfirm={() => deleteCharacter(character.id)}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

function LinkPicker({
  items,
  onPick,
  placeholder,
}: {
  items: Array<{ id: string; label: string; sub?: string }>
  onPick: (id: string) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const filtered = items.filter((item) =>
    !query.trim() || `${item.label} ${item.sub || ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <div className="link-picker">
      <div className="search-box" style={{ marginBottom: 6, height: 30 }}>
        <Search size={13} />
        <input value={query} placeholder={placeholder || '搜索…'} onChange={(event) => setQuery(event.target.value)} autoFocus />
      </div>
      <div className="col" style={{ gap: 1 }}>
        {filtered.slice(0, 40).map((item) => (
          <button
            key={item.id}
            className="entity-row"
            onClick={() => {
              onPick(item.id)
              setQuery('')
            }}
          >
            <span className="dot" />
            <span className="grow">{item.label}</span>
            {item.sub && <span className="badge">{item.sub}</span>}
          </button>
        ))}
        {filtered.length === 0 && <div className="small muted" style={{ padding: 6 }}>没有匹配项</div>}
      </div>
    </div>
  )
}

export function EventDetail({ id }: { id: string }) {
  const event = useApp((s) => s.events.find((e) => e.id === id))
  const events = useApp((s) => s.events)
  const timelines = useApp((s) => s.timelines)
  const characters = useApp((s) => s.characters)
  const places = useApp((s) => s.places)
  const outlines = useApp((s) => s.outlines)
  const calendar = useApp((s) => s.project?.calendar)
  const updateEvent = useApp((s) => s.updateEvent)
  const deleteEvent = useApp((s) => s.deleteEvent)
  const addBranch = useApp((s) => s.addBranch)
  const [picker, setPicker] = useState<'character' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [branchName, setBranchName] = useState('')
  const [branchColor, setBranchColor] = useState(timelinePalette()[1])
  const navigate = useNavigate()

  if (!event || !calendar) return <Empty>事件不存在或已被删除</Empty>
  const patch = (value: Partial<StoryEvent>) => updateEvent(event.id, value)
  const time = event.time || {}
  const setTime = (value: Partial<typeof time>) => patch({ time: { ...time, ...value } })
  const timeline = timelines.find((t) => t.id === event.timelineId)
  const parentTimeline = timeline?.parentTimelineId ? timelines.find((t) => t.id === timeline.parentTimelineId) : null
  const relatedOutlines = outlines.filter((outline) => outline.eventIds?.includes(event.id))

  const timeFields = (
    <div className="col gap-8">
      {calendar.mode === 'date' && (
        <div className="row gap-4 date-fields">
          <Field label="年">
            <input
              className="input sm"
              type="number"
              value={time.y ?? ''}
              onChange={(e) => setTime({ y: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>
          <Field label="月">
            <input
              className="input sm"
              type="number"
              min={1}
              max={calendar.monthsPerYear}
              value={time.m ?? ''}
              onChange={(e) => setTime({ m: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>
          <Field label="日">
            <input
              className="input sm"
              type="number"
              min={1}
              max={calendar.daysPerMonth}
              value={time.d ?? ''}
              onChange={(e) => setTime({ d: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>
          <Field label="时">
            <input
              className="input sm"
              type="number"
              min={0}
              max={calendar.hoursPerDay}
              value={time.h ?? ''}
              onChange={(e) => setTime({ h: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>
        </div>
      )}
      {calendar.mode === 'day' && (
        <div className="row gap-4 date-fields">
          <Field label="第几天">
            <input
              className="input sm"
              type="number"
              value={time.day ?? ''}
              onChange={(e) => setTime({ day: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>
          <Field label="时">
            <input
              className="input sm"
              type="number"
              min={0}
              max={calendar.hoursPerDay}
              value={time.h ?? ''}
              onChange={(e) => setTime({ h: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </Field>
        </div>
      )}
      <Field label="时间备注">
        <input
          className="input sm"
          value={time.label || ''}
          placeholder={calendar.mode === 'free' ? '自由时间描述，如：三年后的雨夜' : '如：清晨、决战前夜'}
          onChange={(e) => setTime({ label: e.target.value })}
        />
      </Field>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={Boolean(time.unscheduled)}
          onChange={(e) => setTime({ unscheduled: e.target.checked })}
        />
        时间未定（排到事件线末尾）
      </label>
    </div>
  )

  return (
    <div className="detail-wrap" style={{ paddingTop: 16 }}>
      <div className="row gap-6" style={{ marginBottom: 6 }}>
        <span className="badge badge-jade">{eventStatusLabel(event.status)}</span>
        {timeline && <span className="badge">{timeline.name}</span>}
        {parentTimeline && (
          <span className="branch-badge">
            <GitBranch size={10} /> 分支自 {parentTimeline.name}
          </span>
        )}
        <div className="grow" />
        <Dropdown
          trigger={
            <button className="btn btn-icon btn-ghost" title="更多">
              <span style={{ letterSpacing: 1, fontWeight: 700 }}>···</span>
            </button>
          }
        >
          <button className="menu-item danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} /> 删除事件
          </button>
        </Dropdown>
      </div>
      <input
        className="detail-title-input"
        value={event.title}
        placeholder="事件名称"
        onChange={(e) => patch({ title: e.target.value })}
      />
      <div className="row gap-6 small muted" style={{ margin: '2px 0 14px' }}>
        <CalendarDays size={12} /> {formatEventTime(event.time, calendar)}
      </div>

      <div className="detail-card">
        <div className="detail-card-head">排布</div>
        <div style={{ padding: 12 }} className="col gap-10">
          <div className="form-grid">
            <Field label="所属事件线">
              <select className="select" value={event.timelineId} onChange={(e) => patch({ timelineId: e.target.value })}>
                {timelines.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="状态">
              <select
                className="select"
                value={event.status}
                onChange={(e) => patch({ status: e.target.value as StoryEvent['status'] })}
              >
                <option value="planned">计划</option>
                <option value="happened">已发生</option>
                <option value="alternate">支线可能</option>
              </select>
            </Field>
            <Field label="发生地点">
              <select
                className="select"
                value={event.locationId || ''}
                onChange={(e) => patch({ locationId: e.target.value || null })}
              >
                <option value="">未指定</option>
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="重要度">
              <select className="select" value={event.importance} onChange={(e) => patch({ importance: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {'★'.repeat(n)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {timeFields}
          {event.locationId && (
            <button className="btn btn-sm" onClick={() => navigate.place(event.locationId!)}>
              <MapPin size={12} /> 在地图上查看地点
            </button>
          )}
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-head">
          事件详情
          <span className="small muted detail-card-hint" style={{ letterSpacing: 0 }}>可用 @ 关联人物与地点</span>
        </div>
        <MiniEditor
          doc={event.content}
          onChange={(content, plainText) => patch({ content, plainText })}
          placeholder="发生了什么？起因、经过、结果，以及留下的伏笔……"
        />
      </div>

      <div className="detail-card">
        <div className="detail-card-head">
          <span className="row gap-4">
            <Users size={13} /> 出场人物
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setPicker(picker ? null : 'character')}>
            <Plus size={12} /> 添加
          </button>
        </div>
        <div style={{ padding: 10 }} className="link-chips">
          {event.characterIds.length === 0 && <span className="small muted">还没有关联人物</span>}
          {event.characterIds.map((cid) => {
            const character = characters.find((c) => c.id === cid)
            if (!character) return null
            return (
              <span key={cid} className="chip active">
                <button
                  style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}
                  onClick={() => useApp.getState().openEntity('character', cid)}
                >
                  {character.name}
                </button>
                <button
                  className="x"
                  style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}
                  onClick={() => patch({ characterIds: event.characterIds.filter((x) => x !== cid) })}
                >
                  <X size={11} />
                </button>
              </span>
            )
          })}
        </div>
        {picker === 'character' && (
          <LinkPicker
            items={characters
              .filter((c) => !event.characterIds.includes(c.id))
              .map((c) => ({ id: c.id, label: c.name, sub: c.role }))}
            onPick={(cid) => {
              patch({ characterIds: [...event.characterIds, cid] })
              setPicker(null)
            }}
          />
        )}
      </div>

      <div className="detail-card">
        <div className="detail-card-head">
          <span className="row gap-4">
            <Flag size={13} /> 出现在纲目
          </span>
          <span className="badge">{relatedOutlines.length}</span>
        </div>
        <div style={{ padding: 6 }}>
          {relatedOutlines.length === 0 && <div className="small muted" style={{ padding: 8 }}>在总纲 / 大纲 / 章纲中关联此事件后会显示在这里。</div>}
          {relatedOutlines.map((outline) => (
            <button key={outline.id} className="appearance-row" onClick={() => navigate.outline(outline.id)}>
              <span className="badge">{outline.level === 'master' ? '总纲' : outline.level === 'volume' ? '大纲' : '章纲'}</span>
              <span className="grow">{outline.title}</span>
              <ChevronRight size={13} />
            </button>
          ))}
        </div>
      </div>

      <div className="row gap-8 wrap">
        <button
          className="btn"
          onClick={() => {
            setBranchName(`${event.title} · 支线`)
            setBranchColor(timelinePalette()[timelines.length % timelinePalette().length])
            setBranchOpen(true)
          }}
        >
          <GitBranch size={14} /> 从此事件创建分支线
        </button>
        {timeline && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              useApp.getState().setView('timeline')
              useApp.getState().toast(`当前事件线：${timeline.name}`)
            }}
          >
            查看事件线
          </button>
        )}
        <div className="grow" />
        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={13} /> 删除
        </button>
      </div>

      <Modal
        open={branchOpen}
        title="创建分支事件线"
        onClose={() => setBranchOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setBranchOpen(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (!branchName.trim()) return
                addBranch(event.id, branchName.trim(), branchColor)
                setBranchOpen(false)
              }}
            >
              创建支线
            </button>
          </>
        }
      >
        <div className="col gap-12">
          <Field label="支线名称">
            <input className="input" autoFocus value={branchName} onChange={(e) => setBranchName(e.target.value)} />
          </Field>
          <Field label="支线颜色">
            <div className="row wrap gap-6">
              {timelinePalette().map((color) => (
                <button
                  key={color}
                  onClick={() => setBranchColor(color)}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: color,
                    border: branchColor === color ? '2px solid var(--ink)' : '2px solid transparent',
                    boxShadow: '0 0 0 1px var(--line)',
                  }}
                />
              ))}
            </div>
          </Field>
          <div className="hint-box">
            支线会从「{event.title}」分叉，作为独立事件线参与时间排序，可在事件线视图并行查看。
          </div>
        </div>
      </Modal>

      <Confirm
        open={confirmDelete}
        title="删除事件"
        message={`确定删除「${event.title}」吗？会同时从纲目和支线引用中移除。`}
        confirmText="删除"
        onConfirm={() => deleteEvent(event.id)}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

export function PlaceDetail({ id }: { id: string }) {
  const place = useApp((s) => s.places.find((p) => p.id === id))
  const map = useApp((s) => (place ? s.maps.find((m) => m.id === place.mapId) : null))
  const characters = useApp((s) => s.characters)
  const events = useApp((s) => s.events)
  const updatePlace = useApp((s) => s.updatePlace)
  const deletePlace = useApp((s) => s.deletePlace)
  const addEvent = useApp((s) => s.addEvent)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [picker, setPicker] = useState(false)
  const navigate = useNavigate()

  if (!place) return <Empty>地点不存在或已被删除</Empty>
  const patch = (value: Partial<typeof place>) => updatePlace(place.id, value)
  const placeEvents = events.filter((event) => event.locationId === place.id)

  return (
    <div className="detail-wrap" style={{ paddingTop: 16 }}>
      <div className="row gap-6" style={{ marginBottom: 6 }}>
        <span className="badge" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', borderColor: 'transparent' }}>
          <MapPin size={10} /> {place.category}
        </span>
        <span className="small muted">{map?.name || '未归属地图'}</span>
        <div className="grow" />
        <Dropdown
          trigger={
            <button className="btn btn-icon btn-ghost" title="更多">
              <span style={{ letterSpacing: 1, fontWeight: 700 }}>···</span>
            </button>
          }
        >
          <button className="menu-item danger" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} /> 删除地点
          </button>
        </Dropdown>
      </div>
      <input
        className="detail-title-input"
        value={place.name}
        placeholder="地点名称"
        onChange={(event) => patch({ name: event.target.value })}
      />
      <div className="row gap-6 small muted" style={{ margin: '2px 0 14px' }}>
        <MapPin size={12} /> 坐标 {place.x.toFixed(1)}%, {place.y.toFixed(1)}%
      </div>

      <div className="form-grid" style={{ marginBottom: 12 }}>
        <Field label="分类">
          <select className="select" value={place.category} onChange={(event) => patch({ category: event.target.value })}>
            {placeCategoryOptions().map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </Field>
        <Field label="标记颜色">
          <div className="row gap-4" style={{ height: 34 }}>
            {timelinePalette().map((color) => (
              <button
                key={color}
                onClick={() => patch({ color })}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: color,
                  border: place.color === color ? '2px solid var(--ink)' : '2px solid transparent',
                  boxShadow: '0 0 0 1px var(--line)',
                }}
              />
            ))}
          </div>
        </Field>
        <Field label="标签" className="full">
          <TagInput value={place.tags} onChange={(tags) => patch({ tags })} placeholder="如：主城、禁地" />
        </Field>
      </div>

      <div className="detail-card">
        <div className="detail-card-head">地点设定</div>
        <MiniEditor
          doc={place.description}
          onChange={(content, plainText) => patch({ description: content, plainText })}
          placeholder="这里的风貌、历史、势力与秘密……"
        />
      </div>

      <div className="detail-card">
        <div className="detail-card-head">
          <span className="row gap-4">
            <Users size={13} /> 相关人物
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setPicker(!picker)}>
            <Plus size={12} /> 添加
          </button>
        </div>
        <div style={{ padding: 10 }} className="link-chips">
          {place.characterIds.length === 0 && <span className="small muted">还没有关联人物</span>}
          {place.characterIds.map((cid) => {
            const character = characters.find((c) => c.id === cid)
            if (!character) return null
            return (
              <span key={cid} className="chip active">
                <button
                  style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}
                  onClick={() => useApp.getState().openEntity('character', cid)}
                >
                  {character.name}
                </button>
                <button
                  className="x"
                  style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}
                  onClick={() => patch({ characterIds: place.characterIds.filter((x) => x !== cid) })}
                >
                  <X size={11} />
                </button>
              </span>
            )
          })}
        </div>
        {picker && (
          <LinkPicker
            items={characters
              .filter((c) => !place.characterIds.includes(c.id))
              .map((c) => ({ id: c.id, label: c.name, sub: c.role }))}
            onPick={(cid) => {
              patch({ characterIds: [...place.characterIds, cid] })
              setPicker(false)
            }}
          />
        )}
      </div>

      <div className="detail-card">
        <div className="detail-card-head">
          <span className="row gap-4">
            <Sparkles size={13} /> 此地发生的事件
          </span>
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => {
              const eventId = addEvent({ locationId: place.id, title: '新事件' })
              if (eventId) navigate.event(eventId)
            }}
          >
            <Plus size={12} /> 新建
          </button>
        </div>
        <div style={{ padding: 6 }}>
          {placeEvents.length === 0 && <div className="small muted" style={{ padding: 8 }}>还没有在此发生的事件。</div>}
          {placeEvents.map((event) => (
            <button key={event.id} className="appearance-row" onClick={() => navigate.event(event.id)}>
              <span className="badge badge-jade">{eventStatusLabel(event.status)}</span>
              <span className="grow">{event.title}</span>
              <ChevronRight size={13} />
            </button>
          ))}
        </div>
      </div>

      <div className="row gap-8">
        <button className="btn btn-sm" onClick={() => navigate.place(place.id)}>
          <MapPin size={13} /> 在地图上定位
        </button>
        <div className="grow" />
        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={13} /> 删除地点
        </button>
      </div>

      <Confirm
        open={confirmDelete}
        title="删除地点"
        message={`确定删除「${place.name}」吗？关联事件会保留，但地点字段会被清空。`}
        confirmText="删除"
        onConfirm={() => deletePlace(place.id)}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}

const OUTLINE_FIELD_KEYS = ['核心冲突', '剧情目标', '关键转折', '伏笔与回收']

export function OutlineDetail({ id }: { id: string }) {
  const outline = useApp((s) => s.outlines.find((o) => o.id === id))
  const outlines = useApp((s) => s.outlines)
  const events = useApp((s) => s.events)
  const characters = useApp((s) => s.characters)
  const chapters = useApp((s) => s.chapters)
  const updateOutline = useApp((s) => s.updateOutline)
  const navigate = useNavigate()
  const [eventPicker, setEventPicker] = useState(false)
  const [charPicker, setCharPicker] = useState(false)

  if (!outline) return <Empty>纲目不存在或已被删除</Empty>
  const patch = (value: Partial<OutlineNode>) => updateOutline(outline.id, value)
  const linkedEvents = outline.eventIds.map((eid) => events.find((e) => e.id === eid)).filter(Boolean) as StoryEvent[]
  const linkedCharacters = outline.characterIds
    .map((cid) => characters.find((c) => c.id === cid))
    .filter(Boolean) as typeof characters
  const childOutlines = outlines.filter((o) => o.parentId === outline.id).sort((a, b) => a.order - b.order)
  const chapter = outline.chapterId ? chapters.find((c) => c.id === outline.chapterId) : null
  const levelLabel = outline.level === 'master' ? '总纲' : outline.level === 'volume' ? '大纲' : '章纲'

  const toggleEvent = (eid: string) =>
    patch({
      eventIds: outline.eventIds.includes(eid)
        ? outline.eventIds.filter((x) => x !== eid)
        : [...outline.eventIds, eid],
    })

  return (
    <div className="detail-wrap">
      <div className="detail-head">
        <div className="grow">
          <div className="row gap-6" style={{ marginBottom: 5 }}>
            <span className={`badge ${outline.level === 'master' ? 'badge-accent' : outline.level === 'volume' ? 'badge-gold' : 'badge-jade'}`}>
              {levelLabel}
            </span>
            {chapter && <span className="badge">绑定 {chapter.title}</span>}
            {outline.updatedAt && <span className="small muted">更新于 {formatDate(outline.updatedAt)}</span>}
          </div>
          <input
            className="detail-title-input"
            value={outline.title}
            placeholder={`${levelLabel}标题`}
            onChange={(event) => patch({ title: event.target.value })}
          />
        </div>
        {chapter && (
          <button className="btn" onClick={() => navigate.chapter(chapter.id)}>
            <ExternalLink size={14} /> 写正文
          </button>
        )}
      </div>

      <div className="detail-card">
        <div className="detail-card-head">一句话梗概</div>
        <div style={{ padding: 10 }}>
          <textarea
            className="textarea"
            style={{ border: 0, background: 'transparent', padding: 2, minHeight: 44 }}
            rows={2}
            value={outline.summary}
            placeholder="用一两句话概括这一段的核心……"
            onChange={(event) => patch({ summary: event.target.value })}
          />
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-head">创作要点</div>
        <div className="fields-grid">
          {OUTLINE_FIELD_KEYS.map((key) => (
            <Field key={key} label={key}>
              <input
                className="input"
                value={outline.fields?.[key] || ''}
                onChange={(event) => patch({ fields: { ...outline.fields, [key]: event.target.value } })}
              />
            </Field>
          ))}
        </div>
      </div>

      <div className="detail-card">
        <div className="detail-card-head">
          详细纲目
          <span className="small muted" style={{ letterSpacing: 0 }}>点「关联」插入事件/人物，事件名可点开</span>
        </div>
        <MiniEditor
          doc={outline.content}
          onChange={(content, plainText) => patch({ content, plainText })}
          placeholder="分场、情节推进、情绪节奏、伏笔……"
        />
      </div>

      <div className="detail-card">
        <div className="detail-card-head">
          <span className="row gap-4">
            <Flag size={13} /> 关联事件
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setEventPicker(!eventPicker)}>
            <Plus size={12} /> 添加
          </button>
        </div>
        <div className="link-list">
          {linkedEvents.length === 0 && <div className="small muted" style={{ padding: 5 }}>还没有关联事件。双击事件名可在事件线中打开详情。</div>}
          {linkedEvents.map((event) => (
            <div key={event.id} className="entity-row" style={{ cursor: 'default' }}>
              <span className="dot" style={{ background: 'var(--jade)' }} />
              <button
                className="grow"
                style={{ border: 0, background: 'transparent', textAlign: 'left', color: 'inherit', padding: 0 }}
                onClick={() => navigate.event(event.id)}
              >
                {event.title}
              </button>
              <span className="badge">{eventStatusLabel(event.status)}</span>
              <button className="tool-btn" title="移除" onClick={() => toggleEvent(event.id)}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
        {eventPicker && (
          <LinkPicker
            items={events
              .filter((event) => !outline.eventIds.includes(event.id))
              .map((event) => ({ id: event.id, label: event.title, sub: eventStatusLabel(event.status) }))}
            onPick={(eid) => {
              toggleEvent(eid)
              setEventPicker(false)
            }}
          />
        )}
      </div>

      <div className="detail-card">
        <div className="detail-card-head">
          <span className="row gap-4">
            <Users size={13} /> 关联人物
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setCharPicker(!charPicker)}>
            <Plus size={12} /> 添加
          </button>
        </div>
        <div style={{ padding: 8 }} className="link-chips">
          {linkedCharacters.length === 0 && <span className="small muted">还没有关联人物</span>}
          {linkedCharacters.map((character) => (
            <span key={character.id} className="chip active">
              <button
                style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}
                onClick={() => useApp.getState().openEntity('character', character.id)}
              >
                {character.name}
              </button>
              <button
                className="x"
                style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}
                onClick={() => patch({ characterIds: outline.characterIds.filter((x) => x !== character.id) })}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        {charPicker && (
          <LinkPicker
            items={characters
              .filter((character) => !outline.characterIds.includes(character.id))
              .map((character) => ({ id: character.id, label: character.name, sub: character.role }))}
            onPick={(cid) => {
              patch({ characterIds: [...outline.characterIds, cid] })
              setCharPicker(false)
            }}
          />
        )}
      </div>

      {childOutlines.length > 0 && (
        <div className="detail-card">
          <div className="detail-card-head">下级纲目</div>
          <div className="link-list">
            {childOutlines.map((child) => (
              <button key={child.id} className="entity-row" onClick={() => navigate.outline(child.id)}>
                <span className={`level-mark ${child.level}`} />
                <span className="grow">{child.title}</span>
                <ChevronRight size={13} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="hint-box row gap-6" style={{ marginTop: 4 }}>
        <Link2 size={14} />
        在正文编辑器里用「关联」插入事件，也能建立双向联系；右栏会自动汇总本章的相关事件与人物。
      </div>

      <div className="inline-links mobile-only" style={{ marginTop: 14 }}>
        <div className="field-label" style={{ marginBottom: 6 }}>快速打开</div>
        <div className="row wrap gap-4">
          {linkedEvents.map((event) => (
            <button key={event.id} className="chip chip-event" onClick={() => navigate.event(event.id)}>
              {event.title}
            </button>
          ))}
          {linkedCharacters.map((character) => (
            <button
              key={character.id}
              className="chip"
              onClick={() => useApp.getState().openEntity('character', character.id)}
            >
              {character.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function EntityDetail({ type, id }: { type: EntityType; id: string }) {
  if (type === 'character') return <CharacterDetail id={id} />
  if (type === 'event') return <EventDetail id={id} />
  if (type === 'place') return <PlaceDetail id={id} />
  if (type === 'outline') return <OutlineDetail id={id} />
  return <Empty>暂不支持在此查看该类型</Empty>
}
