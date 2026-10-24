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
  'summary:not([aria-disabled="true"])',
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

// 数字框到了 min / max 再按同一个方向，原生步进什么也不做——键就成了死键。
// 只在还能步进时把上下键留给原生，顶到头就交还给方向键导航
const canStep = (el: HTMLInputElement, dir: Arrow): boolean => {
  const value = el.valueAsNumber
  const step = el.step === '' || el.step === 'any' ? 1 : Number(el.step)
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return true
  const min = el.min === '' ? -Infinity : Number(el.min)
  const max = el.max === '' ? Infinity : Number(el.max)
  const next = value + (dir === 'ArrowUp' ? step : -step)
  return next >= min && next <= max
}

const keepsVerticalArrows = (el: HTMLElement | null, dir: Arrow): boolean => {
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') {
    const type = inputType(el)
    if (type === 'number') return canStep(el as HTMLInputElement, dir)
    return SPIN_INPUTS.has(type)
  }
  return el.isContentEditable
}

// 左右键：所有文本控件保留光标移动
const keepsHorizontalArrows = (el: HTMLElement | null): boolean => {
  if (!el) return false
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  // 数字框的 selectionStart 恒为 null，判断不出光标是否已到端点；左右键交给导航，
  // 上下键仍保留原生步进
  if (el.tagName === 'INPUT') return !PLAIN_INPUTS.has(inputType(el)) && inputType(el) !== 'number'
  return el.isContentEditable
}

const FREE_TEXT_INPUTS = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password'])

// 光标顶到文本的开头 / 末尾时，再按同一个方向就离开输入框——单行框和多行框一视同仁，
// 否则焦点会被关在输入框里只能靠 Tab 出去
const atInputEdge = (el: HTMLElement | null, dir: Arrow): boolean => {
  if (!el) return false
  const multiline = el instanceof HTMLTextAreaElement
  if (!multiline && !(el instanceof HTMLInputElement && FREE_TEXT_INPUTS.has(el.type))) return false
  const start = el.selectionStart
  const end = el.selectionEnd
  if (start === null || end === null || start !== end) return false
  if (dir === 'ArrowLeft' || (multiline && dir === 'ArrowUp')) return start === 0
  if (dir === 'ArrowRight' || (multiline && dir === 'ArrowDown')) return start === el.value.length
  return false
}

// 富文本里光标停在首行 / 末行时返回光标位置，↑ / ↓ 据此离开编辑器（中间仍是原生光标）
const editableEdgePoint = (el: HTMLElement, dir: Arrow): { x: number; y: number } | null => {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer)) return null
  const caret = range.getClientRects()[0] || range.getBoundingClientRect()
  const all = document.createRange()
  all.selectNodeContents(el)
  const lines = all.getClientRects()
  const onEdge = !lines.length || !caret.height
  const line = dir === 'ArrowUp' ? lines[0] : lines[lines.length - 1]
  if (!onEdge && line) {
    // 光标矩形比行盒矮（行高 190% 时差十几 px），按行高的一半判断是否就在这一行
    const slack = Math.max(6, line.height * 0.6)
    const hit = dir === 'ArrowUp' ? caret.top - line.top < slack : line.bottom - caret.bottom < slack
    if (!hit) return null
  }
  const point = { x: caret.left + caret.width / 2, y: caret.top + caret.height / 2 }
  // 光标可能被滚出可视区（刚插入内容、或用脚本定位选区）：把起点夹回滚动视口内，
  // 否则它跑到视口下方，按 ↓ 一个候选都找不到，焦点就困在正文里
  const host = el.closest<HTMLElement>('.editor-scroll, .center-scroll, .panel-body')
  const view = host?.getBoundingClientRect()
  if (view && view.height > 8) {
    point.x = Math.min(Math.max(point.x, view.left + 2), view.right - 2)
    point.y = Math.min(Math.max(point.y, view.top + 2), view.bottom - 2)
  }
  return point
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
    // 拖拽条 / 把手只由 Tab 到达，不参与方向键停靠，否则栏与栏之间会多出一堵墙
    if (el.matches(HANDLE) || el.closest(HANDLE)) return false
    if (el.closest('.ProseMirror') && !el.classList.contains('ProseMirror')) return false
    if (el.closest('[contenteditable="true"]') && !el.isContentEditable) return false
    return isVisible(el)
  })

const centerOf = (el: HTMLElement) => {
  const rect = hitBox(el)
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

/**
 * 命中框。富文本的 getBoundingClientRect 只包住"已经写出来的字"，
 * 于是列表下半部分往右看时正文根本不在同一行，焦点会直接跨过编辑区飞到右栏。
 * 正文在屏幕上占的是整个滚动视口，导航就该按视口算。
 */
function hitBox(el: HTMLElement): DOMRect {
  const dom = el.getBoundingClientRect()
  if (el.isContentEditable || el.classList.contains('ProseMirror')) {
    const host = el.closest<HTMLElement>('.editor-scroll, .center-scroll, .panel-body, .map-stage-wrap')
    const r = host?.getBoundingClientRect()
    if (r && r.width > 4 && r.height > 4) return r
  }
  return dom
}

const overlaps = (a1: number, a2: number, b1: number, b2: number) => Math.min(a2, b2) - Math.max(a1, b1) > 2

// 拖拽条不是按钮而是分隔线，16px 宽、整列高，当成停靠点会把「目录 ↔ 正文」的横向路径堵死。
// 它仍然可以 Tab 到；调宽要按住 Shift（在组件里处理），不按 Shift 的方向键就从它就近离开。
const HANDLE = '.panel-resizer, .assoc-split-grip'

// 严格的横排：顶栏 / 底栏的左右键就是横扫这一排（视图切换也在这里发生），不许掉进内容区
const STRICT_ROWS = '.topbar, .bottom-nav'

// 横向移动：优先同一行里几何上最近的一项；这一行走完了就换到下一行，同样取最近的一项
const pickHorizontal = (from: HTMLElement, candidates: HTMLElement[], dir: Arrow) => {
  const base = hitBox(from)
  const mid = (base.top + base.bottom) / 2
  const forward = dir === 'ArrowRight'
  const side = (el: HTMLElement) => Math.abs(centerOf(el).y - mid)
  const gap = (el: HTMLElement) => {
    const rect = hitBox(el)
    return forward ? rect.left - base.right : base.left - rect.right
  }
  const ahead = candidates.filter((el) => {
    const rect = hitBox(el)
    // 用「越过对方外沿」判定前后，而不是「完全在对方之外」：
    // 否则从行内的小按钮 ← 回不到它自己那一行
    if (!(forward ? rect.right > base.right + 2 : rect.left < base.left - 2)) return false
    // 视图切换项只在顶栏 / 底栏那一排里参与左右横扫，别的内容区按键不误触换页
    if (isViewNav(el) && !from.closest(STRICT_ROWS) && !isViewNav(from)) return false
    return true
  })
  if (!ahead.length) return null

  const score = (el: HTMLElement) => Math.max(0, gap(el)) + side(el) * 1.8
  const sameRow = ahead.filter((el) => {
    const rect = hitBox(el)
    return overlaps(base.top, base.bottom, rect.top, rect.bottom)
  })
  if (sameRow.length) return sameRow.reduce((best, el) => (score(el) < score(best) ? el : best))

  // 顶栏 / 底栏这一排走到头就停下，不跨行跳进内容区
  if (from.closest(STRICT_ROWS)) return null
  // 视图按钮左右就是切视图，两端停下
  if (isViewNav(from)) return null

  const nearest = Math.min(...ahead.map(side))
  const row = ahead.filter((el) => side(el) <= nearest + 24)
  return row.reduce((best, el) => (score(el) < score(best) ? el : best))
}

function bestInDirection(from: { x: number; y: number }, list: HTMLElement[], dir: Arrow, current: HTMLElement | null, box?: { w: number; h: number }) {
  const span = box ?? { w: 0, h: 0 }
  const scored: Array<{ el: HTMLElement; primary: number; side: number; overlap: boolean }> = []
  for (const el of list) {
    if (el === current || el.contains(current)) continue
    const rect = hitBox(el)
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const dx = point.x - from.x
    const dy = point.y - from.y
    const vertical = dir === 'ArrowUp' || dir === 'ArrowDown'
    let primary = 0
    let side = 0
    let overlap = false
    if (dir === 'ArrowRight') {
      if (dx < 4) continue
      primary = dx
      side = Math.abs(dy)
      overlap = overlaps(rect.top - rect.height / 2, rect.top + rect.height / 2, from.y - span.h / 2, from.y + span.h / 2)
    } else if (dir === 'ArrowLeft') {
      if (dx > -4) continue
      primary = -dx
      side = Math.abs(dy)
      overlap = overlaps(rect.top - rect.height / 2, rect.top + rect.height / 2, from.y - span.h / 2, from.y + span.h / 2)
    } else if (dir === 'ArrowDown') {
      if (dy < 4) continue
      primary = dy
      side = Math.abs(dx)
      overlap = overlaps(rect.left, rect.right, from.x - span.w / 2, from.x + span.w / 2)
    } else {
      if (dy > -4) continue
      primary = -dy
      side = Math.abs(dx)
      overlap = overlaps(rect.left, rect.right, from.x - span.w / 2, from.x + span.w / 2)
    }
    scored.push({ el, primary, side, overlap })
  }
  // 先只看横（纵）向上真正压着当前控件的那一列（那一行），没有再退回更宽的搜索，
  // 否则按 ↓ 会被旁边同一水平线上的控件拐走
  const pool = scored.filter((s) => s.overlap)
  let candidates = pool.length ? pool : scored
  // 上下键先收在最靠近的那一行里再比左右距离：
  // 表单左右两栏的控件偏在一侧，按中心加权的分数会输给下一行又宽又居中的整行控件，
  // 于是整行表单被跳过；同一行的控件纵向只差几像素，用 24px 的带装下
  if (dir === 'ArrowUp' || dir === 'ArrowDown') {
    const nearest = Math.min(...candidates.map((s) => s.primary))
    const row = candidates.filter((s) => s.primary <= nearest + 24)
    if (row.length) candidates = row
  }
  let pick: HTMLElement | null = null
  let bestScore = Infinity
  for (const s of candidates) {
    const score = s.primary + s.side * 1.8
    if (score < bestScore) {
      bestScore = score
      pick = s.el
    }
  }
  return pick
}

const isViewNav = (el: HTMLElement) => el.classList.contains('nav-btn') || el.classList.contains('bottom-btn')

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

  const moveTo = (el: HTMLElement, activate = true) => {
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    remember(el)
    if (!activate || el.dataset.navSwitch === undefined) return
    activating = true
    try {
      el.click()
    } finally {
      activating = false
    }
    if (el.isConnected) {
      remember(el)
      // 激活可能让面板重排（列表项选中所致的详情插入、列表换用详情），
      // 按下去之前的 scrollIntoView 就作废了，下一帧按新位置补一次，焦点别停在屏幕外
      requestAnimationFrame(() => {
        if (el.isConnected && document.activeElement === el) {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      })
      return
    }
    // 这一按把自己所在的列表换成了详情（或收起了抽屉）：焦点不能掉回 body，
    // 交还给最近一个还活着的祖先里的第一项
    let host: HTMLElement | null = el.parentElement
    while (host && !host.isConnected) host = host.parentElement
    if (host && (!document.activeElement || document.activeElement === document.body)) {
      const first = collect(host)[0]
      if (first) {
        first.focus({ preventScroll: true })
        remember(first)
      }
    }
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
    const dir = event.key as Arrow
    const vertical = dir === 'ArrowUp' || dir === 'ArrowDown'

    let edgePoint: { x: number; y: number } | null = null
    if (isHomeEnd) {
      if (keepsHorizontalArrows(control)) return
    } else if (control && (vertical ? keepsVerticalArrows(control, dir) : keepsHorizontalArrows(control))) {
      if (vertical) {
        edgePoint = control.isContentEditable ? editableEdgePoint(control, dir) : null
        if (!edgePoint && !atInputEdge(control, dir)) {
          // 文本控件内保留原生光标 / 选项移动；搜索框 ↓ 进入结果列表
          if (event.key !== 'ArrowDown' || !target?.closest('.search-box')) return
          const first = collect(scopeOf(target)).find((el) => RESULT_ROWS.some((cls) => el.classList.contains(cls)))
          if (!first) return
          event.preventDefault()
          moveTo(first)
          return
        }
      } else if (!atInputEdge(control, dir)) {
        // 单行输入框光标没到端点：左右键保留原生光标移动
        return
      }
    }

    const scope = scopeOf(control)
    const all = collect(scope)
    const list = all
    if (!list.length) return

    let current: HTMLElement | null = active && all.includes(active) ? active : null
    // 焦点停在拖拽条上时，它就是「从哪儿出发」，方向键照常就近跳到别的控件
    if (!current && active?.matches(HANDLE)) current = active
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

    // 正文首 / 末行（或 Esc）用光标位置当起点，其余用控件中心
    const box = hitBox(current)
    const origin = edgePoint ?? { x: box.left + box.width / 2, y: box.top + box.height / 2 }
    const span = edgePoint ? { w: 0, h: 0 } : { w: box.width, h: box.height }
    const next =
      dir === 'ArrowLeft' || dir === 'ArrowRight'
        ? pickHorizontal(current, list, dir)
        : bestInDirection(origin, list, dir, current, span)
    if (!next) {
      // 弹层里走到头不再带动背景滚动
      if (scope !== document.body && (dir === 'ArrowUp' || dir === 'ArrowDown')) event.preventDefault()
      return
    }
    event.preventDefault()
    // 上下键路过视图按钮只做预览式聚焦，不按下去；只有左右沿顶栏 / 底栏横扫时才即时切视图
    moveTo(next, dir === 'ArrowLeft' || dir === 'ArrowRight' || !isViewNav(next))
  }

  // 编辑器（Tiptap）自己会 preventDefault Escape，冒泡阶段就轮不到我们了，所以捕获阶段先处理
  const onEscapeCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing) return
    const el = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!el?.isContentEditable) return
    if (scopeOf(el) !== document.body) return
    const list = collect(scopeOf(el))
    const rect = el.getBoundingClientRect()
    const next = bestInDirection({ x: rect.left + Math.min(140, rect.width / 2), y: rect.top + 6 }, list, 'ArrowUp', el)
    if (!next) return
    event.preventDefault()
    event.stopPropagation()
    moveTo(next)
  }

  const onFocusIn = (event: FocusEvent) => {
    const el = event.target
    if (!(el instanceof HTMLElement) || el === document.body) return
    if (!el.matches(FOCUSABLE)) return
    remember(el)
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keydown', onEscapeCapture, true)
  window.addEventListener('focusin', onFocusIn)
  return () => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keydown', onEscapeCapture, true)
    window.removeEventListener('focusin', onFocusIn)
  }
}
