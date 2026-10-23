import { useMemo, useState } from 'react'
import { BookOpen, ChevronDown, ListTree, Plus, ScrollText } from 'lucide-react'
import { useApp } from '../store'
import { isNavActivation } from '../lib/arrowNav'
import type { OutlineNode, Volume } from '../types'
import { cx, inertAttr, sortByOrder } from '../lib/utils'
import { useIsNarrow } from '../lib/useMedia'
import { OutlineDetail } from './details'
import PanelEdge from './PanelEdge'
import { Dropdown, Empty, Modal } from './ui'

export default function StructureView() {
  const outlines = useApp((s) => s.outlines)
  const volumes = useApp((s) => s.volumes)
  const chapters = useApp((s) => s.chapters)
  const selectedOutlineId = useApp((s) => s.selectedOutlineId)
  const selectOutline = useApp((s) => s.selectOutline)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const mobileSheet = useApp((s) => s.mobileSheet)
  const leftOpen = useApp((s) => s.leftOpen)
  const createChapter = useApp((s) => s.createChapter)
  const addVolume = useApp((s) => s.addVolume)

  const narrow = useIsNarrow()

  const [volumeOpen, setVolumeOpen] = useState(false)
  const [volumeTitle, setVolumeTitle] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const master = outlines.find((node) => node.level === 'master')
  const selected = outlines.find((node) => node.id === selectedOutlineId) || master || outlines[0] || null
  const sortedVolumes = useMemo(() => sortByOrder(volumes), [volumes])
  const sortedChapters = useMemo(() => sortByOrder(chapters), [chapters])
  const volumeOutlines = useMemo(
    () =>
      outlines
        .filter((node) => node.level === 'volume')
        .sort((a, b) => {
          const av = volumes.find((volume) => volume.id === a.volumeId)?.order ?? a.order
          const bv = volumes.find((volume) => volume.id === b.volumeId)?.order ?? b.order
          return av - bv
        }),
    [outlines, volumes],
  )
  const orphanChapterOutlines = outlines.filter(
    (node) =>
      node.level === 'chapter' &&
      !volumeOutlines.some((volumeOutline) => volumeOutline.id === node.parentId),
  )

  const pick = (id: string) => {
    selectOutline(id)
    if (!isNavActivation()) setMobileSheet('none')
  }

  const renderNode = (node: OutlineNode, depth: number) => {
    const active = node.id === selected?.id
    return (
      <button
        key={node.id}
        className={cx('outline-node', `depth-${depth}`, active && 'active')}
        data-nav-switch
        onClick={() => pick(node.id)}
      >
        <span className={`level-mark ${node.level}`} />
        <span className="grow">{node.title}</span>
        {node.level === 'chapter' && node.eventIds.length > 0 && <span className="badge">{node.eventIds.length}</span>}
      </button>
    )
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
            <ListTree size={14} /> 结构
          </div>
          <Dropdown
            align="right"
            trigger={
              <button className="btn btn-sm btn-ghost" title="新建结构">
                <Plus size={14} /> 新建
              </button>
            }
          >
            <button
              className="menu-item"
              onClick={() => {
                setVolumeTitle(`第${volumes.length + 1}卷`)
                setVolumeOpen(true)
              }}
            >
              <ScrollText size={13} /> 新建分卷与卷纲
            </button>
            <button className="menu-item" onClick={() => void createChapter()}>
              <BookOpen size={13} /> 新建章节与章纲
            </button>
          </Dropdown>
        </div>
        <div className="panel-body flush scroll-thin">
          <div className="outline-tree">
            {master && renderNode(master, 0)}
            {volumeOutlines.map((volumeOutline) => {
              const isCollapsed = collapsed[volumeOutline.id]
              const volume = volumes.find((item: Volume) => item.id === volumeOutline.volumeId)
              const childChapters = sortedChapters.filter((chapter) => chapter.volumeId === volumeOutline.volumeId)
              const children = childChapters
                .map((chapter) => outlines.find((node) => node.level === 'chapter' && node.chapterId === chapter.id))
                .filter(Boolean) as OutlineNode[]
              return (
                <div key={volumeOutline.id}>
                  <div className="row" style={{ gap: 0 }}>
                    <button
                      className="top-icon"
                      style={{ width: 20, height: 26, marginLeft: 4 }}
                      title={`${isCollapsed ? '展开' : '收起'}${volumeOutline.title}`}
                      aria-expanded={!isCollapsed}
                      onClick={() => setCollapsed((state) => ({ ...state, [volumeOutline.id]: !state[volumeOutline.id] }))}
                    >
                      <ChevronDown
                        size={12}
                        style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }}
                      />
                    </button>
                    <div className="grow">{renderNode(volumeOutline, 1)}</div>
                  </div>
                  {!isCollapsed && (
                    <>
                      <div
                        className="small muted"
                        style={{ padding: '0 0 2px 44px', fontSize: 10.5 }}
                      >
                        {volume?.title} · {children.length} 章
                      </div>
                      {children.map((child) => renderNode(child, 2))}
                      {children.length === 0 && (
                        <div className="small muted" style={{ padding: '2px 0 6px 44px', fontSize: 11 }}>
                          暂无章纲
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
            {orphanChapterOutlines.map((node) => renderNode(node, 1))}
            {outlines.length === 0 && <Empty>还没有结构大纲</Empty>}
          </div>
        </div>
        <div className="panel-foot">
          <div className="spread small muted">
            <span>{outlines.length} 个纲目</span>
            <span>{volumes.length} 卷 · {chapters.length} 章</span>
          </div>
        </div>
      </aside>
      <PanelEdge side="left" label="纲目" />

      <main className="center-pane">
        <div className="center-scroll scroll-thin">
          {selected ? (
            <OutlineDetail key={selected.id} id={selected.id} />
          ) : (
            <Empty icon={<ScrollText size={30} />} title="还没有大纲">
              在左侧新建分卷或章节，系统会自动生成对应的卷纲与章纲。
            </Empty>
          )}
        </div>
      </main>

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
                if (id) {
                  const outline = useApp.getState().outlines.find((node) => node.level === 'volume' && node.volumeId === id)
                  if (outline) selectOutline(outline.id)
                }
              }}
            >
              创建
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
          />
        </label>
      </Modal>
    </div>
  )
}
