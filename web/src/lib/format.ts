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

export function startOfTodayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
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
