// ============================================================================
// Data access layer. Real Supabase queries against the Phase 0 schema, with a
// dev-only mock so the full UI can be previewed outside Telegram / with an
// empty database (VITE_DEV_MOCK=1).
// ============================================================================

import { get } from 'svelte/store'
import { getSupabase, session } from './session'
import { startOfTodayISO } from './format'

export const isMock =
  import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === '1'

export interface Child {
  id: string
  name: string
  birth_date: string
  photo_path: string | null
  bio: string | null
}

export interface FeedItem {
  id: string
  method: 'breast' | 'bottle'
  fed_at: string
  title: string // "Смесь" | "Грудь"
  detail: string // "120 мл · съела всё" | "18 мин"
  icon: string
  iconBg: string
  iconColor: string
}

export interface HomeData {
  nextFeeding: { at: string; detail: string } | null
  weightG: number | null
  weightDeltaG: number | null
  weightSeries: number[]
  sleepHours: number | null
  moodLabel: string | null
  diapersToday: number
  nextVisit: { title: string; at: string; location: string | null } | null
}

const MOOD_RU: Record<string, string> = {
  great: 'Отлично',
  good: 'Хорошо',
  ok: 'Спокойна',
  fussy: 'Капризна',
  sick: 'Болеет',
}

function memberId(): number | null {
  return get(session).member?.telegram_id ?? null
}

function feedItem(row: {
  id: string
  method: 'breast' | 'bottle'
  fed_at: string
  breast_side: string | null
  duration_min: number | null
  amount_ml: number | null
  milk_type: string | null
}): FeedItem {
  if (row.method === 'bottle') {
    const milk = row.milk_type === 'formula' ? 'Смесь' : 'Сцеженное'
    return {
      id: row.id,
      method: 'bottle',
      fed_at: row.fed_at,
      title: milk,
      detail: row.amount_ml ? `${row.amount_ml} мл` : '',
      icon: '🍼',
      iconBg: 'var(--peach-bg)',
      iconColor: 'var(--accent-deep)',
    }
  }
  const side =
    row.breast_side === 'left'
      ? 'левая'
      : row.breast_side === 'right'
        ? 'правая'
        : 'обе'
  const parts = [row.duration_min ? `${row.duration_min} мин` : '', side].filter(
    Boolean,
  )
  return {
    id: row.id,
    method: 'breast',
    fed_at: row.fed_at,
    title: 'Грудь',
    detail: parts.join(' · '),
    icon: '🤱',
    iconBg: 'var(--green-bg)',
    iconColor: 'var(--green-ink)',
  }
}

// --- mock ------------------------------------------------------------------
function mockChild(): Child {
  const b = new Date()
  b.setDate(b.getDate() - 102)
  return {
    id: 'mock',
    name: 'Мия',
    birth_date: b.toISOString().slice(0, 10),
    photo_path: null,
    bio: null,
  }
}

// ---------------------------------------------------------------------------

export async function loadChild(): Promise<Child | null> {
  if (isMock) return mockChild()
  const { data, error } = await getSupabase()
    .from('children')
    .select('id, name, birth_date, photo_path, bio')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createChild(
  name: string,
  birthDate: string,
): Promise<Child> {
  if (isMock) return { ...mockChild(), name, birth_date: birthDate }
  const { data, error } = await getSupabase()
    .from('children')
    .insert({ name, birth_date: birthDate })
    .select('id, name, birth_date, photo_path, bio')
    .single()
  if (error) throw error
  return data
}

export async function loadFeedingsToday(childId: string): Promise<FeedItem[]> {
  if (isMock) {
    const t = (h: number, m: number) => {
      const d = new Date()
      d.setHours(h, m, 0, 0)
      return d.toISOString()
    }
    return [
      feedItem({ id: '1', method: 'bottle', fed_at: t(11, 20), breast_side: null, duration_min: null, amount_ml: 120, milk_type: 'formula' }),
      feedItem({ id: '2', method: 'breast', fed_at: t(8, 5), breast_side: 'left', duration_min: 18, amount_ml: null, milk_type: null }),
      feedItem({ id: '3', method: 'bottle', fed_at: t(5, 40), breast_side: null, duration_min: null, amount_ml: 90, milk_type: 'formula' }),
      feedItem({ id: '4', method: 'breast', fed_at: t(2, 10), breast_side: 'both', duration_min: 22, amount_ml: null, milk_type: null }),
    ]
  }
  const { data, error } = await getSupabase()
    .from('feedings')
    .select('id, method, fed_at, breast_side, duration_min, amount_ml, milk_type')
    .eq('child_id', childId)
    .gte('fed_at', startOfTodayISO())
    .order('fed_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(feedItem)
}

export async function addBreastFeeding(
  childId: string,
  side: 'left' | 'right' | 'both',
  durationMin: number | null,
): Promise<FeedItem> {
  if (isMock) {
    return feedItem({
      id: `mock-${Date.now()}`,
      method: 'breast',
      fed_at: new Date().toISOString(),
      breast_side: side,
      duration_min: durationMin,
      amount_ml: null,
      milk_type: null,
    })
  }
  const { data, error } = await getSupabase()
    .from('feedings')
    .insert({
      child_id: childId,
      method: 'breast',
      breast_side: side,
      duration_min: durationMin,
      created_by: memberId(),
    })
    .select('id, method, fed_at, breast_side, duration_min, amount_ml, milk_type')
    .single()
  if (error) throw error
  return feedItem(data)
}

export async function addBottleFeeding(
  childId: string,
  amountMl: number,
  milkType: 'breast_milk' | 'formula',
): Promise<FeedItem> {
  if (isMock) {
    return feedItem({
      id: `mock-${Date.now()}`,
      method: 'bottle',
      fed_at: new Date().toISOString(),
      breast_side: null,
      duration_min: null,
      amount_ml: amountMl,
      milk_type: milkType,
    })
  }
  const { data, error } = await getSupabase()
    .from('feedings')
    .insert({
      child_id: childId,
      method: 'bottle',
      amount_ml: amountMl,
      milk_type: milkType,
      created_by: memberId(),
    })
    .select('id, method, fed_at, breast_side, duration_min, amount_ml, milk_type')
    .single()
  if (error) throw error
  return feedItem(data)
}

export async function loadHome(childId: string): Promise<HomeData> {
  if (isMock) {
    const next = new Date()
    next.setMinutes(next.getMinutes() + 42)
    return {
      nextFeeding: { at: next.toISOString(), detail: 'Смесь · ~120 мл' },
      weightG: 6200,
      weightDeltaG: 180,
      weightSeries: [4900, 5200, 5400, 5700, 5900, 6050, 6200],
      sleepHours: 14,
      moodLabel: 'Спокойна',
      diapersToday: 6,
      nextVisit: {
        title: 'Педиатр · плановый осмотр',
        at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        location: 'Детская пол-ка №4',
      },
    }
  }

  const sb = getSupabase()
  const todayStart = startOfTodayISO()
  const nowIso = new Date().toISOString()

  const [
    measurements,
    diapers,
    sleep,
    mood,
    visit,
    settings,
    lastFeed,
  ] = await Promise.all([
    sb.from('measurements').select('weight_g, measured_at').eq('child_id', childId).not('weight_g', 'is', null).order('measured_at', { ascending: false }).limit(8),
    sb.from('diapers').select('id', { count: 'exact', head: true }).eq('child_id', childId).gte('changed_at', todayStart),
    sb.from('sleep_sessions').select('started_at, ended_at').eq('child_id', childId).gte('started_at', todayStart),
    sb.from('wellbeing_posts').select('mood, posted_at').eq('child_id', childId).not('mood', 'is', null).order('posted_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('doctor_visits').select('title, visit_at, location').eq('child_id', childId).eq('status', 'planned').gte('visit_at', nowIso).order('visit_at', { ascending: true }).limit(1).maybeSingle(),
    sb.from('feeding_reminder_settings').select('enabled, interval_minutes').eq('child_id', childId).maybeSingle(),
    sb.from('feedings').select('fed_at, method, amount_ml, milk_type').eq('child_id', childId).order('fed_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  // weight (latest + delta vs previous), oldest→newest series for the chart
  const weights = (measurements.data ?? []).map((m) => m.weight_g as number)
  const weightG = weights.length ? weights[0] : null
  const weightDeltaG = weights.length >= 2 ? weights[0] - weights[1] : null
  const weightSeries = weights.slice().reverse()

  // today's sleep total (hours), counting an ongoing session up to now
  let sleepMs = 0
  for (const s of sleep.data ?? []) {
    const end = s.ended_at ? new Date(s.ended_at) : new Date()
    sleepMs += end.getTime() - new Date(s.started_at as string).getTime()
  }
  const sleepHours = (sleep.data?.length ?? 0) > 0 ? Math.round(sleepMs / 3_600_000) : null

  // next feeding from interval settings + last feeding
  let nextFeeding: HomeData['nextFeeding'] = null
  if (settings.data?.enabled && lastFeed.data) {
    const at = new Date(lastFeed.data.fed_at as string)
    at.setMinutes(at.getMinutes() + (settings.data.interval_minutes as number))
    const detail =
      lastFeed.data.method === 'bottle'
        ? `Смесь · ~${lastFeed.data.amount_ml ?? ''} мл`
        : 'Грудь'
    nextFeeding = { at: at.toISOString(), detail }
  }

  return {
    nextFeeding,
    weightG,
    weightDeltaG,
    weightSeries,
    sleepHours,
    moodLabel: mood.data?.mood ? (MOOD_RU[mood.data.mood as string] ?? null) : null,
    diapersToday: diapers.count ?? 0,
    nextVisit: visit.data
      ? { title: visit.data.title as string, at: visit.data.visit_at as string, location: (visit.data.location as string) ?? null }
      : null,
  }
}
