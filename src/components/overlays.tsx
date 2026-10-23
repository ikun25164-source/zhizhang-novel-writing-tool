import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, AtSign, BookOpen, CalendarDays, MapPin, Search, Users, X } from 'lucide-react'
import { useApp } from '../store'
import { truncate } from '../lib/utils'
import { EntityDetail } from './details'
import { Empty, Modal } from './ui'

const TYPE_LABEL: Record<string, string> = {
  character: '人物',
  event: '事件',
  place: '地点',
  outline: '纲目',
  chapter: '章节',
  map: '地图',
}

export function PeekPanel() {
  const peek = useApp((s) => s.peek)
  const stack = useApp((s) => s.peekStack)
  const project = useApp((s) => s.project)
  const characters = useApp((s) => s.characters)
  const events = useApp((s) => s.events)
  const places = useApp((s) => s.places)
  const outlines = useApp((s) => s.outlines)
  const closePeek = useApp((s) => s.closePeek)

  useEffect(() => {
    if (!peek) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePeek()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [peek, closePeek])

  if (!peek || !project) return null

  let title = ''
  let subtitle = ''
  if (peek.type === 'character') {
    const character = characters.find((c) => c.id === peek.id)
    title = character?.name || '人物'
    subtitle = character?.role || character?.identity || ''
  } else if (peek.type === 'event') {
    const event = events.find((e) => e.id === peek.id)
    title = event?.title || '事件'
    subtitle = project.calendar ? '事件详情' : ''
  } else if (peek.type === 'place') {
    const place = places.find((p) => p.id === peek.id)
    title = place?.name || '地点'
    subtitle = place?.category || ''
  } else if (peek.type === 'outline') {
    const outline = outlines.find((o) => o.id === peek.id)
    title = outline?.title || '纲目'
    subtitle = outline?.level === 'master' ? '总纲' : outline?.level === 'volume' ? '大纲' : '章纲'
  } else {
    title = TYPE_LABEL[peek.type] || '详情'
  }

  return createPortal(
    <>
      <div className="drawer-mask" onClick={closePeek} />
      <aside className="peek-drawer">
        <div className="peek-head">
          {stack.length > 0 && (
            <button className="top-icon" onClick={closePeek} title="返回上一级">
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="peek-type">{TYPE_LABEL[peek.type]}{subtitle ? ` · ${subtitle}` : ''}</div>
            <div className="truncate" style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 14 }}>
              {title}
            </div>
          </div>
          <button className="top-icon" onClick={closePeek} title="关闭">
            <X size={17} />
          </button>
        </div>
        <div className="peek-body scroll-thin">
          <EntityDetail type={peek.type} id={peek.id} />
        </div>
      </aside>
    </>,
    document.body,
  )
}

type SearchResult = {
  key: string
  type: 'chapter' | 'outline' | 'event' | 'character' | 'place' | 'map'
  label: string
  sub: string
  snippet?: string
}

export function SearchDialog() {
  const open = useApp((s) => s.searchOpen)
  const setOpen = useApp((s) => s.setSearchOpen)
  const [query, setQuery] = useState('')
  const chapters = useApp((s) => s.chapters)
  const contents = useApp((s) => s.contents)
  const outlines = useApp((s) => s.outlines)
  const events = useApp((s) => s.events)
  const characters = useApp((s) => s.characters)
  const places = useApp((s) => s.places)
  const maps = useApp((s) => s.maps)
  const openChapter = useApp((s) => s.openChapter)
  const setView = useApp((s) => s.setView)
  const selectOutline = useApp((s) => s.selectOutline)
  const selectEvent = useApp((s) => s.selectEvent)
  const selectCharacter = useApp((s) => s.selectCharacter)
  const selectMap = useApp((s) => s.selectMap)
  const selectPlace = useApp((s) => s.selectPlace)
  const openEntity = useApp((s) => s.openEntity)

  useEffect(() => {
    if (open) setQuery('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const results = useMemo<SearchResult[]>(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return []
    const list: SearchResult[] = []
    const has = (text: string | undefined) => Boolean(text && text.toLowerCase().includes(keyword))
    chapters.forEach((chapter) => {
      const content = contents[chapter.id]
      if (has(chapter.title) || has(content?.plainText)) {
        const text = content?.plainText || ''
        const index = text.toLowerCase().indexOf(keyword)
        list.push({
          key: `c-${chapter.id}`,
          type: 'chapter',
          label: chapter.title,
          sub: '正文',
          snippet: index >= 0 ? truncate(text.slice(Math.max(0, index - 26), index + 60), 90) : '',
        })
      }
    })
    outlines.forEach((outline) => {
      if (has(outline.title) || has(outline.summary) || has(outline.plainText)) {
        list.push({
          key: `o-${outline.id}`,
          type: 'outline',
          label: outline.title,
          sub: outline.level === 'master' ? '总纲' : outline.level === 'volume' ? '大纲' : '章纲',
          snippet: truncate(outline.plainText || outline.summary || '', 90),
        })
      }
    })
    events.forEach((event) => {
      if (has(event.title) || has(event.plainText) || event.tags.some((tag) => has(tag))) {
        list.push({
          key: `e-${event.id}`,
          type: 'event',
          label: event.title,
          sub: '事件',
          snippet: truncate(event.plainText || '', 90),
        })
      }
    })
    characters.forEach((character) => {
      if (
        has(character.name) ||
        character.aliases.some((alias) => has(alias)) ||
        has(character.identity) ||
        has(character.personality)
      ) {
        list.push({
          key: `ch-${character.id}`,
          type: 'character',
          label: character.name,
          sub: character.role || '人物',
          snippet: truncate(character.identity || character.personality || '', 90),
        })
      }
    })
    places.forEach((place) => {
      if (has(place.name) || has(place.plainText) || place.tags.some((tag) => has(tag))) {
        list.push({
          key: `p-${place.id}`,
          type: 'place',
          label: place.name,
          sub: place.category,
          snippet: truncate(place.plainText || '', 90),
        })
      }
    })
    maps.forEach((map) => {
      if (has(map.name) || has(map.description)) {
        list.push({ key: `m-${map.id}`, type: 'map', label: map.name, sub: '地图' })
      }
    })
    return list.slice(0, 80)
  }, [query, chapters, contents, outlines, events, characters, places, maps])

  const groups = useMemo(() => {
    const map = new Map<SearchResult['type'], SearchResult[]>()
    results.forEach((result) => {
      if (!map.has(result.type)) map.set(result.type, [])
      map.get(result.type)!.push(result)
    })
    return Array.from(map.entries())
  }, [results])

  const jump = (result: SearchResult) => {
    setOpen(false)
    if (result.type === 'chapter') {
      void openChapter(result.key.slice(2), query.trim())
    } else if (result.type === 'outline') {
      setView('structure')
      selectOutline(result.key.slice(2))
      useApp.getState().closePeek()
    } else if (result.type === 'event') {
      setView('timeline')
      selectEvent(result.key.slice(2))
      openEntity('event', result.key.slice(2))
    } else if (result.type === 'character') {
      setView('characters')
      selectCharacter(result.key.slice(3))
      openEntity('character', result.key.slice(3))
    } else if (result.type === 'place') {
      const place = places.find((p) => p.id === result.key.slice(2))
      setView('maps')
      if (place) {
        selectMap(place.mapId)
        selectPlace(place.id)
      }
      useApp.getState().closePeek()
    } else if (result.type === 'map') {
      setView('maps')
      selectMap(result.key.slice(2))
    }
  }

  const iconFor = (type: SearchResult['type']) => {
    if (type === 'chapter') return <BookOpen size={14} />
    if (type === 'character') return <Users size={14} />
    if (type === 'place') return <MapPin size={14} />
    if (type === 'event') return <CalendarDays size={14} />
    return <AtSign size={14} />
  }

  return (
    <Modal open={open} title="全局搜索" onClose={() => setOpen(false)} icon={<Search size={17} />} wide>
      <div className="col gap-10">
        <div className="search-box">
          <Search size={15} />
          <input
            autoFocus
            value={query}
            placeholder="搜索正文、纲目、事件、人物、地点……"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button className="top-icon" style={{ width: 22, height: 22 }} onClick={() => setQuery('')}>
              <X size={13} />
            </button>
          )}
        </div>
        {!query.trim() && (
          <div className="empty" style={{ padding: '28px 12px' }}>
            <Search size={22} />
            <div>
              输入关键词开始检索
              <br />
              <span className="small">正文内容、章纲大纲、事件、人物与地点会一起搜索</span>
            </div>
          </div>
        )}
        {query.trim() && results.length === 0 && (
          <Empty icon={<Search size={22} />}>没有找到「{query}」相关内容</Empty>
        )}
        <div className="search-results" style={{ marginTop: 0 }}>
          {groups.map(([type, items]) => (
            <div key={type}>
              <div className="search-group-title">
                {TYPE_LABEL[type]} · {items.length}
              </div>
              {items.slice(0, 12).map((result) => (
                <button key={result.key} className="search-result" onClick={() => jump(result)}>
                  <span style={{ color: 'var(--muted)', display: 'inline-flex' }}>{iconFor(result.type)}</span>
                  <span className="sr-main">
                    <b>{result.label}</b>
                    {(result.snippet || result.sub) && <span>{result.snippet || result.sub}</span>}
                  </span>
                  <span className="badge">{result.sub}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}
