import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { AtSign, Bold, Italic, List, ListOrdered, Quote, Redo2, Underline as UnderlineIcon, Undo2 } from 'lucide-react'
import { useApp } from '../store'
import type { EntityType } from '../types'
import { EMPTY_DOC, Mention, createCharacterHighlight, extractPlainText } from '../lib/tiptap'
import { countWords, cx } from '../lib/utils'
import { MentionDialog } from './RichText'

export default function NovelEditor({
  chapterId,
  onActivate,
  onFocusChange,
}: {
  chapterId: string
  onActivate?: () => void
  onFocusChange?: (focused: boolean) => void
}) {
  const epoch = useApp((s) => s.editorEpochs[chapterId] || 0)
  const rev = useApp((s) => s.contents[chapterId]?.rev ?? 0)
  const focusTerm = useApp((s) => s.focusTerm)
  const indent = useApp((s) => s.project?.settings.indent ?? true)
  const fontSize = useApp((s) => s.project?.settings.fontSize ?? 18)
  const lineHeight = useApp((s) => s.project?.settings.lineHeight ?? 1.9)
  const font = useApp((s) => s.project?.settings.font ?? 'serif')
  const charSignature = useApp((s) => s.characters.map((c) => `${c.id}:${c.name}`).join('|'))
  const [mentionOpen, setMentionOpen] = useState(false)
  const [, setTick] = useState(0)

  const initial = useRef(useApp.getState().contents[chapterId]?.content || EMPTY_DOC)
  const lastEpoch = useRef(epoch)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Underline,
      Placeholder.configure({
        placeholder: '在这里开始写正文。输入人物名会自动高亮，双击人名可查看人物详情；用工具栏「关联」插入事件、地点或章节。',
      }),
      Mention,
      createCharacterHighlight(() =>
        useApp.getState().characters.map((character) => ({ id: character.id, name: character.name })),
      ),
    ],
    content: initial.current,
    editorProps: {
      attributes: { class: 'novel-prose', spellcheck: 'false' },
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
            if (type === 'chapter') void useApp.getState().openChapter(target.dataset.id)
            else useApp.getState().openEntity(type, target.dataset.id)
            return true
          }
          return false
        },
      },
    },
    onUpdate: ({ editor: instance }) => {
      const doc = instance.getJSON()
      const plainText = extractPlainText(doc)
      useApp.getState().updateChapterContent(chapterId, doc, plainText, countWords(plainText))
    },
  })

  useEffect(() => {
    if (!editor) return
    const update = () => setTick((t) => t + 1)
    editor.on('transaction', update)
    return () => {
      editor.off('transaction', update)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.view.dispatch(editor.state.tr.setMeta('refreshDecorations', charSignature))
  }, [editor, charSignature])

  useEffect(() => {
    if (!editor) return
    const content = useApp.getState().contents[chapterId]?.content
    if (!content) return
    if (JSON.stringify(content) === JSON.stringify(editor.getJSON())) return
    if (!editor.isFocused) {
      editor.commands.setContent(content, false)
    }
  }, [editor, rev, chapterId])

  useEffect(() => {
    if (!editor) return
    if (epoch === lastEpoch.current) return
    lastEpoch.current = epoch
    const content = useApp.getState().contents[chapterId]?.content
    if (content) editor.commands.setContent(content, false)
  }, [editor, epoch, chapterId])

  useEffect(() => {
    if (!editor || !focusTerm) return
    let found: { pos: number; length: number } | null = null
    editor.state.doc.descendants((node, pos) => {
      if (found || !node.isText || !node.text) return
      const index = node.text.indexOf(focusTerm)
      if (index >= 0) found = { pos: pos + index, length: focusTerm.length }
    })
    if (found) {
      const target = found as { pos: number; length: number }
      const id = window.setTimeout(() => {
        editor
          .chain()
          .focus()
          .setTextSelection({ from: target.pos, to: target.pos + target.length })
          .scrollIntoView()
          .run()
      }, 60)
      return () => window.clearTimeout(id)
    }
  }, [editor, focusTerm])

  if (!editor) return null

  const insertMention = (pick: { type: EntityType; id: string; label: string }) => {
    editor
      .chain()
      .focus()
      .insertContent([
        { type: 'mention', attrs: { type: pick.type, id: pick.id, label: pick.label } },
        { type: 'text', text: ' ' },
      ])
      .run()
  }

  return (
    <div className="editor-pane">
      <div className="editor-toolbar">
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
        <span className="toolbar-sep" />
        <button
          type="button"
          className="tool-btn tool-text"
          title="插入人物 / 事件 / 地点 / 章节"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setMentionOpen(true)}
        >
          <AtSign size={14} />
          关联
        </button>
        <div className="grow" />
        <span className="small muted desktop-only" style={{ paddingRight: 2 }}>
          {fontSize}px · {Math.round(lineHeight * 100)}%
        </span>
      </div>
      <div
        className="editor-scroll scroll-thin"
        onPointerDownCapture={onActivate}
        onFocusCapture={() => {
          onActivate?.()
          onFocusChange?.(true)
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) onFocusChange?.(false)
        }}
      >
        <div
          className="editor-paper"
          style={
            {
              '--editor-font-size': `${fontSize}px`,
              '--editor-line-height': String(lineHeight),
              '--prose-font': font === 'sans' ? 'var(--sans)' : 'var(--serif)',
            } as React.CSSProperties
          }
        >
          <div className={cx('novel-editor', indent && 'indent')} style={{ maxWidth: '100%' }}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      <MentionDialog open={mentionOpen} onClose={() => setMentionOpen(false)} onPick={insertMention} />
    </div>
  )
}
