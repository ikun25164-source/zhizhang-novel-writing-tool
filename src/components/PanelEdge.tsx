import { useRef } from 'react'
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useApp } from '../store'
import { cx } from '../lib/utils'

export default function PanelEdge({ side, label }: { side: 'left' | 'right'; label: string }) {
  const open = useApp((s) => (side === 'left' ? s.leftOpen : s.rightOpen))
  const setLeftOpen = useApp((s) => s.setLeftOpen)
  const setRightOpen = useApp((s) => s.setRightOpen)
  const setPanelWidth = useApp((s) => s.setPanelWidth)
  const dragging = useRef(false)

  if (!open) {
    const Icon = side === 'left' ? PanelLeftOpen : PanelRightOpen
    return (
      <button
        className={cx('panel-rail', `panel-rail-${side}`)}
        title={`展开${label}`}
        onClick={() => (side === 'left' ? setLeftOpen(true) : setRightOpen(true))}
      >
        <Icon size={15} />
        <span>{label}</span>
      </button>
    )
  }

  return (
    <div
      className={cx('panel-resizer', `panel-resizer-${side}`)}
      role="separator"
      aria-orientation="vertical"
      title={`拖动调整${label}宽度，双击恢复默认`}
      onPointerDown={(event) => {
        dragging.current = true
        event.currentTarget.classList.add('is-active')
        document.body.classList.add('is-resizing')
        document.documentElement.classList.add('panel-anim')
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* 合成事件或指针已释放时忽略捕获 */
        }
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return
        const root = event.currentTarget.parentElement
        if (!root) return
        const rect = root.getBoundingClientRect()
        const x = event.clientX - rect.left
        setPanelWidth(side, side === 'left' ? x : rect.width - x)
      }}
      onPointerUp={(event) => {
        dragging.current = false
        event.currentTarget.classList.remove('is-active')
        document.body.classList.remove('is-resizing')
        document.documentElement.classList.remove('panel-anim')
      }}
      onDoubleClick={() => setPanelWidth(side, side === 'left' ? 264 : 306)}
    />
  )
}

export function PanelCollapseButton({ side, label }: { side: 'left' | 'right'; label: string }) {
  const setLeftOpen = useApp((s) => s.setLeftOpen)
  const setRightOpen = useApp((s) => s.setRightOpen)
  const Icon = side === 'left' ? PanelLeftClose : PanelRightClose
  return (
    <button
      className="top-icon panel-collapse"
      title={`收起${label}`}
      onClick={() => (side === 'left' ? setLeftOpen(false) : setRightOpen(false))}
    >
      <Icon size={15} />
    </button>
  )
}
