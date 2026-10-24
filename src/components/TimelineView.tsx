import { useMemo, useState } from 'react'
import {
  CalendarDays,
  Eye,
  EyeOff,
  GitBranch,
  MapPin,
  MoreHorizontal,
  PanelRightClose,
  Plus,
  Settings2,
  Star,
  Trash2,
  Users,
} from 'lucide-react'
import { useApp } from '../store'
import { isNavActivation } from '../lib/arrowNav'
import type { Timeline } from '../types'
import { compareEvents, eventColumnKey, eventColumnLabel, eventSortKey, formatEventTime } from '../lib/time'
import { cx, eventStatusLabel, formatNumber, inertAttr, timelinePalette } from '../lib/utils'
import { useIsNarrow } from '../lib/useMedia'
import { EventDetail } from './details'
import PanelEdge from './PanelEdge'
import { Confirm, Dropdown, Empty, Field, Modal } from './ui'

interface LaneDraft {
  mode: 'create' | 'edit'
  id?: string
  name: string
  description: string
  color: string
}

export default function TimelineView() {
  const timelines = useApp((s) => s.timelines)
  const events = useApp((s) => s.events)
  const characters = useApp((s) => s.characters)
  const places = useApp((s) => s.places)
  const calendar = useApp((s) => s.project?.calendar)
  const selectedEventId = useApp((s) => s.selectedEventId)
  const selectEvent = useApp((s) => s.selectEvent)
  const addEvent = useApp((s) => s.addEvent)
  const addTimeline = useApp((s) => s.addTimeline)
  const updateTimeline = useApp((s) => s.updateTimeline)
  const deleteTimeline = useApp((s) => s.deleteTimeline)
  const mobileSheet = useApp((s) => s.mobileSheet)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const setSettingsOpen = useApp((s) => s.setSettingsOpen)
  const rightOpen = useApp((s) => s.rightOpen)
  const setRightOpen = useApp((s) => s.setRightOpen)
  const leftOpen = useApp((s) => s.leftOpen)

  const closeRight = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) setMobileSheet('none')
    else setRightOpen(false)
  }

  const narrow = useIsNarrow()

  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [laneDraft, setLaneDraft] = useState<LaneDraft | null>(null)
  const [deleteLane, setDeleteLane] = useState<Timeline | null>(null)

  const lanes = useMemo(() => [...timelines].sort((a, b) => a.order - b.order), [timelines])
  const visibleLanes = lanes.filter((lane) => !hidden.has(lane.id))
  const selectedEvent = events.find((event) => event.id === selectedEventId) || null

  const groups = useMemo(() => {
    if (!calendar) return []
    const map = new Map<string, { key: string; sort: number; label: string; events: typeof events }>()
    events.forEach((event) => {
      const key = eventColumnKey(event, calendar)
      const sort = eventSortKey(event.time, calendar, event.order)
      const current = map.get(key)
      if (current) {
        current.events.push(event)
      } else {
        map.set(key, { key, sort, label: eventColumnLabel(event, calendar), events: [event] })
      }
    })
    return [...map.values()].sort((a, b) => {
      if (a.sort === b.sort) return 0
      return a.sort - b.sort
    })
  }, [events, calendar])

  if (!calendar) return null

  const toggleLane = (id: string) => {
    setHidden((state) => {
      const next = new Set(state)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const newEvent = (laneId?: string) => {
    const target = laneId || visibleLanes[0]?.id || lanes[0]?.id || 'main'
    const id = addEvent({ timelineId: target })
    if (id) {
      selectEvent(id)
      setMobileSheet('right')
    }
  }

  const openLaneEditor = (lane?: Timeline) => {
    if (lane) {
      setLaneDraft({
        mode: 'edit',
        id: lane.id,
        name: lane.name,
        description: lane.description || '',
        color: lane.color,
      })
    } else {
      setLaneDraft({
        mode: 'create',
        name: `事件线${timelines.length + 1}`,
        description: '',
        color: timelinePalette()[timelines.length % timelinePalette().length],
      })
    }
  }

  const saveLane = () => {
    if (!laneDraft || !laneDraft.name.trim()) return
    if (laneDraft.mode === 'create') {
      const id = addTimeline(laneDraft.name.trim())
      if (id) updateTimeline(id, { color: laneDraft.color, description: laneDraft.description })
    } else if (laneDraft.id) {
      updateTimeline(laneDraft.id, {
        name: laneDraft.name.trim(),
        color: laneDraft.color,
        description: laneDraft.description,
      })
    }
    setLaneDraft(null)
  }

  return (
    <div className="view-root">
      <aside
        className={cx(
          'side-panel left-panel',
          !leftOpen && 'is-collapsed',
          mobileSheet === 'left' && 'mobile-open',
        )}
        {...inertAttr(mobileSheet !== 'left' && (narrow || !leftOpen))}
      >
        <div className="panel-head">
          <div className="panel-title">
            <GitBranch size={14} /> 事件线
          </div>
          <div className="panel-actions">
            <button className="btn btn-sm btn-ghost" onClick={() => openLaneEditor()} title="新建事件线">
              <Plus size={13} /> 事件线
            </button>
          </div>
        </div>
        <div className="panel-body flush scroll-thin">
          <div style={{ padding: 8 }} className="col gap-4">
            {lanes.map((lane) => {
              const isHidden = hidden.has(lane.id)
              const count = events.filter((event) => event.timelineId === lane.id).length
              const parent = lane.parentTimelineId ? timelines.find((item) => item.id === lane.parentTimelineId) : null
              return (
                <div key={lane.id} className="row" style={{ gap: 0, opacity: isHidden ? 0.45 : 1 }}>
                  <button className="entity-row grow" onClick={() => toggleLane(lane.id)} title={isHidden ? '显示' : '隐藏'}>
                    <span className="lane-dot" style={{ background: lane.color }} />
                    <span className="grow">
                      {lane.name}
                      {parent && (
                        <span className="branch-badge" style={{ marginLeft: 6 }}>
                          分支
                        </span>
                      )}
                    </span>
                    <span className="badge">{count}</span>
                  </button>
                  <button className="top-icon" style={{ width: 26, height: 26 }} title={isHidden ? '显示' : '隐藏'} onClick={() => toggleLane(lane.id)}>
                    {isHidden ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                  <Dropdown
                    trigger={
                      <button className="top-icon" style={{ width: 24, height: 26 }} title="事件线操作">
                        <MoreHorizontal size={13} />
                      </button>
                    }
                  >
                    <button className="menu-item" onClick={() => openLaneEditor(lane)}>
                      编辑事件线
                    </button>
                    <button className="menu-item" onClick={() => newEvent(lane.id)}>
                      在此线新建事件
                    </button>
                    {lane.id !== 'main' && (
                      <>
                        <div className="menu-sep" />
                        <button className="menu-item danger" onClick={() => setDeleteLane(lane)}>
                          <Trash2 size={13} /> 删除事件线
                        </button>
                      </>
                    )}
                  </Dropdown>
                </div>
              )
            })}
            {lanes.length === 0 && <Empty>还没有事件线</Empty>}
          </div>
          <div className="assoc-section" style={{ padding: 12 }}>
            <div className="hint-box">
              主线与支线会按设定时间自动排序。双击/点击事件卡片即可查看与编辑；在事件详情里可从任意事件分叉出新支线。
            </div>
          </div>
        </div>
        <div className="panel-foot">
          <div className="spread small muted">
            <span>{visibleLanes.length}/{lanes.length} 条线</span>
            <span>{formatNumber(events.length)} 个事件</span>
          </div>
        </div>
      </aside>
      <PanelEdge side="left" label="事件线" />

      <main className="center-pane">
        <div className="timeline-toolbar">
          <button className="btn btn-sm btn-primary" onClick={() => newEvent()}>
            <Plus size={13} /> 新建事件
          </button>
          <button className="btn btn-sm" onClick={() => openLaneEditor()}>
            <GitBranch size={13} /> 新建事件线
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSettingsOpen(true)} title="时间体系设置">
            <Settings2 size={13} /> 历法
          </button>
          <div className="grow" />
          <span className="row gap-4 small muted desktop-only">
            <CalendarDays size={12} />
            {calendar.mode === 'date'
              ? `${calendar.era || ''}历 · 每年 ${calendar.monthsPerYear} 月 / 每月 ${calendar.daysPerMonth} 天`
              : calendar.mode === 'day'
                ? '按第 N 天排序'
                : '自由排序'}
          </span>
          {hidden.size > 0 && (
            <button className="btn btn-sm btn-ghost" onClick={() => setHidden(new Set())}>
              显示全部
            </button>
          )}
        </div>

        <div className="tl-scroll scroll-thin">
          <div
            className="tl-grid"
            style={{
              gridTemplateColumns: `var(--tl-time-w, 118px) repeat(${Math.max(visibleLanes.length, 1)}, minmax(var(--tl-lane-w, 220px), 1fr))`,
            }}
          >
            <div className="tl-corner">时间 / 事件线</div>
            {visibleLanes.map((lane) => {
              const laneEvents = events.filter((event) => event.timelineId === lane.id)
              const parent = lane.parentTimelineId ? timelines.find((item) => item.id === lane.parentTimelineId) : null
              const forkEvent = lane.forkEventId ? events.find((event) => event.id === lane.forkEventId) : null
              return (
                <div className="tl-lane-head" key={lane.id}>
                  <div className="lane-title-row">
                    <span className="lane-dot" style={{ background: lane.color }} />
                    <span className="lane-name">{lane.name}</span>
                    <button
                      className="top-icon"
                      style={{ width: 23, height: 23 }}
                      title="在此事件线新建事件"
                      onClick={() => newEvent(lane.id)}
                    >
                      <Plus size={13} />
                    </button>
                    <Dropdown
                      trigger={
                        <button className="top-icon" style={{ width: 23, height: 23 }} title="事件线操作">
                          <MoreHorizontal size={13} />
                        </button>
                      }
                    >
                      <button className="menu-item" onClick={() => openLaneEditor(lane)}>
                        编辑事件线
                      </button>
                      {lane.id !== 'main' && (
                        <button className="menu-item danger" onClick={() => setDeleteLane(lane)}>
                          <Trash2 size={13} /> 删除事件线
                        </button>
                      )}
                    </Dropdown>
                  </div>
                  <div className="lane-sub">
                    <span>{laneEvents.length} 事件</span>
                    {(parent || forkEvent) && (
                      <span className="branch-badge">
                        <GitBranch size={9} />
                        {forkEvent ? `分叉自 ${forkEvent.title}` : `隶属 ${parent?.name}`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}

            {groups.map((group, rowIndex) => (
              <div key={group.key} style={{ display: 'contents' }}>
                <div className={cx('tl-time', group.key === 'unscheduled' && 'tl-unscheduled-label')} title={group.label}>
                  {group.key === 'unscheduled' ? '未定时间' : group.label}
                </div>
                {visibleLanes.map((lane) => {
                  const cellEvents = group.events
                    .filter((event) => event.timelineId === lane.id)
                    .sort((a, b) => compareEvents(a, b, calendar))
                  return (
                    <div key={`${group.key}-${lane.id}`} className={cx('tl-cell', rowIndex % 2 === 1 && 'alt-row')}>
                      {cellEvents.length === 0 && <span className="tl-empty-lane">·</span>}
                      {cellEvents.map((event) => {
                        const location = places.find((place) => place.id === event.locationId)
                        const characterCount = event.characterIds?.length || 0
                        return (
                          <button
                            key={event.id}
                            className={cx('tl-card', event.id === selectedEventId && 'active')}
                            style={{ borderLeftColor: lane.color }}
                            data-nav-switch
                            onClick={() => {
                              selectEvent(event.id)
                              if (!isNavActivation()) setMobileSheet('right')
                            }}
                          >
                            <span className="tl-card-title">
                              {event.importance >= 4 && <Star size={11} className="imp" fill="currentColor" />}
                              <span>{event.title}</span>
                            </span>
                            <span className="tl-card-meta">
                              <span className={cx('badge', event.status === 'happened' ? 'badge-jade' : '')}>
                                {eventStatusLabel(event.status)}
                              </span>
                              {event.time?.label && <span>{event.time.label}</span>}
                              {location && (
                                <span className="row gap-4" style={{ gap: 3 }}>
                                  <MapPin size={10} /> {location.name}
                                </span>
                              )}
                              {characterCount > 0 && (
                                <span className="row gap-4" style={{ gap: 3 }}>
                                  <Users size={10} /> {characterCount}
                                </span>
                              )}
                            </span>
                          </button>
                        )
                      })}
                      {!cellEvents.length && (
                        <button className="tl-add" onClick={() => newEvent(lane.id)}>
                          <Plus size={11} /> 事件
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {visibleLanes.length === 0 && (
            <Empty icon={<EyeOff size={26} />} title="所有事件线都被隐藏了">
              在左侧点击事件线右侧的眼睛图标，重新显示。
            </Empty>
          )}
          {events.length === 0 && visibleLanes.length > 0 && (
            <Empty
              icon={<GitBranch size={26} />}
              title="还没有事件"
              action={
                <button className="btn btn-primary btn-sm" onClick={() => newEvent()}>
                  <Plus size={13} /> 创建第一个事件
                </button>
              }
            >
              事件会按设定时间自动排列；同一时间点可以横向查看各条事件线。
            </Empty>
          )}
        </div>
      </main>
      <PanelEdge side="right" label="事件详情" />

      <aside
        className={cx(
          'side-panel right-panel',
          !rightOpen && 'is-collapsed',
          mobileSheet === 'right' && 'mobile-open',
        )}
        {...inertAttr(mobileSheet !== 'right' && (narrow || !rightOpen))}
      >
        <div className="panel-head">
          <div className="panel-title">
            <CalendarDays size={14} /> 事件详情
          </div>
          <div className="row gap-6">
            {selectedEvent && <span className="badge panel-head-date">{formatEventTime(selectedEvent.time, calendar)}</span>}
            <button className="top-icon panel-collapse" title="收起侧栏" onClick={closeRight}>
              <PanelRightClose size={14} />
            </button>
          </div>
        </div>
        <div className="panel-body scroll-thin" style={{ padding: 0 }}>
          {selectedEvent ? (
            <EventDetail key={selectedEvent.id} id={selectedEvent.id} />
          ) : (
            <Empty
              icon={<GitBranch size={26} />}
              title="选择一个事件"
              action={
                <button className="btn btn-sm" onClick={() => newEvent()}>
                  <Plus size={12} /> 新建事件
                </button>
              }
            >
              点击事件卡片查看详情、编辑时间、关联人物与地点，或从此事件创建分支线。
            </Empty>
          )}
        </div>
      </aside>

      <Modal
        open={Boolean(laneDraft)}
        title={laneDraft?.mode === 'create' ? '新建事件线' : '编辑事件线'}
        onClose={() => setLaneDraft(null)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setLaneDraft(null)}>
              取消
            </button>
            <button className="btn btn-primary" onClick={saveLane} disabled={!laneDraft?.name.trim()}>
              保存
            </button>
          </>
        }
      >
        {laneDraft && (
          <div className="col gap-12">
            <Field label="名称">
              <input
                className="input"
                autoFocus
                value={laneDraft.name}
                onChange={(event) => setLaneDraft({ ...laneDraft, name: event.target.value })}
              />
            </Field>
            <Field label="说明">
              <textarea
                className="textarea"
                rows={2}
                value={laneDraft.description}
                placeholder="这条线讲什么？与主线的关系……"
                onChange={(event) => setLaneDraft({ ...laneDraft, description: event.target.value })}
              />
            </Field>
            <Field label="颜色">
              <div className="row wrap gap-6">
                {timelinePalette().map((color) => (
                  <button
                    key={color}
                    onClick={() => setLaneDraft({ ...laneDraft, color })}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      background: color,
                      border: laneDraft.color === color ? '2px solid var(--ink)' : '2px solid transparent',
                      boxShadow: '0 0 0 1px var(--line)',
                    }}
                  />
                ))}
              </div>
            </Field>
            {laneDraft.mode === 'create' && (
              <div className="hint-box">
                独立的平行事件线。若希望从某个事件分叉，请在事件详情中点击「从此事件创建分支线」。
              </div>
            )}
          </div>
        )}
      </Modal>

      <Confirm
        open={Boolean(deleteLane)}
        title="删除事件线"
        message={`确定删除「${deleteLane?.name || ''}」吗？该线下的所有事件也会被删除。`}
        confirmText="删除"
        onConfirm={() => {
          if (deleteLane) deleteTimeline(deleteLane.id)
          setDeleteLane(null)
        }}
        onClose={() => setDeleteLane(null)}
      />
    </div>
  )
}
