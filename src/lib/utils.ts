export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
export function uid(): string {
  const bytes = new Uint8Array(8)
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function countWords(text: string): number {
  return text.replace(/\s+/g, '').length
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n < 10000) return String(n)
  return `${(n / 10000).toFixed(n < 100000 ? 1 : 0)}万`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  const pad = (x: number) => String(x).padStart(2, '0')
  return sameYear
    ? `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export function truncate(text: string, max = 80): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function isNativeApp(): boolean {
  return Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.())
}

export function getServerBase(): string {
  return localStorage.getItem('zhizhang.server') || ''
}

export function setServerBase(value: string): void {
  if (value) localStorage.setItem('zhizhang.server', value)
  else localStorage.removeItem('zhizhang.server')
}

export function normalizeServerBase(input: string): string {
  let raw = input.trim()
  if (!raw) return ''
  if (!/^https?:\/\//i.test(raw)) raw = `http://${raw}`
  try {
    const url = new URL(raw)
    return `${url.protocol}//${url.host}`
  } catch {
    return ''
  }
}

export function apiUrl(path: string): string {
  const base = getServerBase()
  return `${base}${path}`
}

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  return `${getServerBase()}${path}`
}

export async function copyText(text: string): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const { Clipboard } = await import('@capacitor/clipboard')
      await Clipboard.write({ string: text })
      return true
    } catch {}
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {}
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.left = '-9999px'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function sortByOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.order - b.order)
}

export function nextOrder<T extends { order: number }>(items: T[]): number {
  return items.reduce((max, item) => Math.max(max, item.order || 0), -1) + 1
}

export function statusLabel(status: string): string {
  if (status === 'done') return '完成'
  if (status === 'revise') return '修订'
  return '草稿'
}

export function eventStatusLabel(status: string): string {
  if (status === 'happened') return '已发生'
  if (status === 'alternate') return '支线'
  return '计划'
}

export function placeCategoryOptions(): string[] {
  return ['国家', '城市', '城镇', '村庄', '山川', '河流', '海洋', '建筑', '遗迹', '秘境', '战场', '其他']
}

export function timelinePalette(): string[] {
  return ['#1f2124', '#5a5f65', '#8f9398', '#b9bcc0', '#3d4045', '#74787e', '#a3a7ac']
}

/** React 18 的类型里还没有 inert，浏览器运行时已支持：收起的面板用它移出 Tab 顺序 */
export function inertAttr(hidden: boolean): { inert?: '' } {
  return hidden ? { inert: '' } : {}
}
