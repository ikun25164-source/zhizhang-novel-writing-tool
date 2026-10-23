import { useEffect } from 'react'
import { useApp } from './store'
import type { ViewName } from './types'
import { installArrowNav } from './lib/arrowNav'
import AppShell from './components/AppShell'
import ProjectPicker from './components/ProjectPicker'

export default function App() {
  const ready = useApp((s) => s.ready)
  const project = useApp((s) => s.project)
  const settings = useApp((s) => s.project?.settings)
  const uiStyle = useApp((s) => s.uiStyle)
  const leftWidth = useApp((s) => s.leftWidth)
  const rightWidth = useApp((s) => s.rightWidth)

  useEffect(() => {
    void useApp.getState().init()
  }, [])

  useEffect(() => installArrowNav(), [])

  useEffect(() => {
    const root = document.documentElement
    const glass = uiStyle === 'glass'
    root.dataset.ui = uiStyle
    root.dataset.theme = glass ? 'light' : settings?.theme || 'light'
    root.style.setProperty('--editor-width', `${settings?.editorWidth || (glass ? 720 : 760)}px`)
    root.style.setProperty('--editor-font-size', `${settings?.fontSize || 18}px`)
    root.style.setProperty('--editor-line-height', String(settings?.lineHeight || 1.9))
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) {
      meta.setAttribute('content', glass ? '#f2f3f4' : settings?.theme === 'dark' ? '#171613' : '#f1ece2')
    }
    document.title = project ? `${project.title} · 织章` : '织章 · 小说创作工作台'
  }, [uiStyle, settings?.theme, settings?.editorWidth, settings?.fontSize, settings?.lineHeight, project])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--left-panel-width', `${leftWidth}px`)
    root.style.setProperty('--right-panel-width', `${rightWidth}px`)
  }, [leftWidth, rightWidth])

  useEffect(() => {
    const root = document.documentElement
    // 键盘有两种实现：压小 WebView（adjustResize，innerHeight 直接掉）或盖在上面（只有 visualViewport 掉）。
    // 只看 visualViewport 差值的话，前者会被判成「没弹键盘」，所以两种都算，基准高度随尺寸变化重置。
    let baseHeight = window.innerHeight
    let baseWidth = window.innerWidth
    const sync = () => {
      const viewport = window.visualViewport
      const visible = viewport ? viewport.height + viewport.offsetTop : window.innerHeight
      if (Math.abs(window.innerWidth - baseWidth) > 24 || window.innerHeight > baseHeight) {
        baseHeight = window.innerHeight
        baseWidth = window.innerWidth
      }
      const overlay = Math.max(0, window.innerHeight - visible)
      // 「压小 WebView」这种键盘只出现在触屏设备上；否则桌面端竖向缩小窗口会被误判成弹了键盘
      const touch = window.matchMedia('(hover: none)').matches || window.matchMedia('(pointer: coarse)').matches
      const squeezed = touch ? Math.max(0, baseHeight - window.innerHeight) : 0
      const keyboard = Math.max(overlay, squeezed)
      root.style.setProperty('--kb-inset', `${Math.round(overlay)}px`)
      root.style.setProperty('--app-safe-top', `${Math.round(viewport ? viewport.offsetTop : 0)}px`)
      root.dataset.keyboard = keyboard > 120 ? 'open' : 'closed'
    }
    sync()
    window.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('resize', sync)
    window.visualViewport?.addEventListener('scroll', sync)
    window.addEventListener('focusin', sync)
    return () => {
      window.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('resize', sync)
      window.visualViewport?.removeEventListener('scroll', sync)
      window.removeEventListener('focusin', sync)
    }
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        useApp.getState().setSearchOpen(true)
        return
      }
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void useApp.getState().flushAll()
        return
      }
      const VIEWS: ViewName[] = ['write', 'structure', 'timeline', 'characters', 'maps']
      if (event.altKey && !mod && /^[1-5]$/.test(event.key) && useApp.getState().project) {
        event.preventDefault()
        useApp.getState().setView(VIEWS[Number(event.key) - 1])
        return
      }
      if (event.key === 'Escape' && useApp.getState().mobileSheet !== 'none') {
        useApp.getState().setMobileSheet('none')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const flush = () => {
      if (useApp.getState().project) void useApp.getState().flushAll()
    }
    const onVisibility = () => {
      if (document.hidden) flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  if (!ready) {
    return (
      <div className="splash">
        <span className="splash-seal">织</span>
        <div className="row gap-8 small">
          <span className="spinner" /> 正在打开工作台…
        </div>
        <small>ZHIZHANG · NOVEL STUDIO</small>
      </div>
    )
  }

  if (!project) return <ProjectPicker />
  return <AppShell />
}
