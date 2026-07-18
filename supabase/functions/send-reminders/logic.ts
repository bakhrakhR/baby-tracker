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

// Two-stage schedule around the due time (lastFedAt + interval):
//   stage 1 — "early heads-up", 30 minutes before due
//   stage 2 — "final call", 5 minutes before due
export const EARLY_LEAD_MIN = 30
export const FINAL_LEAD_MIN = 5

// Which stage should be sent right now (0 = stay silent).
//
// The already-sent state is derived from last_notified_at alone:
//   - nothing sent for this feeding if it predates lastFedAt;
//   - otherwise it was stage 2 if it falls at/after the stage-2 threshold,
//     else stage 1.
// So each feeding gets at most one "1/2" and one "2/2", a newer feeding
// resets the cycle, and a run missed entirely (quiet hours, downtime) sends
// just the final stage once possible — never a stale "полчаса" message.
export function feedingReminderStage(inp: FeedingReminderInput): 0 | 1 | 2 {
  if (!inp.lastFedAt) return 0
  const dueAt = inp.lastFedAt.getTime() + inp.intervalMinutes * 60_000
  const earlyAt = dueAt - EARLY_LEAD_MIN * 60_000
  const finalAt = dueAt - FINAL_LEAD_MIN * 60_000
  const now = inp.now.getTime()

  if (now < earlyAt) return 0

  if (inp.quietFrom && inp.quietTo) {
    const nowMin = localMinutes(inp.now, inp.timeZone)
    if (isQuiet(nowMin, hmToMinutes(inp.quietFrom), hmToMinutes(inp.quietTo))) {
      return 0
    }
  }

  const sentAt =
    inp.lastNotifiedAt && inp.lastNotifiedAt.getTime() >= inp.lastFedAt.getTime()
      ? inp.lastNotifiedAt.getTime()
      : null

  if (now >= finalAt) return sentAt !== null && sentAt >= finalAt ? 0 : 2
  return sentAt !== null ? 0 : 1
}

// "2 ч 15 мин" / "45 мин" — for the reminder message body.
export function elapsedLabel(from: Date, to: Date): string {
  const mins = Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000))
  if (mins < 60) return `${mins} мин`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} ч ${m} мин` : `${h} ч`
}
