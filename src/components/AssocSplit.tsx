import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/utils'

const KEY = 'zhizhang.assocSplitHeight'
const MIN = 132
const EDITABLE = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

function defaultHeight() {
  return Math.round(Math.min(430, Math.max(210, window.innerHeight * 0.38)))
}

function readHeight() {
  const raw = Number(localStorage.getItem(KEY))
  return Number.isFinite(raw) && raw >= MIN ? raw : defaultHeight()
}

export default function AssocSplit({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  const shell = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(readHeight)
  const [maxHeight, setMaxHeight] = useState(() => Math.round(window.innerHeight * 0.72))
  const [focusHeight, setFocusHeight] = useState(() => Math.round(window.innerHeight * 0.9))
  const [focused, setFocused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const focusedRef = useRef(false)
  const restoreHeight = useRef<number | null>(null)
  const revealTimer = useRef<number | null>(null)
  const drag = useRef<{ startY: number; startH: number } | null>(null)

  const revealActive = () => {
    const active = document.activeElement as HTMLElement | null
    const box = shell.current?.getBoundingClientRect()
    if (!active || !box || !shell.current?.contains(active)) return
    const rect = active.getBoundingClientRect()
    const top = box.top + 62
    if (rect.bottom > box.bottom - 8 || rect.top < top) {
      active.scrollIntoView({ block: 'nearest' })
    }
  }

  const revealSoon = () => {
    if (revealTimer.current != null) window.clearTimeout(revealTimer.current)
    revealTimer.current = window.setTimeout(revealActive, 340)
  }

  useEffect(() => {
    const pane = shell.current?.parentElement
    return () => {
      if (revealTimer.current != null) window.clearTimeout(revealTimer.current)
      pane?.classList.remove('assoc-focus')
      if (document.documentElement.dataset.editFocus === 'assoc') delete document.documentElement.dataset.editFocus
    }
  }, [])

  useEffect(() => {
    if (open) return
    if (focusedRef.current) setFocusedState(false)
    const active = document.activeElement as HTMLElement | null
    if (active && shell.current?.contains(active)) active.blur()
  }, [open])

  useEffect(() => {
    const pane = shell.current?.parentElement
    if (!pane) return
    const measure = () => {
      const paneHeight = pane.getBoundingClientRect().height
      const fixed =
        (pane.querySelector('.editor-top')?.getBoundingClientRect().height || 0) +
        (pane.querySelector('.editor-status-bar')?.getBoundingClientRect().height || 0)
      const kb = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kb-inset')) || 0
      setMaxHeight(Math.max(MIN, Math.round(paneHeight * 0.72)))
      setFocusHeight(Math.max(180, Math.round(paneHeight - fixed - kb - 6)))
      setHeight((current) => Math.min(current, Math.max(MIN, Math.round(paneHeight * 0.72))))
      if (focusedRef.current) revealSoon()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(pane)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return () => {
      observer.disconnect()
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const paneHeight = shell.current?.parentElement?.getBoundingClientRect().height || 0
    if (paneHeight && height > paneHeight * 0.72) setHeight(Math.round(paneHeight * 0.72))
  }, [open, height])

  const setFocusedState = (value: boolean) => {
    focusedRef.current = value
    setFocused(value)
    shell.current?.parentElement?.classList.toggle('assoc-focus', value)
    const root = document.documentElement
    if (value) root.dataset.editFocus = 'assoc'
    else if (root.dataset.editFocus === 'assoc') delete root.dataset.editFocus
  }

  const handleFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (!target.closest?.(EDITABLE) || focusedRef.current) return
    restoreHeight.current = height
    setFocusedState(true)
    revealSoon()
  }

  const handleBlur = () => {
    window.setTimeout(() => {
      const active = document.activeElement as HTMLElement | null
      if (active && shell.current?.contains(active) && active.closest(EDITABLE)) return
      if (!focusedRef.current) return
      setFocusedState(false)
      if (restoreHeight.current != null) setHeight(restoreHeight.current)
      restoreHeight.current = null
    }, 0)
  }

  const stop = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = null
    setDragging(false)
    event.currentTarget.classList.remove('is-active')
    document.body.classList.remove('is-resizing-v')
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      /* 指针已释放时忽略 */
    }
    localStorage.setItem(KEY, String(Math.round(height)))
  }

  const shownHeight = !open ? 0 : focused ? Math.max(MIN, focusHeight) : Math.max(MIN, Math.min(height, maxHeight))

  return (
    <div
      ref={shell}
      className={cx('assoc-split', open && 'is-open', focused && 'is-focused', dragging && 'is-dragging')}
      style={{ height: `${shownHeight}px` }}
      aria-hidden={!open}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
    >
      <div className="assoc-split-inner">
        <div
          className="assoc-split-grip"
          role="separator"
          aria-orientation="horizontal"
          aria-label="拖动调整创作联动栏高度"
          onPointerDown={(event) => {
            const startHeight = shell.current?.getBoundingClientRect().height || height
            if (focusedRef.current) {
              restoreHeight.current = null
              setFocusedState(false)
              setHeight(Math.max(MIN, Math.round(startHeight)))
            }
            drag.current = { startY: event.clientY, startH: startHeight }
            setDragging(true)
            event.currentTarget.classList.add('is-active')
            document.body.classList.add('is-resizing-v')
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              /* 合成事件或指针已释放时忽略捕获 */
            }
          }}
          onPointerMove={(event) => {
            if (!drag.current) return
            const next = drag.current.startH + (drag.current.startY - event.clientY)
            setHeight(Math.round(Math.min(maxHeight, Math.max(MIN, next))))
          }}
          onPointerUp={stop}
          onPointerCancel={stop}
          onDoubleClick={() => setHeight(defaultHeight())}
        >
          <span />
        </div>
        {children}
      </div>
    </div>
  )
}
