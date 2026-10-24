import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  ImagePlus,
  Map as MapIcon,
  MapPin,
  Maximize2,
  Minus,
  PanelRightClose,
  Plus,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useApp } from '../store'
import { isNavActivation } from '../lib/arrowNav'
import type { MapDoc } from '../types'
import { api } from '../lib/api'
import { prepareImage } from '../lib/image'
import { clamp, cx, formatDate, inertAttr, mediaUrl, nextOrder, uid } from '../lib/utils'
import { useIsNarrow } from '../lib/useMedia'
import { PlaceDetail } from './details'
import PanelEdge from './PanelEdge'
import { Confirm, Empty } from './ui'

function MapCanvas({
  map,
  addMode,
  onAdd,
  onCancelAdd,
}: {
  map: MapDoc
  addMode: boolean
  onAdd: (x: number, y: number) => void
  onCancelAdd: () => void
}) {
  const places = useApp((s) => s.places)
  const selectedPlaceId = useApp((s) => s.selectedPlaceId)
  const selectPlace = useApp((s) => s.selectPlace)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const stageRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({
    mode: 'none' as 'none' | 'drag' | 'pinch',
    startPan: { x: 0, y: 0 },
    startX: 0,
    startY: 0,
    startDist: 0,
    startZoom: 1,
    startMid: { x: 0, y: 0 },
  })
  const moved = useRef(false)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const panRef = useRef(pan)
  panRef.current = pan

  const baseScale = size.w && size.h && map.width && map.height
    ? Math.min(size.w / map.width, size.h / map.height) * 0.94
    : 1
  const worldW = map.width * baseScale
  const worldH = map.height * baseScale
  const placeList = places.filter((place) => place.mapId === map.id)

  // 平移不设边界时能把地图整张推出画布，只剩一块空白和一圈焦点环。
  // 每个方向都留一部分图露在视口里：画布大就留视口的 35%，缩小后至少留图的一半
  const clampPan = (x: number, y: number, z = zoomRef.current) => {
    const w = worldW * z
    const h = worldH * z
    const keepX = Math.min(size.w * 0.35, Math.max(64, w * 0.5))
    const keepY = Math.min(size.h * 0.35, Math.max(64, h * 0.5))
    return {
      x: clamp(x, keepX - w, size.w - keepX),
      y: clamp(y, keepY - h, size.h - keepY),
    }
  }

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setZoom(1)
    setPan({ x: (size.w - worldW) / 2, y: (size.h - worldH) / 2 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.id, size.w, size.h, map.width, map.height])

  const zoomAt = (next: number, clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const k = clamp(next, 0.35, 5)
    const px = clientX - rect.left
    const py = clientY - rect.top
    setPan((current) =>
      clampPan(
        px - ((px - current.x) / zoomRef.current) * k,
        py - ((py - current.y) / zoomRef.current) * k,
        k,
      ),
    )
    setZoom(k)
  }

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const handler = (event: WheelEvent) => {
      event.preventDefault()
      zoomAt(zoomRef.current * Math.exp(-event.deltaY * 0.0016), event.clientX, event.clientY)
    }
    stage.addEventListener('wheel', handler, { passive: false })
    return () => stage.removeEventListener('wheel', handler)
  })

  const fit = () => {
    setZoom(1)
    setPan({ x: (size.w - worldW) / 2, y: (size.h - worldH) / 2 })
  }

  // 视口中心换算成世界坐标百分比，作为待放置图钉的起点
  const centerPct = () => {
    const rect = stageRef.current?.getBoundingClientRect()
    const world = stageRef.current?.querySelector('.map-world')?.getBoundingClientRect()
    if (!rect || !world || !world.width) return { x: 50, y: 50 }
    return {
      x: clamp(((rect.left + rect.width / 2 - world.left) / world.width) * 100, 0, 100),
      y: clamp(((rect.top + rect.height / 2 - world.top) / world.height) * 100, 0, 100),
    }
  }

  /** 点「添加地点」后焦点直接落到画布，图钉已经摆好，剩下的全用方向键完成 */
  useEffect(() => {
    if (!addMode) {
      setGhost(null)
      return
    }
    setGhost(centerPct())
    stageRef.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addMode])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.map-pin')) return
    if ((event.target as HTMLElement).closest('.zoom-badge')) return
    const stage = stageRef.current
    if (!stage) return
    stage.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    moved.current = false
    if (pointers.current.size === 1) {
      gesture.current = {
        ...gesture.current,
        mode: 'drag',
        startPan: { ...pan },
        startX: event.clientX,
        startY: event.clientY,
      }
      setDragging(true)
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values())
      gesture.current = {
        ...gesture.current,
        mode: 'pinch',
        startDist: Math.hypot(a.x - b.x, a.y - b.y),
        startZoom: zoom,
        startPan: { ...pan },
        startMid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      }
      setDragging(false)
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()

    if (pointers.current.size >= 2) {
      const [a, b] = Array.from(pointers.current.values())
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (!gesture.current.startDist) {
        gesture.current.startDist = dist
        gesture.current.startZoom = zoomRef.current
        gesture.current.startMid = mid
        gesture.current.startPan = { ...pan }
        return
      }
      const k = clamp((gesture.current.startZoom * dist) / gesture.current.startDist, 0.35, 5)
      const startPan = gesture.current.startPan
      const startMid = gesture.current.startMid
      setPan(
        clampPan(
          mid.x - rect.left - ((startMid.x - rect.left - startPan.x) * k) / gesture.current.startZoom,
          mid.y - rect.top - ((startMid.y - rect.top - startPan.y) * k) / gesture.current.startZoom,
          k,
        ),
      )
      setZoom(k)
      moved.current = true
      return
    }

    if (gesture.current.mode === 'drag') {
      const dx = event.clientX - gesture.current.startX
      const dy = event.clientY - gesture.current.startY
      if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true
      setPan(clampPan(gesture.current.startPan.x + dx, gesture.current.startPan.y + dy))
    }
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    const wasSingle = pointers.current.size === 1
    pointers.current.delete(event.pointerId)
    if (stage && stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId)
    if (wasSingle && addMode && !moved.current) {
      const rect = stage?.getBoundingClientRect()
      const world = stage?.querySelector('.map-world')?.getBoundingClientRect()
      if (rect && world && world.width > 0) {
        onAdd(
          clamp(((event.clientX - world.left) / world.width) * 100, 0, 100),
          clamp(((event.clientY - world.top) / world.height) * 100, 0, 100),
        )
      }
    }
    if (pointers.current.size < 2) gesture.current.startDist = 0
    if (pointers.current.size === 0) {
      setDragging(false)
      gesture.current.mode = 'none'
    }
  }

  const centerZoom = (delta: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    zoomAt(zoomRef.current + delta, (rect?.left || 0) + size.w / 2, (rect?.top || 0) + size.h / 2)
  }

  return (
    <div className="map-stage-wrap">
      <div
        ref={stageRef}
        className={cx('map-stage', dragging && 'dragging')}
        tabIndex={0}
        aria-label={
          addMode
            ? '地图画布：方向键移动待放置的图钉，Shift 加上下方向键缩放，Enter 放下，Esc 取消'
            : '地图画布：方向键平移，Shift 加上下方向键或加减号缩放，0 适应窗口，Tab 到地点标记'
        }
        onKeyDown={(event) => {
          // 画布里的缩放按钮、图钉、地点标记自己要用按键，别让画布把它们的方向键吞掉
          if (event.target !== event.currentTarget) return
          const native = event.nativeEvent
          if (native.metaKey || native.ctrlKey || native.altKey || native.isComposing) return
          const zooming = event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')
          const panning = event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown'
          if (event.key === '+' || event.key === '=') {
            event.preventDefault()
            centerZoom(0.2)
            return
          }
          if (event.key === '-' || event.key === '_') {
            event.preventDefault()
            centerZoom(-0.2)
            return
          }
          if (event.key === '0') {
            event.preventDefault()
            fit()
            return
          }
          if (event.key === 'Enter') {
            if (!addMode || !ghost) return
            event.preventDefault()
            onAdd(ghost.x, ghost.y)
            return
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            if (addMode) {
              onCancelAdd()
              return
            }
            // 画布把方向键全包了，Esc 把焦点交还给工具条，免得走不出去
            const back = event.currentTarget.closest('.center-pane, .view')?.querySelector<HTMLElement>('.map-toolbar button')
            back?.focus()
            return
          }
          if (!panning) return
          // Shift + 上下 = 缩放（按住方向键会连发，缩放和平移都能一路推到底）
          if (zooming) {
            event.preventDefault()
            centerZoom(event.key === 'ArrowUp' ? 0.12 : -0.12)
            return
          }
          if (addMode && ghost) {
            event.preventDefault()
            const step = event.shiftKey ? 4 : 1.2
            const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0
            const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0
            setGhost({ x: clamp(ghost.x + dx, 0, 100), y: clamp(ghost.y + dy, 0, 100) })
            return
          }
          const step = event.shiftKey ? 160 : 60
          const move: Record<string, [number, number]> = {
            ArrowLeft: [step, 0],
            ArrowRight: [-step, 0],
            ArrowUp: [0, step],
            ArrowDown: [0, -step],
          }
          const [dx, dy] = move[event.key]
          const current = panRef.current
          const next = clampPan(current.x + dx, current.y + dy)
          if (next.x === current.x && next.y === current.y) {
            // 已经顶到画布边界：这一下方向键不再吞掉，交给全站导航把焦点带出去。
            // 长按连发只拦下,免得焦点一口气连跳好几格
            if (event.repeat) event.preventDefault()
            return
          }
          event.preventDefault()
          setPan(next)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={addMode ? { cursor: 'crosshair' } : undefined}
      >
        <div
          className="map-world"
          style={{
            width: worldW,
            height: worldH,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <img src={mediaUrl(map.image)} alt={map.name} draggable={false} />
          {placeList.map((place) => {
            const active = place.id === selectedPlaceId
            return (
              <button
                key={place.id}
                className={cx('map-pin', active && 'active')}
                style={{
                  left: `${place.x}%`,
                  top: `${place.y}%`,
                  transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                  transformOrigin: 'bottom center',
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  selectPlace(place.id)
                  setMobileSheet('right')
                }}
                title={`${place.name} · ${place.category}`}
              >
                <span className="pin-head" style={{ background: place.color }}>
                  <MapPin size={13} />
                </span>
                <span className="pin-label">{place.name}</span>
              </button>
            )
          })}
          {addMode && ghost && (
            <div
              className="map-pin ghost"
              aria-hidden="true"
              style={{
                left: `${ghost.x}%`,
                top: `${ghost.y}%`,
                transform: `translate(-50%, -100%) scale(${1 / zoom})`,
                transformOrigin: 'bottom center',
              }}
            >
              <span className="pin-head">
                <MapPin size={13} />
              </span>
              <span className="pin-label">新地点</span>
            </div>
          )}
        </div>
        <div className="map-foot">
          <div className="map-hint">
            <span className="hint-long">
              {addMode
                ? '方向键移动图钉（按住连发）· Shift+↑/↓ 缩放 · Enter 放下 · Esc 取消'
                : '拖动 / 方向键平移 · Shift+↑/↓ 或 +/- 缩放 · 0 适应窗口 · 点击或 Tab 到标记查看地点'}
            </span>
            <span className="hint-short">
              {addMode
                ? '方向键移动图钉 · Shift+↑/↓ 缩放 · Enter 放下'
                : '方向键平移 · Shift+↑/↓ 缩放 · 0 适应 · Tab 到标记'}
            </span>
          </div>
          <div className="zoom-badge">
            <button className="top-icon" style={{ width: 26, height: 26 }} title="缩小" aria-label="缩小" onClick={() => zoomAt(zoom - 0.2, (stageRef.current?.getBoundingClientRect().left || 0) + size.w / 2, (stageRef.current?.getBoundingClientRect().top || 0) + size.h / 2)}>
              <Minus size={13} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button className="top-icon" style={{ width: 26, height: 26 }} title="放大" aria-label="放大" onClick={() => zoomAt(zoom + 0.2, (stageRef.current?.getBoundingClientRect().left || 0) + size.w / 2, (stageRef.current?.getBoundingClientRect().top || 0) + size.h / 2)}>
              <Plus size={13} />
            </button>
            <button className="top-icon" style={{ width: 26, height: 26 }} onClick={fit} title="适应窗口">
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MapsView() {
  const narrow = useIsNarrow()
  const maps = useApp((s) => s.maps)
  const places = useApp((s) => s.places)
  const events = useApp((s) => s.events)
  const selectedMapId = useApp((s) => s.selectedMapId)
  const selectedPlaceId = useApp((s) => s.selectedPlaceId)
  const selectMap = useApp((s) => s.selectMap)
  const selectPlace = useApp((s) => s.selectPlace)
  const addMap = useApp((s) => s.addMap)
  const updateMap = useApp((s) => s.updateMap)
  const deleteMap = useApp((s) => s.deleteMap)
  const addPlace = useApp((s) => s.addPlace)
  const mobileSheet = useApp((s) => s.mobileSheet)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const rightOpen = useApp((s) => s.rightOpen)
  const setRightOpen = useApp((s) => s.setRightOpen)
  const leftOpen = useApp((s) => s.leftOpen)
  const projectId = useApp((s) => s.project?.id)

  const closeRight = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) setMobileSheet('none')
    else setRightOpen(false)
  }

  const [uploading, setUploading] = useState(false)
  const [addMode, setAddMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const map = maps.find((item) => item.id === selectedMapId) || maps[0] || null
  const selectedPlace = places.find((place) => place.id === selectedPlaceId && place.mapId === map?.id) || null
  const mapPlaces = useMemo(() => (map ? places.filter((place) => place.mapId === map.id) : []), [places, map])
  const mapPlaceIds = useMemo(() => new Set(mapPlaces.map((place) => place.id)), [mapPlaces])
  const mapEvents = events.filter((event) => event.locationId && mapPlaceIds.has(event.locationId))

  useEffect(() => {
    if (!map) return
    if (selectedMapId !== map.id) selectMap(map.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.id])

  useEffect(() => {
    setAddMode(false)
  }, [map?.id])

  const importMap = async (file: File) => {
    if (!projectId) return
    setUploading(true)
    try {
      const prepared = await prepareImage(file, { maxDim: 3200, quality: 0.9, keepType: true })
      const result = await api.upload(projectId, prepared.blob, 'map', prepared.ext)
      const doc: MapDoc = {
        id: uid(),
        name: file.name.replace(/\.[^.]+$/, '') || '世界观地图',
        image: result.path,
        width: prepared.width,
        height: prepared.height,
        order: nextOrder(maps),
        description: '',
      }
      addMap(doc)
      setAddMode(false)
    } catch (error) {
      useApp.getState().toast(error instanceof Error ? error.message : '地图导入失败')
    } finally {
      setUploading(false)
    }
  }

  const createPlace = (x: number, y: number) => {
    if (!map) return
    const id = addPlace({ mapId: map.id, x, y, name: `新地点${mapPlaces.length + 1}` })
    setAddMode(false)
    if (id) {
      selectPlace(id)
      setMobileSheet('right')
    }
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
            <MapIcon size={14} /> 世界观地图
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <ImagePlus size={13} /> 导入
          </button>
        </div>
        <div className="panel-body flush scroll-thin">
          <div className="map-list">
            {maps.map((item) => (
              <button
                key={item.id}
                className={cx('map-row', item.id === map?.id && 'active')}
                data-nav-switch
                onClick={() => {
                  selectMap(item.id)
                  if (!isNavActivation()) setMobileSheet('none')
                }}
              >
                <img className="map-thumb" src={mediaUrl(item.image)} alt="" />
                <span className="grow">
                  <b>{item.name}</b>
                  <span>{places.filter((place) => place.mapId === item.id).length} 个地点</span>
                </span>
              </button>
            ))}
            {maps.length === 0 && (
              <Empty icon={<MapIcon size={22} />}>
                导入一张世界地图，开始在上面标注地点与事件。
              </Empty>
            )}
          </div>
        </div>
        <div className="panel-foot">
          <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <span className="spinner" /> : <ImagePlus size={13} />}
            {uploading ? '导入中…' : '导入地图图片'}
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importMap(file)
            event.target.value = ''
          }}
        />
      </aside>
      <PanelEdge side="left" label="地图列表" />

      <main className="center-pane">
        {!map ? (
          <div className="center-scroll">
            <Empty
              icon={<MapIcon size={30} />}
              title="导入世界观地图"
              action={
                <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                  <ImagePlus size={14} /> 选择图片
                </button>
              }
            >
              支持 PNG / JPG / WebP。导入后可以在地图上创建地点，并记录地点上发生的事件。
            </Empty>
          </div>
        ) : (
          <>
            <div className="map-toolbar">
              <input
                className="input sm"
                style={{ maxWidth: 220, border: 0, background: 'transparent', fontWeight: 600, fontSize: 15 }}
                value={map.name}
                onChange={(event) => updateMap(map.id, { name: event.target.value })}
              />
              <span className="badge">{mapPlaces.length} 地点</span>
              <span className="badge badge-jade">{mapEvents.length} 事件</span>
              <div className="grow" />
              <button className={cx('btn btn-sm', addMode && 'btn-primary')} onClick={() => setAddMode(!addMode)}>
                <MapPin size={13} /> {addMode ? '方向键放置中…' : '添加地点'}
              </button>
              <button
                className="btn btn-sm btn-ghost"
                title="地图设置"
                onClick={() => {
                  selectPlace(null)
                  setMobileSheet('right')
                }}
              >
                <Settings2 size={13} />
              </button>
            </div>
            <MapCanvas map={map} addMode={addMode} onAdd={createPlace} onCancelAdd={() => setAddMode(false)} />
          </>
        )}
      </main>
      <PanelEdge side="right" label="地图信息" />

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
            <MapPin size={14} /> {selectedPlace ? '地点详情' : '地图信息'}
          </div>
          <div className="row gap-6">
            {selectedPlace && <span className="badge">{selectedPlace.category}</span>}
            <button className="top-icon panel-collapse" title="收起侧栏" onClick={closeRight}>
              <PanelRightClose size={14} />
            </button>
          </div>
        </div>
        <div className="panel-body scroll-thin" style={{ padding: 0 }}>
          {selectedPlace && <PlaceDetail key={selectedPlace.id} id={selectedPlace.id} />}
          {map && !selectedPlace && (
            <div style={{ padding: 12 }} className="col gap-10">
              <label className="field">
                <span className="field-label">地图名称</span>
                <input className="input" value={map.name} onChange={(event) => updateMap(map.id, { name: event.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">地图说明</span>
                <textarea
                  className="textarea"
                  rows={3}
                  value={map.description}
                  placeholder="这个世界的地理格局、气候、势力分布……"
                  onChange={(event) => updateMap(map.id, { description: event.target.value })}
                />
              </label>
              <div className="small muted">
                {map.width} × {map.height} px
              </div>
              <div className="divider" style={{ margin: '4px 0' }} />
            </div>
          )}
          {map ? (
            /* 地点索引常驻在这里：选中某个地点时详情出现在它上方，列表本身不消失，
               否则方向键一走焦就把自己的落脚点删掉了 */
            <div style={{ padding: 12 }} className="col gap-10">
              <div className="assoc-label">
                <span className="row gap-4">
                  <MapPin size={12} /> 地点索引
                </span>
                <span>{mapPlaces.length}</span>
              </div>
              <div className="col" style={{ gap: 2 }}>
                {mapPlaces.map((place) => {
                  const count = events.filter((event) => event.locationId === place.id).length
                  return (
                    <button
                      key={place.id}
                      className="map-place-row"
                      data-nav-switch
                      onClick={() => {
                        selectPlace(place.id)
                      }}
                    >
                      <span className="pin-dot" style={{ background: place.color }} />
                      <span className="grow truncate">{place.name}</span>
                      {count > 0 && <span className="badge badge-jade">{count}</span>}
                      <ChevronRight size={12} color="var(--muted)" />
                    </button>
                  )
                })}
                {mapPlaces.length === 0 && <div className="small muted" style={{ padding: 6 }}>还没有地点。用上方「添加地点」，然后方向键落点。</div>}
              </div>
              <button className="btn btn-sm" onClick={() => setAddMode(true)}>
                <Plus size={12} /> 在地图上添加地点
              </button>
              {!selectedPlace && (
                <>
                  <div className="divider" style={{ margin: '4px 0' }} />
                  <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
                    <Trash2 size={13} /> 删除这张地图
                  </button>
                  <div className="hint-box">
                    拖动地图可平移，滚轮或双指可缩放。地点会保存相对坐标，换屏幕尺寸也不会错位。
                  </div>
                </>
              )}
            </div>
          ) : (
            <Empty>选择或导入一张地图</Empty>
          )}
        </div>
      </aside>

      <Confirm
        open={confirmDelete}
        title="删除地图"
        message={`确定删除「${map?.name || ''}」吗？地图上的地点也会被删除，相关事件会保留但解除地点关联。`}
        confirmText="删除地图"
        onConfirm={() => {
          if (map) deleteMap(map.id)
          setMobileSheet('none')
        }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}
