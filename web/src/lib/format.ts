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

export function startOfTodayISO(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// grams -> "6,2 кг"
export function kg(grams: number): string {
  return (grams / 1000).toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}
