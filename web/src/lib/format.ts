// Small formatting helpers (Russian UI).

const MONTHS = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
]

// Russian plural: pick form for n.
function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few
  return many
}

// "3 мес · 12 дней" from an ISO/date string birth date.
export function ageLabel(birthDate: string): string {
  const b = new Date(birthDate)
  const now = new Date()
  let months =
    (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  let anchor = new Date(b)
  anchor.setMonth(b.getMonth() + months)
  if (anchor > now) {
    months -= 1
    anchor = new Date(b)
    anchor.setMonth(b.getMonth() + months)
  }
  const days = Math.floor((now.getTime() - anchor.getTime()) / 86_400_000)
  const mLabel = `${months} мес`
  const dLabel = `${days} ${plural(days, 'день', 'дня', 'дней')}`
  return months > 0 ? `${mLabel} · ${dLabel}` : dLabel
}

// "14:30"
export function timeHM(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

// "Сегодня" / "Вчера" / "21 июля, пн"
export function dayLabel(iso: string): string {
  const d = new Date(iso)
  d.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000)
  if (diff === 0) return 'Сегодня'
  if (diff === 1) return 'Вчера'
  const src = new Date(iso)
  const wd = src.toLocaleDateString('ru-RU', { weekday: 'short' })
  return `${src.getDate()} ${MONTHS[src.getMonth()]}, ${wd}`
}

// Local-time calendar-day key ("2026-6-21") for grouping records by day.
export function localDayKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

// "6 кормлений"
export function feedCountLabel(n: number): string {
  return `${n} ${plural(n, 'кормление', 'кормления', 'кормлений')}`
}

// "22 июля, вт · 10:30"
export function dateTimeLabel(iso: string): string {
  const d = new Date(iso)
  const wd = d.toLocaleDateString('ru-RU', { weekday: 'short' })
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${wd} · ${timeHM(iso)}`
}

// "через 42 мин" / "5 мин назад" for a target time relative to now.
export function relativeMinutes(targetIso: string): string {
  const diffMin = Math.round((new Date(targetIso).getTime() - Date.now()) / 60_000)
  const abs = Math.abs(diffMin)
  if (abs < 1) return 'сейчас'
  if (abs < 60) {
    const unit = plural(abs, 'мин', 'мин', 'мин')
    return diffMin > 0 ? `через ${abs} ${unit}` : `${abs} ${unit} назад`
  }
  const h = Math.round(abs / 60)
  const unit = plural(h, 'час', 'часа', 'часов')
  return diffMin > 0 ? `через ${h} ${unit}` : `${h} ${unit} назад`
}

// Elapsed time since `iso`, e.g. "2 ч 15 мин" / "40 мин". No suffix.
export function agoLabel(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000))
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

// "1 ч 05 мин" / "45 мин" from a minute count.
export function minutesLabel(mins: number): string {
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} ч ${String(m).padStart(2, '0')} мин` : `${h} ч`
}

// Duration between two instants (end defaults to now): "1 ч 05 мин" / "45 мин".
export function durationLabel(startIso: string, endIso?: string | null): string {
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  const mins = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 60_000))
  return minutesLabel(mins)
}

// "HH:MM" -> ISO for EDITING an existing record (audit findings: the old
// day-roll teleported records 24h away on a fat-fingered future time).
// Rule: stay on the record's own calendar day, EXCEPT when the typed time is
// within 6h of the original across midnight (correcting a 23:40 start to
// "00:10" must roll forward, an 00:30 entry to "23:50" must roll back).
// Never rolls a day to dodge the future — callers future-guard and alert.
const MIDNIGHT_JUMP_MS = 6 * 3_600_000

export function nearestTime(baseIso: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const base = new Date(baseIso).getTime()
  const onDay = (off: number) => {
    const d = new Date(baseIso)
    d.setDate(d.getDate() + off)
    d.setHours(h, m, 0, 0)
    return d
  }
  let nearest = onDay(0)
  for (const off of [-1, 1]) {
    const c = onDay(off)
    if (Math.abs(c.getTime() - base) < Math.abs(nearest.getTime() - base)) nearest = c
  }
  const chosen =
    Math.abs(nearest.getTime() - base) <= MIDNIGHT_JUMP_MS ? nearest : onDay(0)
  return chosen.toISOString()
}

// "HH:MM" -> ISO on the same calendar day as `startIso`, rolling FORWARD a day
// when the result lands before the start — for end-of-sleep times that cross
// midnight (fell asleep 23:40, woke 06:20).
export function fromTimeInputAfter(startIso: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(startIso)
  d.setHours(h, m, 0, 0)
  if (d.getTime() <= new Date(startIso).getTime()) d.setDate(d.getDate() + 1)
  return d.toISOString()
}

export function startOfTodayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// LOCAL calendar date as YYYY-MM-DD for <input type="date">.
// (toISOString() would give the UTC date, which is off by one before 3 a.m.
// in UTC+3 — a very real hour for this app.)
export function localDateISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayLocalISO(): string {
  return localDateISO(new Date())
}

// ISO -> "HH:MM" for <input type="time">
export function toTimeInput(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// "HH:MM" -> ISO, keeping the calendar day of `baseIso`.
// If that lands in the future (e.g. a night feeding typed after midnight),
// fall back to the previous day so the record can't be stamped ahead of now.
export function fromTimeInput(baseIso: string, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(baseIso)
  d.setHours(h, m, 0, 0)
  if (d.getTime() > Date.now() + 60_000) d.setDate(d.getDate() - 1)
  return d.toISOString()
}

// grams -> "6,2 кг"
export function kg(grams: number): string {
  return (grams / 1000).toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}
