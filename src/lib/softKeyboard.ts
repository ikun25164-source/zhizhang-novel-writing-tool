import { Capacitor, registerPlugin } from '@capacitor/core'

type HardwareKeyboardPlugin = {
  isAttached(): Promise<{ attached: boolean }>
  addListener(eventName: 'change', listener: (event: { attached: boolean }) => void): Promise<{ remove: () => void }>
}

const HardwareKeyboard = registerPlugin<HardwareKeyboardPlugin>('HardwareKeyboard')

const EDITABLE = 'input, textarea, [contenteditable="true"], [contenteditable=""]'
const MARK = 'data-hw-ime'
const PREV = 'data-hw-ime-prev'

// 这些 input 本来就不弹软键盘，不必也不该给它们加 inputmode
const NO_IME_TYPES = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'file', 'color', 'hidden', 'image'])

const root = document.documentElement
let attached = false

function suppress(target: EventTarget | null) {
  if (!attached || !(target instanceof HTMLElement)) return
  if (!target.matches(EDITABLE) || target.hasAttribute(MARK)) return
  if (target instanceof HTMLInputElement) {
    if (NO_IME_TYPES.has(target.type) || target.readOnly || target.disabled) return
  }
  if (target instanceof HTMLTextAreaElement && (target.readOnly || target.disabled)) return
  // 记住作者自己写的 inputmode（比如数字键盘），失焦时原样还回去
  target.setAttribute(PREV, target.getAttribute('inputmode') ?? '')
  target.setAttribute('inputmode', 'none')
  target.setAttribute(MARK, 'none')
}

function release(target: EventTarget | null) {
  if (!(target instanceof HTMLElement) || !target.hasAttribute(MARK)) return
  const prev = target.getAttribute(PREV)
  if (prev) target.setAttribute('inputmode', prev)
  else target.removeAttribute('inputmode')
  target.removeAttribute(PREV)
  target.removeAttribute(MARK)
}

/**
 * 接实体键盘时不弹软键盘：Android 侧把「有没有文字键盘」推过来，这里只给当前聚焦的可编辑元素
 * 加 inputmode="none"。软键盘不再出现，但 WebView 的 InputConnection 照常建立，输入法的
 * 硬件按键与候选词不受影响；键盘拔掉后立刻恢复原样。
 */
export function installSoftKeyboardGuard() {
  if (Capacitor.getPlatform() !== 'android') return () => {}

  let disposed = false
  const onFocus = (event: FocusEvent) => suppress(event.target)
  const onPointer = (event: PointerEvent) => suppress(event.target)
  const onBlur = (event: FocusEvent) => release(event.target)
  const setAttached = (next: boolean) => {
    attached = next
    root.dataset.hwKeyboard = next ? 'on' : 'off'
    if (next) suppress(document.activeElement)
    else root.querySelectorAll(`[${MARK}]`).forEach((el) => release(el))
  }

  document.addEventListener('focusin', onFocus, true)
  document.addEventListener('pointerdown', onPointer, true)
  document.addEventListener('focusout', onBlur, true)

  void HardwareKeyboard.isAttached()
    .then((res) => setAttached(res.attached))
    .catch(() => {})

  let handle: { remove: () => void } | null = null
  void HardwareKeyboard.addListener('change', (event) => setAttached(event.attached))
    .then((res) => {
      if (disposed) res.remove()
      else handle = res
    })
    .catch(() => {})

  return () => {
    disposed = true
    document.removeEventListener('focusin', onFocus, true)
    document.removeEventListener('pointerdown', onPointer, true)
    document.removeEventListener('focusout', onBlur, true)
    handle?.remove()
    root.querySelectorAll(`[${MARK}]`).forEach((el) => release(el))
    delete root.dataset.hwKeyboard
  }
}
