import type { CalendarSettings, EventTime, StoryEvent } from '../types'

function num(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function eventSortKey(time: EventTime | undefined, calendar: CalendarSettings, order = 0): number {
  if (!time || time.unscheduled) return Number.POSITIVE_INFINITY
  if (calendar.mode === 'free') return order
  const hours = Math.max(1, calendar.hoursPerDay || 24)
  if (calendar.mode === 'day') {
    return num(time.day, 0) * hours + num(time.h, 0)
  }
  const months = Math.max(1, calendar.monthsPerYear || 12)
  const days = Math.max(1, calendar.daysPerMonth || 30)
  const y = num(time.y, 0)
  const m = num(time.m, 1)
  const d = num(time.d, 1)
  return ((y * months + (m - 1)) * days + (d - 1)) * hours + num(time.h, 0)
}

export function formatEventTime(time: EventTime | undefined, calendar: CalendarSettings): string {
  if (!time || time.unscheduled) return '未定时间'
  const label = time.label?.trim()
  const suffix = label ? ` · ${label}` : ''
  if (calendar.mode === 'free') return label || '自由排序'
  if (calendar.mode === 'day') {
    const day = typeof time.day === 'number' ? `第${time.day}天` : '时间未定'
    const hour = typeof time.h === 'number' ? ` ${String(time.h).padStart(2, '0')}:00` : ''
    return `${day}${hour}${suffix}`
  }
  const parts: string[] = []
  if (typeof time.y === 'number') parts.push(`${calendar.era || ''}${time.y}年`)
  if (typeof time.m === 'number') parts.push(`${time.m}月`)
  if (typeof time.d === 'number') parts.push(`${time.d}日`)
  if (typeof time.h === 'number') parts.push(`${String(time.h).padStart(2, '0')}:00`)
  if (!parts.length) return `时间未定${suffix}`
  return `${parts.join('')}${suffix}`
}

export function eventColumnKey(event: StoryEvent, calendar: CalendarSettings): string {
  const key = eventSortKey(event.time, calendar, event.order)
  return Number.isFinite(key) ? String(key) : 'unscheduled'
}

export function eventColumnLabel(event: StoryEvent, calendar: CalendarSettings): string {
  if (!event.time || event.time.unscheduled) return '未定时间'
  return formatEventTime(event.time, calendar)
}

export function compareEvents(a: StoryEvent, b: StoryEvent, calendar: CalendarSettings): number {
  const ka = eventSortKey(a.time, calendar, a.order)
  const kb = eventSortKey(b.time, calendar, b.order)
  if (ka !== kb) return ka - kb
  return (a.order || 0) - (b.order || 0)
}

export function defaultEventTime(calendar: CalendarSettings): EventTime {
  if (calendar.mode === 'day') return { day: 1, h: 0, label: '', unscheduled: false }
  if (calendar.mode === 'free') return { label: '', unscheduled: false }
  return {
    y: new Date().getFullYear(),
    m: 1,
    d: 1,
    h: 0,
    label: '',
    unscheduled: false,
  }
}
