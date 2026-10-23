import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, X } from 'lucide-react'
import { cx } from '../lib/utils'

const FOCUSABLES =
  'button:not([disabled]), a[href], input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable=true]'

// 记住弹窗外最后聚焦过的元素：弹窗关闭后把焦点还给它，键盘操作才不会断链。
// 下拉菜单项随菜单一起卸载，所以直接记它的触发按钮。
let lastOutsideModal: HTMLElement | null = null
if (typeof window !== 'undefined') {
  window.addEventListener(
    'focusin',
    (event) => {
      const el = event.target as HTMLElement | null
      if (!el || el.closest('.modal-mask')) return
      const pop = el.closest('.menu-pop')
      lastOutsideModal = pop ? (pop.parentElement?.querySelector<HTMLElement>(FOCUSABLES) ?? el) : el
    },
    true,
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
  narrow,
  icon,
}: {
  open: boolean
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  narrow?: boolean
  icon?: ReactNode
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  const pickFocusables = () => {
    const root = boxRef.current
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLES)).filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    })
  }

  // 只依赖 open：onClose 每次渲染都是新函数，放进依赖会让焦点反复抢来抢去
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const timer = window.setTimeout(() => {
      if (boxRef.current?.contains(document.activeElement)) return
      const first = pickFocusables()[0]
      ;(first ?? boxRef.current)?.focus()
    }, 40)
    return () => {
      window.clearTimeout(timer)
      const still = document.activeElement as HTMLElement | null
      // 卸载时焦点通常还在弹窗里（马上要跟着一起消失），只有被应用主动挪到别处时才不抢回来
      if (still && still !== document.body && !boxRef.current?.contains(still)) return
      const connectedAncestor = (from: HTMLElement | null) => {
        let node: HTMLElement | null = from
        while (node && !node.isConnected) node = node.parentElement
        return node && node !== document.body && node !== document.documentElement ? node : null
      }
      // 打开弹窗的可能是下拉菜单里的一项，关闭时那一项已卸载，往上找回还挂着的容器（通常是触发按钮）
      const back = connectedAncestor(previous) ?? connectedAncestor(lastOutsideModal)
      if (!back) return
      const target = back.matches(FOCUSABLES) ? back : back.querySelector<HTMLElement>(FOCUSABLES)
      target?.focus?.()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = pickFocusables()
      if (!items.length) return
      const active = document.activeElement as HTMLElement | null
      const last = items[items.length - 1]
      const first = items[0]
      if (event.shiftKey) {
        if (active === first || active === boxRef.current) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div className="modal-mask" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'wide', narrow && 'narrow')} role="dialog" aria-modal="true" tabIndex={-1} ref={boxRef}>
        {title !== undefined && (
          <div className="modal-head">
            {icon}
            <h3>{title}</h3>
            <button className="modal-close" onClick={onClose} aria-label="关闭">
              <X size={17} />
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function Confirm({
  open,
  title,
  message,
  confirmText = '确认',
  danger = true,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      narrow
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            className={cx('btn', danger ? 'btn-danger' : 'btn-primary')}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--ink-2)' }}>{message}</div>
    </Modal>
  )
}

export function Dropdown({
  trigger,
  children,
  align = 'right',
  className,
}: {
  trigger: ReactNode
  children: ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  // 菜单项 / Esc 关闭后，焦点原本挂在已经卸载的菜单项上，这里交回触发按钮
  const closeAndRestore = () => {
    setOpen(false)
    requestAnimationFrame(() => {
      const trigger = triggerRef.current?.querySelector<HTMLElement>(FOCUSABLES)
      if (trigger && document.activeElement === document.body) trigger.focus()
    })
  }

  useEffect(() => {
    if (!open) return
    const handler = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false)
    }
    const esc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeAndRestore()
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('keydown', esc, true)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('keydown', esc, true)
    }
  }, [open])

  return (
    <div className={cx('menu-wrap', className)} ref={wrapRef}>
      <div
        ref={triggerRef}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((v) => !v)
        }}
        style={{ display: 'inline-flex' }}
      >
        {trigger}
      </div>
      {open && (
        <div
          className={cx('menu-pop', align === 'left' && 'left')}
          onClick={(event) => {
            const target = event.target as HTMLElement
            if (target.closest('button')) closeAndRestore()
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function Field({
  label,
  children,
  hint,
  className,
}: {
  label?: ReactNode
  children: ReactNode
  hint?: ReactNode
  className?: string
}) {
  return (
    <label className={cx('field', className)}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {hint && <span className="field-label" style={{ opacity: 0.8 }}>{hint}</span>}
    </label>
  )
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      {icon}
      {title && <b style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{title}</b>}
      {children && <div>{children}</div>}
      {action}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; title?: string }>
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cx('segmented', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          className={cx('segment', value === option.value && 'active')}
          data-nav-switch
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: ReactNode
}) {
  return (
    <label className="checkbox" style={{ cursor: 'pointer' }}>
      <span
        onClick={() => onChange(!checked)}
        style={{
          width: 34,
          height: 20,
          borderRadius: 99,
          background: checked ? 'var(--accent)' : 'var(--line-strong)',
          position: 'relative',
          transition: 'background .15s',
          flex: '0 0 auto',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 16 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left .15s',
            boxShadow: '0 1px 2px rgba(0,0,0,.2)',
          }}
        />
      </span>
      {label}
    </label>
  )
}

export function TagInput({
  value,
  placeholder,
  onChange,
}: {
  value: string[]
  placeholder?: string
  onChange: (tags: string[]) => void
}) {
  const [text, setText] = useState(value.join('、'))
  useEffect(() => {
    setText(value.join('、'))
  }, [value])

  return (
    <input
      className="input"
      value={text}
      placeholder={placeholder || '用顿号或逗号分隔'}
      onChange={(event) => {
        setText(event.target.value)
        const tags = event.target.value
          .split(/[、,，;；\s]+/)
          .map((t) => t.trim())
          .filter(Boolean)
        onChange(Array.from(new Set(tags)))
      }}
    />
  )
}

export function InlineEdit({
  value,
  onChange,
  className,
  placeholder,
  multiline,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus()
      ref.current.select()
    }
  }, [editing])

  const finish = (save: boolean) => {
    setEditing(false)
    if (save) {
      const next = draft.trim()
      if (next && next !== value) onChange(next)
      else setDraft(value)
    } else {
      setDraft(value)
    }
  }

  if (editing) {
    const shared = {
      value: draft,
      placeholder,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(event.target.value),
      onBlur: () => finish(true),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && !(multiline && event.shiftKey)) {
          event.preventDefault()
          finish(true)
        }
        if (event.key === 'Escape') finish(false)
      },
    }
    return multiline ? (
      <textarea ref={(node) => { ref.current = node }} className={cx('input', className)} rows={3} {...shared} />
    ) : (
      <input ref={(node) => { ref.current = node }} className={cx('input', className)} {...shared} />
    )
  }

  return (
    <span
      className={className}
      title="点击重命名"
      onClick={() => setEditing(true)}
      style={{ cursor: 'text', display: 'inline-block', maxWidth: '100%' }}
    >
      {value || <span style={{ color: 'var(--muted)' }}>{placeholder}</span>}
    </span>
  )
}

export function TypeIcon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {children}
    </span>
  )
}

export function CheckItem({ label, checked, onClick }: { label: ReactNode; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={cx('entity-row', checked && 'checked')}
      onClick={onClick}
      style={checked ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : undefined}
    >
      <span
        style={{
          width: 15,
          height: 15,
          borderRadius: 4,
          border: '1px solid var(--line-strong)',
          display: 'grid',
          placeItems: 'center',
          background: checked ? 'var(--accent)' : 'transparent',
          color: '#fff',
          flex: '0 0 auto',
        }}
      >
        {checked && <Check size={11} />}
      </span>
      <span className="grow">{label}</span>
    </button>
  )
}

export function SelectChevron() {
  return <ChevronDown size={14} />
}
