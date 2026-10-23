import type { ReactNode } from 'react'
import { Palette, Settings as SettingsIcon, PanelLeft, PanelRight, Search } from 'lucide-react'
import { useApp } from '../store'
import type { ViewName } from '../types'
import { cx, formatNumber } from '../lib/utils'
import { useIsNarrow } from '../lib/useMedia'
import PublishMenu from './PublishMenu'

const VIEWS: Array<{ key: ViewName; label: string; icon: ReactNode }> = [
  { key: 'write', label: '写作', icon: <PenIcon /> },
  { key: 'structure', label: '结构', icon: <TreeIcon /> },
  { key: 'timeline', label: '事件线', icon: <BranchIcon /> },
  { key: 'characters', label: '人物', icon: <UsersIcon /> },
  { key: 'maps', label: '地图', icon: <MapIcon /> },
]

function PenIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}
function TreeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h6v4H4z" />
      <path d="M14 10h6v4h-6z" />
      <path d="M14 16h6v4h-6z" />
      <path d="M7 8v10h7" />
      <path d="M14 12H9" />
    </svg>
  )
}
function BranchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 7v10" />
      <path d="M8 7c0 5 8 3 8 3" />
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5" />
      <path d="M16 5.5a3 3 0 0 1 0 5" />
      <path d="M18 15c2 .7 3 2.3 3 5" />
    </svg>
  )
}
function MapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </svg>
  )
}

export { VIEWS }

export default function TopBar() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const project = useApp((s) => s.project)
  const chapters = useApp((s) => s.chapters)
  const saveState = useApp((s) => s.saveState)
  const setSearchOpen = useApp((s) => s.setSearchOpen)
  const setSettingsOpen = useApp((s) => s.setSettingsOpen)
  const setMobileSheet = useApp((s) => s.setMobileSheet)
  const mobileSheet = useApp((s) => s.mobileSheet)
  const rightOpen = useApp((s) => s.rightOpen)
  const setRightOpen = useApp((s) => s.setRightOpen)
  const leftOpen = useApp((s) => s.leftOpen)
  const setLeftOpen = useApp((s) => s.setLeftOpen)
  const uiStyle = useApp((s) => s.uiStyle)
  const setUiStyle = useApp((s) => s.setUiStyle)
  const narrow = useIsNarrow()
  const assocOpen = narrow ? mobileSheet === 'right' : rightOpen

  const hasRight = view === 'write' || view === 'timeline' || view === 'maps'
  const totalWords = chapters.reduce((sum, chapter) => sum + (chapter.wordCount || 0), 0)
  const saveLabel =
    saveState === 'saving'
      ? '保存中'
      : saveState === 'dirty'
        ? '未保存'
        : saveState === 'error'
          ? '保存失败'
          : saveState === 'conflict'
            ? '冲突'
            : '已保存'

  return (
    <header className="topbar">
      <button
        className={cx('top-icon side-toggle', !leftOpen && 'is-off')}
        title={leftOpen ? '收起左侧目录栏' : '展开左侧目录栏'}
        onClick={() => {
          if (window.matchMedia('(max-width: 1023px)').matches) setMobileSheet('left')
          else setLeftOpen(!leftOpen)
        }}
      >
        <PanelLeft size={17} />
      </button>
      <div className="brand">
        <span className="brand-seal">织</span>
        <span className="brand-text">
          <b>织章</b>
          <span>NOVEL STUDIO</span>
        </span>
      </div>
      <div className="topbar-divider" />
      <button className="project-title" onClick={() => setSettingsOpen(true)} title="作品设置">
        <b>{project?.title || '未命名作品'}</b>
        <span>
          {project?.author || '未署名'} · {formatNumber(totalWords)} 字
        </span>
      </button>

      <nav className="nav">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            className={cx('nav-btn', view === item.key && 'active')}
            data-nav-switch
            onClick={() => setView(item.key)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="top-actions">
        <PublishMenu />
        <button className="top-icon" title="全局搜索 (Ctrl/⌘ K)" onClick={() => setSearchOpen(true)}>
          <Search size={17} />
        </button>
        {hasRight && (
          <button
            className={cx('top-icon right-toggle', !assocOpen && 'is-off')}
            title={assocOpen ? '收起创作联动栏' : '展开创作联动栏'}
            onClick={() => {
              if (!window.matchMedia('(max-width: 1023px)').matches) {
                setRightOpen(!rightOpen)
                return
              }
              setMobileSheet(mobileSheet === 'right' ? 'none' : 'right')
            }}
          >
            <PanelRight size={17} />
          </button>
        )}
        <span className={cx('save-pill', saveState)} title={saveLabel}>
          <span className="status-dot" />
          <span className="label">{saveLabel}</span>
        </span>
        <button
          className="top-icon"
          title={uiStyle === 'glass' ? '切换到素纸原版界面' : '切换到玻璃拟态界面'}
          onClick={() => setUiStyle(uiStyle === 'glass' ? 'paper' : 'glass')}
        >
          <Palette size={17} />
        </button>
        <button className="top-icon" title="作品设置" onClick={() => setSettingsOpen(true)}>
          <SettingsIcon size={17} />
        </button>
      </div>
    </header>
  )
}
