// ============================================================================
// Pure decision logic for send-reminders. No I/O, only Web-platform APIs, so
// it runs identically on the Deno edge runtime and under Node for unit tests.
// ============================================================================

// "23:00" or "23:00:00" (Postgres `time`) -> minutes since midnight.
export function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(':').map(Number)
  return h * 60 + m
}

// Minutes since local midnight for `date` in the given IANA time zone.
export function localMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  return h * 60 + m
}

// Is `nowMin` inside the quiet window? Handles overnight windows
// (23:00 → 07:00) as well as same-day ones (13:00 → 15:00).
export function isQuiet(nowMin: number, fromMin: number, toMin: number): boolean {
  if (fromMin === toMin) return false // degenerate window = no quiet hours
  if (fromMin < toMin) return nowMin >= fromMin && nowMin < toMin
  return nowMin >= fromMin || nowMin < toMin
}

export interface FeedingReminderInput {
  now: Date
  lastFedAt: Date | null
  intervalMinutes: number
  lastNotifiedAt: Date | null
  quietFrom: string | null // "HH:MM[:SS]"
  quietTo: string | null
  timeZone: string
}

// One notification per feeding: once we've pinged for the current last
// feeding, stay silent until a newer feeding restarts the clock.
export function feedingReminderDue(inp: FeedingReminderInput): boolean {
  if (!inp.lastFedAt) return false
  const dueAt = inp.lastFedAt.getTime() + inp.intervalMinutes * 60_000
  if (inp.now.getTime() < dueAt) return false
  if (inp.lastNotifiedAt && inp.lastNotifiedAt.getTime() >= inp.lastFedAt.getTime()) {
    return false
  }
  if (inp.quietFrom && inp.quietTo) {
    const nowMin = localMinutes(inp.now, inp.timeZone)
    if (isQuiet(nowMin, hmToMinutes(inp.quietFrom), hmToMinutes(inp.quietTo))) {
      return false
    }
  }
  return true
}

// "2 ч 15 мин" / "45 мин" — for the reminder message body.
export function elapsedLabel(from: Date, to: Date): string {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000))
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} ч ${m} мин` : `${h} ч`
}
