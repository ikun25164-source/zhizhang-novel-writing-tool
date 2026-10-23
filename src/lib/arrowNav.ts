const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])

type Arrow = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'

const FOCUSABLE = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[role="button"]:not([aria-disabled="true"])',
  '[role="tab"]:not([aria-disabled="true"])',
  '[role="option"]:not([aria-disabled="true"])',
  '[role="menuitem"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

// 这些控件用方向键做原生操作（步进、下拉、分段选择），不参与焦点移动
const SPIN_INPUTS = new Set(['number', 'range', 'date', 'time', 'datetime-local', 'month', 'week'])
const PLAIN_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'color', 'image'])

let activating = false

/** 由方向键触发的 click 期间为 true，列表组件据此避免关抽屉 / 弹面板。 */
export const isNavActivation = () => activating

const inputType = (el: HTMLElement) => (el instanceof HTMLInputElement ? el.type : '')

// 上下键：多行文本、下拉、富文本、数字/日期/滑杆保留原生行为，单行输入框允许离开
const isTextControl = (el: HTMLElement): boolean => {
  if (el.isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') return !PLAIN_INPUTS.has(inputType(el))
  return false
}

const keepsVerticalArrows = (el: HTMLElement | null): boolean => {
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') return SPIN_INPUTS.has(inputType(el))
  return el.isContentEditable
}

// 左右键：所有文本控件保留光标移动
const keepsHorizontalArrows = (el: HTMLElement | null): boolean => {
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') return !PLAIN_INPUTS.has(inputType(el))
  return el.isContentEditable
}

const FREE_TEXT_INPUTS = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password'])

// 单行输入框的光标顶到首 / 尾时，再按同一个方向就离开输入框，避免键盘卡在输入框里
const atInputEdge = (el: HTMLElement | null, dir: Arrow): boolean => {
  if (!(el instanceof HTMLInputElement) || !FREE_TEXT_INPUTS.has(el.type)) return false
  const start = el.selectionStart
  const end = el.selectionEnd
  if (start === null || end === null || start !== end) return false
  return dir === 'ArrowLeft' ? start === 0 : start === el.value.length
}

// 富文本里光标停在整篇首 / 末行时，↑ / ↓ 允许离开编辑器
const atEditableEdge = (el: HTMLElement, dir: Arrow): boolean => {
  const sel = window.getSelection()
  if (!sel || !sel.isCollapsed || !sel.rangeCount) return false
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer)) return false
  const rest = document.createRange()
  rest.selectNodeContents(el)
  if (dir === 'ArrowUp') rest.setEnd(range.startContainer, range.startOffset)
  else rest.setStart(range.endContainer, range.endOffset)
  if (rest.toString().replace(/[\s\u200b]/g, '')) return false
  const caret = range.getClientRects()[0] || range.getBoundingClientRect()
  const all = document.createRange()
  all.selectNodeContents(el)
  const lines = all.getClientRects()
  if (!lines.length || !caret.height) return true
  const line = dir === 'ArrowUp' ? lines[0] : lines[lines.length - 1]
  return dir === 'ArrowUp' ? caret.top <= line.top + 2 : caret.bottom >= line.bottom - 2
}

const isVisible = (el: HTMLElement): boolean => {
  if (el.closest('[inert], [aria-hidden="true"]')) return false
  if (typeof el.checkVisibility === 'function') {
    if (!el.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false
  } else {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return false
  }
  const rect = el.getBoundingClientRect()
  return (
    rect.width >= 4 &&
    rect.height >= 4 &&
    rect.bottom > 0 &&
    rect.top < window.innerHeight &&
    rect.right > 0 &&
    rect.left < window.innerWidth
  )
}

const lastVisible = <T extends HTMLElement>(list: ArrayLike<T>): T | null => {
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (isVisible(list[i])) return list[i]
  }
  return null
}

const scopeOf = (base: Element | null): HTMLElement => {
  const menu =
    base?.closest<HTMLElement>('.menu-pop') ??
    base?.closest('.menu-wrap')?.querySelector<HTMLElement>('.menu-pop')
  if (menu) return menu
  const mask = lastVisible(document.querySelectorAll<HTMLElement>('.modal-mask'))
  if (mask) return mask
  const peek = document.querySelector<HTMLElement>('.peek-drawer')
  if (peek) return peek
  const drawer = document.querySelector<HTMLElement>('.side-panel.mobile-open')
  if (drawer) return drawer
  return document.body
}

const collect = (scope: HTMLElement): HTMLElement[] =>
  Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.closest('[inert], [aria-hidden="true"]')) return false
    if (el.getAttribute('aria-disabled') === 'true') return false
    if (el.closest('.ProseMirror') && !el.classList.contains('ProseMirror')) return false
    if (el.closest('[contenteditable="true"]') && !el.isContentEditable) return false
    return isVisible(el)
  })

const centerOf = (el: HTMLElement) => {
  const rect = el.getBoundingClientRect()
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

const overlaps = (a1: number, a2: number, b1: number, b2: number) => Math.min(a2, b2) - Math.max(a1, b1) > 2

const REGIONS = '.side-panel, .center-pane, .topbar, .bottom-nav, .modal-mask, .peek-drawer, .menu-pop'
const regionOf = (el: Element) => el.closest<HTMLElement>(REGIONS)

// 横向工具条：左右键只在本行内移动，走到头停下，不掉进上下别的行
const ROW_BARS = '.topbar, .bottom-nav, .panel-head, .editor-top, .editor-toolbar, .mini-toolbar, .view-head, .timeline-toolbar, .map-toolbar, .editor-status-bar'

// 左右移动优先落在同一行的同一栏（顶栏 / 目录 / 正文 / 侧栏）；同行没有目标时，找最近的一行再跳到那一行最远的一项
const pickHorizontal = (from: HTMLElement, candidates: HTMLElement[], dir: Arrow) => {
  const base = from.getBoundingClientRect()
  const mid = (base.top + base.bottom) / 2
  const forward = dir === 'ArrowRight'
  const side = (el: HTMLElement) => Math.abs(centerOf(el).y - mid)
  const region = regionOf(from)
  const ahead = candidates.filter((el) => {
    const rect = el.getBoundingClientRect()
    if (!(forward ? rect.right > base.right + 2 : rect.left < base.left - 2)) return false
    // 视图切换项只有在同一栏（桌面顶栏、手机底栏）内才参与左右移动，避免内容区按键误触换页
    return !isViewNav(el) || overlaps(base.top, base.bottom, rect.top, rect.bottom)
  })
  if (!ahead.length) return null

  const sameRow = ahead.filter((el) => {
    const rect = el.getBoundingClientRect()
    return overlaps(base.top, base.bottom, rect.top, rect.bottom) && (!region || regionOf(el) === region)
  })
  if (sameRow.length) {
    let pick: HTMLElement | null = null
    let bestScore = Infinity
    for (const el of sameRow) {
      const rect = el.getBoundingClientRect()
      const gap = forward ? rect.left - base.right : base.left - rect.right
      const score = gap + side(el) * 1.8
      if (score < bestScore) {
        bestScore = score
        pick = el
      }
    }
    return pick
  }

  // 横向工具条上的左右移动只在本行内进行，走到头就停下，不跨行跳进别的区域
  if (from.closest(ROW_BARS)) return null

  // 视图按钮只在本行内移动，走到两端就停下，不再跨行乱跳或首尾循环
  if (isViewNav(from)) return null

  // 跨行也只在同一栏里找，别从目录一路横跨到正文工具条
  const pool = region ? ahead.filter((el) => regionOf(el) === region) : ahead
  if (!pool.length) return null

  let nearest = Infinity
  for (const el of pool) nearest = Math.min(nearest, side(el))
  const row = pool.filter((el) => side(el) <= nearest + 24)
  return row.reduce((best, el) => (forward ? centerOf(el).x > centerOf(best).x : centerOf(el).x < centerOf(best).x) ? el : best)
}

function bestInDirection(from: { x: number; y: number }, list: HTMLElement[], dir: Arrow, current: HTMLElement | null) {
  let pick: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of list) {
    if (el === current || el.contains(current)) continue
    const point = centerOf(el)
    const dx = point.x - from.x
    const dy = point.y - from.y
    let primary = 0
    let side = 0
    if (dir === 'ArrowRight') {
      if (dx < 4) continue
      primary = dx
      side = Math.abs(dy)
    } else if (dir === 'ArrowLeft') {
      if (dx > -4) continue
      primary = -dx
      side = Math.abs(dy)
    } else if (dir === 'ArrowDown') {
      if (dy < 4) continue
      primary = dy
      side = Math.abs(dx)
    } else {
      if (dy > -4) continue
      primary = -dy
      side = Math.abs(dx)
    }
    const score = primary + side * 1.8
    if (score < bestScore) {
      bestScore = score
      pick = el
    }
  }
  return pick
}

const isViewNav = (el: HTMLElement) => el.classList.contains('nav-btn') || el.classList.contains('bottom-btn')

// 侧栏折叠开关只是布局开关，方向键浏览时跳过，免得焦点停在「收起目录栏」这类小图标上；Tab 仍可到达
const LAYOUT_CHROME = '.side-toggle, .panel-collapse'
const isLayoutChrome = (el: HTMLElement) => el.matches(LAYOUT_CHROME)

// Home / End 只在同一组（最小公共容器）内跳首尾，避免跳到整页最后一个按钮
const topLevel = (items: HTMLElement[]) =>
  items.filter((el) => !items.some((other) => other !== el && other.contains(el)))

const groupOf = (current: HTMLElement, list: HTMLElement[]) => {
  let node = current.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    const group = list.filter((el) => node!.contains(el))
    if (group.length > 1) return topLevel(group)
    node = node.parentElement
  }
  return topLevel(list)
}

const viewNeighbour = (list: HTMLElement[], current: HTMLElement, dir: Arrow) => {
  const views = list.filter(isViewNav)
  const index = views.indexOf(current)
  if (index < 0) return null
  const next = views[index + (dir === 'ArrowRight' ? 1 : -1)]
  return next ?? null
}

// 搜索框 ↓ 直达第一条结果 / 列表项
const RESULT_ROWS = ['search-result', 'char-row', 'map-row', 'chapter-item', 'outline-node', 'entity-row']

export function installArrowNav() {
  let cursor: HTMLElement | null = null

  const remember = (el: HTMLElement) => {
    cursor = el
  }

  const moveTo = (el: HTMLElement) => {
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    remember(el)
    if (el.dataset.navSwitch === undefined) return
    activating = true
    try {
      el.click()
    } finally {
      activating = false
    }
    if (el.isConnected) remember(el)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return

    const target = event.target instanceof HTMLElement ? event.target : null
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null

    // role="button" 的容器（章节、作品卡）按空格激活
    if (event.key === ' ' && !event.repeat) {
      const el = active
      if (
        el &&
        el !== document.body &&
        el.getAttribute('role') === 'button' &&
        el.getAttribute('aria-disabled') !== 'true' &&
        el.tagName !== 'BUTTON' &&
        el.tagName !== 'A' &&
        !el.isContentEditable
      ) {
        event.preventDefault()
        el.click()
      }
      return
    }

    const isHomeEnd = event.key === 'Home' || event.key === 'End'
    if (!ARROWS.has(event.key) && !isHomeEnd) return

    const control = target ?? active

    if (isHomeEnd) {
      if (keepsHorizontalArrows(control)) return
    } else {
      const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'
      if (control && (vertical ? keepsVerticalArrows(control) : keepsHorizontalArrows(control))) {
        const dir = event.key as Arrow
        const leaves = vertical
          ? control.isContentEditable && atEditableEdge(control, dir)
          : atInputEdge(control, dir)
        if (!leaves) {
          // 文本控件内保留原生光标 / 选项移动；搜索框 ↓ 进入结果列表
          if (event.key !== 'ArrowDown' || !target?.closest('.search-box')) return
          const scope = scopeOf(target)
          const first = collect(scope).find((el) => RESULT_ROWS.some((cls) => el.classList.contains(cls)))
          if (!first) return
          event.preventDefault()
          moveTo(first)
          return
        }
        if (vertical) {
          // 正文顶到首行 / 末行时：↑ 回到章节标题，↓ 落到字数状态栏
          const landing = collect(scopeOf(control))
            .filter((el) => !isLayoutChrome(el))
            .find((el) =>
              dir === 'ArrowUp'
                ? el.classList.contains('chapter-title-input')
                : el.closest('.editor-status-bar') && el !== control,
            )
          if (!landing) return
          event.preventDefault()
          moveTo(landing)
          return
        }
        // 单行输入框光标到端点后，左右键交给全站导航
      }
    }

    const scope = scopeOf(control)
    const all = collect(scope)
    const list = all.filter((el) => !isLayoutChrome(el))
    if (!list.length) return

    let current: HTMLElement | null = active && all.includes(active) ? active : null
    if (!current && cursor && cursor.isConnected && all.includes(cursor)) current = cursor

    if (!current) {
      // 点完列表项后抽屉收起，焦点还挂在隐藏的元素上：把焦点送回可见内容，而不是当成“没有焦点”去换视图
      if (active && active !== document.body && !isVisible(active)) {
        event.preventDefault()
        const landing =
          list.find((el) => el.closest('.center-pane') && !isTextControl(el)) ??
          list.find((el) => el.closest('.center-pane')) ??
          list[0]
        if (landing) moveTo(landing)
        return
      }
      // 弹窗 / 下拉菜单已打开但焦点还在外面：先把焦点送进去
      if (scope !== document.body) {
        event.preventDefault()
        const fromEnd = event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'End'
        moveTo(fromEnd ? list[list.length - 1] : list[0])
        return
      }
      if (isHomeEnd) return
      // 整页没有焦点时：左右方向键从当前视图的导航项开始切换，上下留给浏览器滚动
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const nav =
        list.find((el) => el.classList.contains('bottom-btn') && el.classList.contains('active')) ||
        list.find((el) => el.classList.contains('nav-btn') && el.classList.contains('active'))
      if (!nav) return
      event.preventDefault()
      moveTo(viewNeighbour(list, nav, event.key as Arrow) ?? nav)
      return
    }

    if (isHomeEnd) {
      // 弹窗 / 详情抽屉按整个面板算首尾；列表、菜单、抽屉里仍按同一组算
      const wholeScope = scope.classList.contains('modal-mask') || scope.classList.contains('peek-drawer')
      const group = wholeScope ? topLevel(list) : groupOf(current, list)
      const edge = event.key === 'Home' ? group[0] : group[group.length - 1]
      if (!edge || edge === current) return
      event.preventDefault()
      moveTo(edge)
      return
    }

    const dir = event.key as Arrow

    const next =
      dir === 'ArrowLeft' || dir === 'ArrowRight'
        ? pickHorizontal(current, list, dir)
        : bestInDirection(centerOf(current), list, dir, current)
    if (!next) {
      // 弹层里走到头不再带动背景滚动
      if (scope !== document.body && (dir === 'ArrowUp' || dir === 'ArrowDown')) event.preventDefault()
      return
    }
    event.preventDefault()
    moveTo(next)
  }

  const onFocusIn = (event: FocusEvent) => {
    const el = event.target
    if (!(el instanceof HTMLElement) || el === document.body) return
    if (!el.matches(FOCUSABLE)) return
    remember(el)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('focusin', onFocusIn)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('focusin', onFocusIn)
  }
}
