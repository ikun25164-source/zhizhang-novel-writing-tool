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
import { clamp, cx, formatDate, mediaUrl, nextOrder, uid } from '../lib/utils'
import { PlaceDetail } from './details'
import PanelEdge from './PanelEdge'
import { Confirm, Empty } from './ui'

function MapCanvas({ map, addMode, onAdd }: { map: MapDoc; addMode: boolean; onAdd: (x: number, y: number) => void }) {
  const places = useApp((s) => s.places)
  const selectedPlaceId = useApp((s) => s.selectedPlaceId)
  const selectPlace = useApp((s) => s.selectPlace)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const stageRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
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

  const baseScale = size.w && size.h && map.width && map.height
    ? Math.min(size.w / map.width, size.h / map.height) * 0.94
    : 1
  const worldW = map.width * baseScale
  const worldH = map.height * baseScale
  const placeList = places.filter((place) => place.mapId === map.id)

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
    setPan((current) => ({
      x: px - ((px - current.x) / zoomRef.current) * k,
      y: py - ((py - current.y) / zoomRef.current) * k,
    }))
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
      setPan({
        x: mid.x - rect.left - ((startMid.x - rect.left - startPan.x) * k) / gesture.current.startZoom,
        y: mid.y - rect.top - ((startMid.y - rect.top - startPan.y) * k) / gesture.current.startZoom,
      })
      setZoom(k)
      moved.current = true
      return
    }

    if (gesture.current.mode === 'drag') {
      const dx = event.clientX - gesture.current.startX
      const dy = event.clientY - gesture.current.startY
      if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true
      setPan({ x: gesture.current.startPan.x + dx, y: gesture.current.startPan.y + dy })
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

  return (
    <div className="map-stage-wrap">
      <div
        ref={stageRef}
        className={cx('map-stage', dragging && 'dragging')}
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
        </div>
        <div className="map-hint">
          {addMode ? '点击地图放置新地点' : '拖动平移 · 滚轮 / 双指缩放 · 点击标记查看地点'}
        </div>
        <div className="zoom-badge">
          <button className="top-icon" style={{ width: 26, height: 26 }} onClick={() => zoomAt(zoom - 0.2, (stageRef.current?.getBoundingClientRect().left || 0) + size.w / 2, (stageRef.current?.getBoundingClientRect().top || 0) + size.h / 2)}>
            <Minus size={13} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button className="top-icon" style={{ width: 26, height: 26 }} onClick={() => zoomAt(zoom + 0.2, (stageRef.current?.getBoundingClientRect().left || 0) + size.w / 2, (stageRef.current?.getBoundingClientRect().top || 0) + size.h / 2)}>
            <Plus size={13} />
          </button>
          <button className="top-icon" style={{ width: 26, height: 26 }} onClick={fit} title="适应窗口">
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MapsView() {
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
                <MapPin size={13} /> {addMode ? '点击地图放置…' : '添加地点'}
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
            <MapCanvas map={map} addMode={addMode} onAdd={createPlace} />
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
          {selectedPlace ? (
            <PlaceDetail key={selectedPlace.id} id={selectedPlace.id} />
          ) : map ? (
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
                {mapPlaces.length === 0 && <div className="small muted" style={{ padding: 6 }}>还没有地点。点击上方「添加地点」，然后在地图上落点。</div>}
              </div>
              <button className="btn btn-sm" onClick={() => setAddMode(true)}>
                <Plus size={12} /> 在地图上添加地点
              </button>
              <div className="divider" style={{ margin: '4px 0' }} />
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={13} /> 删除这张地图
              </button>
              <div className="hint-box">
                拖动地图可平移，滚轮或双指可缩放。地点会保存相对坐标，换屏幕尺寸也不会错位。
              </div>
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
