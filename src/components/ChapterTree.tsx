import { useMemo, useState } from 'react'
import {
  ChevronDown,
  FileText,
  ListTree,
  MoreHorizontal,
  Plus,
  Rocket,
  Trash2,
} from 'lucide-react'
import { useApp } from '../store'
import { isNavActivation } from '../lib/arrowNav'
import type { ChapterMeta, Volume } from '../types'
import { cx, formatNumber, sortByOrder, statusLabel } from '../lib/utils'
import { PanelCollapseButton } from './PanelEdge'
import { Confirm, Dropdown, Empty, Modal } from './ui'

export default function ChapterTree() {
  const volumes = useApp((s) => s.volumes)
  const chapters = useApp((s) => s.chapters)
  const activeChapterId = useApp((s) => s.activeChapterId)
  const openChapter = useApp((s) => s.openChapter)
  const createChapter = useApp((s) => s.createChapter)
  const renameChapter = useApp((s) => s.renameChapter)
  const setChapterStatus = useApp((s) => s.setChapterStatus)
  const deleteChapter = useApp((s) => s.deleteChapter)
  const moveChapter = useApp((s) => s.moveChapter)
  const addVolume = useApp((s) => s.addVolume)
  const deleteVolume = useApp((s) => s.deleteVolume)
  const mutateCollection = useApp((s) => s.mutateCollection)
  const updateOutline = useApp((s) => s.updateOutline)
  const setMobileSheet = useApp((s) => s.setMobileSheet)

  const [renaming, setRenaming] = useState<{ type: 'volume' | 'chapter'; id: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [deleteChapterId, setDeleteChapterId] = useState<string | null>(null)
  const [deleteVolumeId, setDeleteVolumeId] = useState<string | null>(null)
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [volumeTitle, setVolumeTitle] = useState('')

  const sortedVolumes = useMemo(() => sortByOrder(volumes), [volumes])
  const sortedChapters = useMemo(() => sortByOrder(chapters), [chapters])
  const orphans = sortedChapters.filter((chapter) => !volumes.some((volume) => volume.id === chapter.volumeId))
  const totalWords = chapters.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0)

  const startRename = (type: 'volume' | 'chapter', id: string, value: string) => {
    setRenaming({ type, id })
    setDraft(value)
  }

  const commitRename = () => {
    if (!renaming) return
    const value = draft.trim()
    if (value) {
      if (renaming.type === 'chapter') {
        renameChapter(renaming.id, value)
      } else {
        mutateCollection('volumes', (items) =>
          items.map((item: Volume) =>
            item.id === renaming.id ? { ...item, title: value } : item,
          ),
          true,
        )
        const outline = outlinesForVolume(renaming.id)
        if (outline) updateOutline(outline, { title: `${value} · 大纲` })
      }
    }
    setRenaming(null)
  }

  const outlinesForVolume = (volumeId: string) => {
    const state = useApp.getState()
    return state.outlines.find((outline) => outline.level === 'volume' && outline.volumeId === volumeId)?.id
  }

  const open = (id: string) => {
    const keep = isNavActivation()
    void openChapter(id, null, keep)
    if (!keep) setMobileSheet('none')
  }

  const renderChapter = (chapter: ChapterMeta) => {
    const active = chapter.id === activeChapterId
    const isRenaming = renaming?.type === 'chapter' && renaming.id === chapter.id
    return (
      <div
        key={chapter.id}
        className={cx('chapter-item', active && 'active')}
        role="button"
        tabIndex={0}
        data-nav-switch
        onClick={() => !isRenaming && open(chapter.id)}
        onDoubleClick={() => startRename('chapter', chapter.id, chapter.title)}
        onKeyDown={(event) => event.key === 'Enter' && open(chapter.id)}
      >
        <span className={cx('status-dot', chapter.status)} title={statusLabel(chapter.status)} />
        {isRenaming ? (
          <input
            className="input sm"
            autoFocus
            value={draft}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitRename()
              if (event.key === 'Escape') setRenaming(null)
            }}
          />
        ) : (
          <span className="chapter-name">{chapter.title}</span>
        )}
        {!isRenaming && (
          <span className="chapter-meta">{formatNumber(chapter.wordCount || 0)}</span>
        )}
        {!isRenaming && (
          <div className="chapter-more" onClick={(event) => event.stopPropagation()}>
            <Dropdown
              trigger={
                <button className="top-icon" style={{ width: 22, height: 22 }} title="章节操作">
                  <MoreHorizontal size={13} />
                </button>
              }
            >
              <button className="menu-item" onClick={() => startRename('chapter', chapter.id, chapter.title)}>
                重命名
              </button>
              <button className="menu-item" onClick={() => setChapterStatus(chapter.id, 'draft')}>
                标为草稿
              </button>
              <button className="menu-item" onClick={() => setChapterStatus(chapter.id, 'revise')}>
                标为修订
              </button>
              <button className="menu-item" onClick={() => setChapterStatus(chapter.id, 'done')}>
                标为完成
              </button>
              <div className="menu-sep" />
              <button className="menu-item" onClick={() => moveChapter(chapter.id, -1)}>
                上移
              </button>
              <button className="menu-item" onClick={() => moveChapter(chapter.id, 1)}>
                下移
              </button>
              <div className="menu-sep" />
              <button className="menu-item danger" onClick={() => setDeleteChapterId(chapter.id)}>
                <Trash2 size={13} /> 删除章节
              </button>
            </Dropdown>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="panel-head">
        <div className="panel-title">
          <ListTree size={14} /> 目录
        </div>
        <div className="panel-actions">
          <button
            className="btn btn-sm btn-ghost"
            title="新建分卷"
            onClick={() => {
              setVolumeTitle(`第${volumes.length + 1}卷`)
              setVolumeOpen(true)
            }}
          >
            <Plus size={13} /> 分卷
          </button>
          <button className="btn btn-sm btn-ghost" title="新建章节" onClick={() => void createChapter()}>
            <Plus size={13} /> 章节
          </button>
          <PanelCollapseButton side="left" label="目录栏" />
        </div>
      </div>
      <div className="panel-body flush scroll-thin">
        <div className="chapter-tree">
          {sortedVolumes.map((volume) => {
            const volumeChapters = sortedChapters.filter((chapter) => chapter.volumeId === volume.id)
            const isCollapsed = collapsed[volume.id]
            return (
              <div className="volume-block" key={volume.id}>
                <div className="volume-head">
                  <button
                    className="top-icon"
                    style={{ width: 18, height: 22 }}
                    onClick={() => setCollapsed((state) => ({ ...state, [volume.id]: !state[volume.id] }))}
                  >
                    <ChevronDown
                      size={13}
                      style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}
                    />
                  </button>
                  <span className="volume-name">
                    {renaming?.type === 'volume' && renaming.id === volume.id ? (
                      <input
                        className="input sm"
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitRename()
                          if (event.key === 'Escape') setRenaming(null)
                        }}
                      />
                    ) : (
                      <span onDoubleClick={() => startRename('volume', volume.id, volume.title)}>{volume.title}</span>
                    )}
                  </span>
                  <span className="badge">{volumeChapters.length}</span>
                  <div className="volume-nav">
                    <button
                      className="top-icon"
                      style={{ width: 21, height: 21 }}
                      title="在本卷新建章节"
                      onClick={() => void createChapter(volume.id)}
                    >
                      <Plus size={12} />
                    </button>
                    <Dropdown
                      trigger={
                        <button className="top-icon" style={{ width: 21, height: 21 }} title="分卷操作">
                          <MoreHorizontal size={12} />
                        </button>
                      }
                    >
                      <button className="menu-item" onClick={() => startRename('volume', volume.id, volume.title)}>
                        重命名分卷
                      </button>
                      <button className="menu-item danger" onClick={() => setDeleteVolumeId(volume.id)}>
                        <Trash2 size={13} /> 删除分卷
                      </button>
                    </Dropdown>
                  </div>
                </div>
                {!isCollapsed && (
                  <div>
                    {volumeChapters.map(renderChapter)}
                    {volumeChapters.length === 0 && (
                      <div className="small muted" style={{ padding: '4px 12px 8px' }}>
                        本卷还没有章节
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {orphans.length > 0 && (
            <div className="volume-block">
              <div className="volume-head">
                <span style={{ width: 18 }} />
                <span className="volume-name">未分卷</span>
              </div>
              {orphans.map(renderChapter)}
            </div>
          )}

          {chapters.length === 0 && (
            <Empty
              icon={<FileText size={24} />}
              title="还没有章节"
              action={
                <button className="btn btn-sm btn-primary" onClick={() => void createChapter()}>
                  <Plus size={13} /> 新建第一章
                </button>
              }
            />
          )}

          <button className="tree-add" onClick={() => void createChapter()}>
            <Plus size={13} /> 新建章节
          </button>
        </div>
      </div>
      <div className="panel-foot">
        <div className="spread small muted">
          <span>{chapters.length} 章 · {sortedVolumes.length} 卷</span>
          <span>{formatNumber(totalWords)} 字</span>
        </div>
      </div>

      <Modal
        open={volumeOpen}
        title="新建分卷"
        onClose={() => setVolumeOpen(false)}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setVolumeOpen(false)}>
              取消
            </button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                if (!volumeTitle.trim()) return
                const id = await addVolume(volumeTitle.trim())
                setVolumeOpen(false)
                if (id) useApp.getState().toast('已创建分卷与卷大纲')
              }}
            >
              创建分卷
            </button>
          </>
        }
      >
        <label className="field">
          <span className="field-label">分卷名称</span>
          <input
            className="input"
            autoFocus
            value={volumeTitle}
            onChange={(event) => setVolumeTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              void addVolume(volumeTitle.trim() || '新卷').then(() => setVolumeOpen(false))
            }}
          />
        </label>
        <div className="hint-box" style={{ marginTop: 10 }}>
          新建分卷会同时创建对应的卷大纲，可在「结构」中填写。
        </div>
      </Modal>

      <Confirm
        open={Boolean(deleteChapterId)}
        title="删除章节"
        message="章节正文与对应章纲会从结构中移除（正文文件会保留在数据目录，可在回收文件里找回）。"
        confirmText="删除章节"
        onConfirm={() => {
          if (deleteChapterId) void deleteChapter(deleteChapterId)
          setDeleteChapterId(null)
        }}
        onClose={() => setDeleteChapterId(null)}
      />

      <Confirm
        open={Boolean(deleteVolumeId)}
        title="删除分卷"
        message="仅当分卷内没有章节时可以删除。删除分卷会同时移除它的卷大纲。"
        confirmText="删除分卷"
        onConfirm={() => {
          if (deleteVolumeId) deleteVolume(deleteVolumeId)
          setDeleteVolumeId(null)
        }}
        onClose={() => setDeleteVolumeId(null)}
      />
    </>
  )
}
