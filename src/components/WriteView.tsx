import { useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, FileText, ListTree, PanelRightClose, PenLine, Plus, Sparkles } from 'lucide-react'
import { useApp } from '../store'
import { extractMentions } from '../lib/tiptap'
import { cx, formatNumber, inertAttr, sortByOrder, statusLabel } from '../lib/utils'
import { useIsNarrow } from '../lib/useMedia'
import ChapterTree from './ChapterTree'
import NovelEditor from './NovelEditor'
import AssociationPanel from './AssociationPanel'
import AssocSplit from './AssocSplit'
import PanelEdge from './PanelEdge'
import { Empty } from './ui'

export default function WriteView() {
  const activeChapterId = useApp((s) => s.activeChapterId)
  const chapters = useApp((s) => s.chapters)
  const outlines = useApp((s) => s.outlines)
  const contents = useApp((s) => s.contents)
  const mobileSheet = useApp((s) => s.mobileSheet)
  const setChapterStatus = useApp((s) => s.setChapterStatus)
  const renameChapter = useApp((s) => s.renameChapter)
  const openChapter = useApp((s) => s.openChapter)
  const createChapter = useApp((s) => s.createChapter)
  const setView = useApp((s) => s.setView)
  const selectOutline = useApp((s) => s.selectOutline)
  const saveState = useApp((s) => s.saveState)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const rightOpen = useApp((s) => s.rightOpen)
  const setRightOpen = useApp((s) => s.setRightOpen)
  const leftOpen = useApp((s) => s.leftOpen)
  const narrow = useIsNarrow()

  const closeRight = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) setMobileSheet('none')
    else setRightOpen(false)
  }

  const closeAssocForManuscript = () => {
    if (narrow && mobileSheet === 'right') setMobileSheet('none')
  }

  const setDocFocus = (active: boolean) => {
    const root = document.documentElement
    if (active) root.dataset.editFocus = 'doc'
    else if (root.dataset.editFocus === 'doc') delete root.dataset.editFocus
  }

  useEffect(() => () => {
    if (document.documentElement.dataset.editFocus === 'doc') delete document.documentElement.dataset.editFocus
  }, [])

  const chapter = chapters.find((item) => item.id === activeChapterId) || null
  const outline = outlines.find((item) => item.level === 'chapter' && item.chapterId === activeChapterId)
  const content = activeChapterId ? contents[activeChapterId] : null
  const linkedEventCount = useMemo(() => {
    const ids = new Set<string>(outline?.eventIds || [])
    extractMentions(content?.content).forEach((mention) => {
      if (mention.type === 'event') ids.add(mention.id)
    })
    return ids.size
  }, [outline, content?.content])
  const sorted = useMemo(() => sortByOrder(chapters), [chapters])
  const index = chapter ? sorted.findIndex((item) => item.id === chapter.id) : -1
  const totalWords = chapters.reduce((sum, item) => sum + (item.wordCount || 0), 0)

  const openOutline = () => {
    if (!outline) return
    setView('structure')
    selectOutline(outline.id)
    setMobileSheet('none')
  }

  const statusText =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'dirty'
        ? '有未保存修改'
        : saveState === 'error'
          ? '保存失败，将重试'
          : saveState === 'conflict'
            ? '保存冲突'
            : '已保存'

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
        <ChapterTree />
      </aside>
      <PanelEdge side="left" label="目录" />

      <main className="center-pane">
        {!chapter ? (
          <div className="center-scroll">
            <Empty
              icon={<PenLine size={30} />}
              title="选择或创建一章开始写"
              action={
                <button className="btn btn-primary" onClick={() => void createChapter()}>
                  <Plus size={14} /> 新建章节
                </button>
              }
            >
              左侧目录按分卷组织章节；每一章都有对应的章纲。
            </Empty>
          </div>
        ) : (
          <>
            <div className="editor-top">
              <div className="row gap-4 desktop-only">
                <button
                  className="top-icon"
                  title="上一章"
                  disabled={index <= 0}
                  onClick={() => index > 0 && void openChapter(sorted[index - 1].id)}
                >
                  <ChevronLeft size={16} />
                </button>
              </div>
              <input
                className="chapter-title-input"
                value={chapter.title}
                onChange={(event) => renameChapter(chapter.id, event.target.value)}
                onPointerDown={closeAssocForManuscript}
                onFocus={() => {
                  closeAssocForManuscript()
                  setDocFocus(true)
                }}
                onBlur={(event) => {
                  if (!(event.relatedTarget as HTMLElement | null)?.closest('.editor-scroll')) setDocFocus(false)
                }}
                placeholder="章节标题"
              />
              <div className="row gap-4 desktop-only">
                <button
                  className="top-icon"
                  title="下一章"
                  disabled={index >= sorted.length - 1}
                  onClick={() => index < sorted.length - 1 && void openChapter(sorted[index + 1].id)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="segmented desktop-only">
                {(['draft', 'revise', 'done'] as const).map((status) => (
                  <button
                    key={status}
                    className={cx('segment', chapter.status === status && 'active')}
                    onClick={() => setChapterStatus(chapter.id, status)}
                  >
                    {statusLabel(status)}
                  </button>
                ))}
              </div>
              <div className="grow" />
              <button className="btn btn-sm" onClick={openOutline} title="打开本章章纲">
                <ListTree size={13} /> 章纲
              </button>
            </div>

            <NovelEditor
              key={chapter.id}
              chapterId={chapter.id}
              onActivate={closeAssocForManuscript}
              onFocusChange={setDocFocus}
            />

            {narrow && (
              <AssocSplit open={mobileSheet === 'right'} onClose={closeRight}>
                <AssocHead title={chapter.title} onClose={closeRight} />
                <AssociationPanel />
              </AssocSplit>
            )}

            <div className="editor-status-bar">
              <span className="row gap-4">
                <FileText size={12} /> 本章 {formatNumber(chapter.wordCount || 0)} 字
              </span>
              <span className="desktop-only">全书 {formatNumber(totalWords)} 字</span>
              {outline && (
                <button
                  className="row gap-4"
                  style={{ border: 0, background: 'transparent', color: 'inherit', padding: 0 }}
                  onClick={openOutline}
                >
                  <Sparkles size={12} /> {linkedEventCount} 个关联事件
                </button>
              )}
              <div className="grow" />
              <span className="row gap-4">
                <span
                  className="status-dot"
                  style={{
                    background:
                      saveState === 'saved'
                        ? 'var(--jade)'
                        : saveState === 'error' || saveState === 'conflict'
                          ? 'var(--danger)'
                          : 'var(--gold)',
                  }}
                />
                {statusText}
              </span>
              <span className="desktop-only" style={{ opacity: 0.8 }}>
                {content?.plainText ? '自动保存已开启' : '开始输入后自动保存'}
              </span>
            </div>
          </>
        )}

        {!chapter && narrow && (
          <AssocSplit open={mobileSheet === 'right'} onClose={closeRight}>
            <AssocHead title="未选择章节" onClose={closeRight} />
            <AssociationPanel />
          </AssocSplit>
        )}
      </main>

      {!narrow && (
        <>
          <PanelEdge side="right" label="创作联动" />
          <aside className={cx('side-panel right-panel', !rightOpen && 'is-collapsed')} {...inertAttr(mobileSheet !== 'right' && (narrow || !rightOpen))}>
            <AssocHead title={chapter ? chapter.title : '—'} onClose={closeRight} />
            <AssociationPanel />
          </aside>
        </>
      )}
    </div>
  )
}

function AssocHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="panel-head">
      <div className="panel-title">
        <Sparkles size={14} /> 创作联动
      </div>
      <div className="row gap-6">
        <span className="badge">{title}</span>
        <button className="top-icon panel-collapse" title="收起创作联动栏" onClick={onClose}>
          <PanelRightClose size={14} />
        </button>
      </div>
    </div>
  )
}
