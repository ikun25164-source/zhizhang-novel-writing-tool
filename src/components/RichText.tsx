import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import type { JSONContent } from '@tiptap/react'
import {
  AtSign,
  Bold,
  Italic,
  List,
  ListOrdered,
  MapPin,
  Quote,
  Redo2,
  Search,
  Underline as UnderlineIcon,
  Undo2,
  Users,
  X,
} from 'lucide-react'
import { useApp } from '../store'
import type { EntityType } from '../types'
import { createCharacterHighlight, EMPTY_DOC, Mention, extractPlainText } from '../lib/tiptap'
import { cx } from '../lib/utils'
import { Modal } from './ui'

export interface MentionPick {
  type: EntityType
  id: string
  label: string
}

interface MentionSourceItem extends MentionPick {
  sub?: string
}

function useMentionSources(): MentionSourceItem[] {
  const characters = useApp((s) => s.characters)
  const events = useApp((s) => s.events)
  const places = useApp((s) => s.places)
  const chapters = useApp((s) => s.chapters)
  const outlines = useApp((s) => s.outlines)
  const maps = useApp((s) => s.maps)
  const projectId = useApp((s) => s.project?.id)

  return useMemo(() => {
    void projectId
    const list: MentionSourceItem[] = []
    characters.forEach((c) => list.push({ type: 'character', id: c.id, label: c.name, sub: c.role || c.identity }))
    events.forEach((e) => list.push({ type: 'event', id: e.id, label: e.title, sub: e.plainText?.slice(0, 30) }))
    places.forEach((p) => list.push({ type: 'place', id: p.id, label: p.name, sub: p.category }))
    chapters.forEach((c) => list.push({ type: 'chapter', id: c.id, label: c.title, sub: '正文' }))
    outlines.forEach((o) =>
      list.push({
        type: 'outline',
        id: o.id,
        label: o.title,
        sub: o.level === 'master' ? '总纲' : o.level === 'volume' ? '大纲' : '章纲',
      }),
    )
    maps.forEach((m) => list.push({ type: 'map', id: m.id, label: m.name, sub: '地图' }))
    return list
  }, [characters, events, places, chapters, outlines, maps, projectId])
}

const TYPE_LABEL: Record<string, string> = {
  character: '人物',
  event: '事件',
  place: '地点',
  chapter: '章节',
  outline: '纲',
  map: '地图',
}

export function MentionDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (pick: MentionPick) => void
}) {
  const sources = useMentionSources()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | EntityType>('all')

  useEffect(() => {
    if (open) {
      setQuery('')
      setFilter('all')
    }
  }, [open])

  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    return sources
      .filter((s) => filter === 'all' || s.type === filter)
      .filter((s) => !keyword || `${s.label} ${s.sub || ''}`.toLowerCase().includes(keyword))
      .slice(0, 60)
  }, [sources, query, filter])

  return (
    <Modal open={open} title="插入关联" onClose={onClose} icon={<AtSign size={17} />}>
      <div className="col gap-10">
        <div className="search-box">
          <Search size={14} />
          <input
            autoFocus
            value={query}
            placeholder="搜索人物、事件、地点、章节……"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button className="top-icon" style={{ width: 22, height: 22 }} onClick={() => setQuery('')}>
              <X size={13} />
            </button>
          )}
        </div>
        <div className="row wrap gap-4">
          {(['all', 'character', 'event', 'place', 'chapter', 'outline', 'map'] as const).map((key) => (
            <button
              key={key}
              className={cx('chip', filter === key && 'active')}
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? '全部' : TYPE_LABEL[key]}
            </button>
          ))}
        </div>
        <div className="search-results" style={{ marginTop: 0 }}>
          {results.length === 0 && (
            <div className="empty" style={{ padding: 22 }}>
              没有匹配的条目
            </div>
          )}
          {results.map((item) => (
            <button
              key={`${item.type}:${item.id}`}
              className="search-result"
              onClick={() => {
                onPick({ type: item.type, id: item.id, label: item.label })
                onClose()
              }}
            >
              {item.type === 'character' ? (
                <Users size={14} color="var(--muted)" />
              ) : item.type === 'place' ? (
                <MapPin size={14} color="var(--muted)" />
              ) : (
                <AtSign size={14} color="var(--muted)" />
              )}
              <span className="sr-main">
                <b>{item.label}</b>
                {item.sub && <span>{item.sub}</span>}
              </span>
              <span className={cx('badge', item.type === 'event' && 'badge-jade')}>{TYPE_LABEL[item.type]}</span>
            </button>
          ))}
        </div>
        <div className="field-label">
          插入后可在正文/纲目中点击跳转；人物名在正文中会自动高亮，双击查看详情。
        </div>
      </div>
    </Modal>
  )
}

function EditorToolbar({
  editor,
  onMention,
  compact,
}: {
  editor: NonNullable<ReturnType<typeof useEditor>>
  onMention?: () => void
  compact?: boolean
}) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const update = () => setTick((t) => t + 1)
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  return (
    <div className={compact ? 'mini-toolbar' : 'editor-toolbar'}>
      <div className="toolbar-group">
        <button
          type="button"
          className={cx('tool-btn', editor.isActive('bold') && 'active')}
          title="加粗"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </button>
        <button
          type="button"
          className={cx('tool-btn', editor.isActive('italic') && 'active')}
          title="斜体"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </button>
        <button
          type="button"
          className={cx('tool-btn', editor.isActive('underline') && 'active')}
          title="下划线"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={15} />
        </button>
      </div>
      {!compact && (
        <>
          <span className="toolbar-sep" />
          <div className="toolbar-group">
            <button
              type="button"
              className={cx('tool-btn', editor.isActive('heading', { level: 2 }) && 'active')}
              title="小标题"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <span style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 13 }}>H</span>
            </button>
            <button
              type="button"
              className={cx('tool-btn', editor.isActive('blockquote') && 'active')}
              title="引用"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
            >
              <Quote size={15} />
            </button>
          </div>
        </>
      )}
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <button
          type="button"
          className={cx('tool-btn', editor.isActive('bulletList') && 'active')}
          title="无序列表"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className={cx('tool-btn', editor.isActive('orderedList') && 'active')}
          title="有序列表"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </button>
      </div>
      <span className="toolbar-sep" />
      <div className="toolbar-group">
        <button
          type="button"
          className="tool-btn"
          title="撤销"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 size={15} />
        </button>
        <button
          type="button"
          className="tool-btn"
          title="重做"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 size={15} />
        </button>
      </div>
      {onMention && (
        <>
          <span className="toolbar-sep" />
          <button
            type="button"
            className="tool-btn tool-text"
            title="插入人物 / 事件 / 地点"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onMention}
          >
            <AtSign size={14} /> 关联
          </button>
        </>
      )}
    </div>
  )
}

export function MiniEditor({
  doc,
  onChange,
  placeholder,
  className,
  allowMention = true,
}: {
  doc: JSONContent | null | undefined
  onChange: (doc: JSONContent, plainText: string) => void
  placeholder?: string
  className?: string
  allowMention?: boolean
}) {
  const [mentionOpen, setMentionOpen] = useState(false)
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Placeholder.configure({ placeholder: placeholder || '开始记录……' }),
      Mention,
      createCharacterHighlight(() => useApp.getState().characters.map((c) => ({ id: c.id, name: c.name }))),
    ],
    content: doc || EMPTY_DOC,
    editorProps: {
      attributes: { class: 'mini-prose' },
      handleDOMEvents: {
        dblclick: (_view, event) => {
          const target = (event.target as HTMLElement).closest('.char-name') as HTMLElement | null
          if (target?.dataset.char) {
            useApp.getState().openEntity('character', target.dataset.char)
            return true
          }
          return false
        },
        click: (_view, event) => {
          const target = (event.target as HTMLElement).closest('[data-mention]') as HTMLElement | null
          if (target?.dataset.id) {
            const type = target.dataset.mention as EntityType
            if (type === 'chapter') {
              void useApp.getState().openChapter(target.dataset.id)
            } else {
              useApp.getState().openEntity(type, target.dataset.id)
            }
            return true
          }
          return false
        },
      },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getJSON(), extractPlainText(instance.getJSON()))
    },
  })

  const charactersSig = useApp((s) => s.characters.map((c) => `${c.id}:${c.name}`).join('|'))
  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta('refreshDecorations', charactersSig))
  }, [editor, charactersSig])

  const docRef = useRef(doc || EMPTY_DOC)
  useEffect(() => {
    if (!editor) return
    const next = doc || EMPTY_DOC
    if (JSON.stringify(next) === JSON.stringify(editor.getJSON())) {
      docRef.current = next
      return
    }
    if (!editor.isFocused) {
      editor.commands.setContent(next, false)
      docRef.current = next
    }
  }, [doc, editor])

  if (!editor) return null

  return (
    <div className={cx('mini-editor', className)}>
      <EditorToolbar editor={editor} compact onMention={allowMention ? () => setMentionOpen(true) : undefined} />
      <EditorContent editor={editor} />
      {allowMention && (
        <MentionDialog
          open={mentionOpen}
          onClose={() => setMentionOpen(false)}
          onPick={(pick) => {
            editor
              .chain()
              .focus()
              .insertContent([
                { type: 'mention', attrs: { type: pick.type, id: pick.id, label: pick.label } },
                { type: 'text', text: ' ' },
              ])
              .run()
          }}
        />
      )}
    </div>
  )
}
