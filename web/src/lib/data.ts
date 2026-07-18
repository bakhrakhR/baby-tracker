// ============================================================================
// Data access layer. Real Supabase queries against the Phase 0 schema, with a
// dev-only mock so the full UI can be previewed outside Telegram / with an
// empty database (VITE_DEV_MOCK=1).
// ============================================================================

import { get } from 'svelte/store'
import { getSupabase, session } from './session'
import { startOfTodayISO, localDayKey, dayLabel, feedCountLabel } from './format'
import type { AppRole, BreastSide, MilkType, DiaperKind } from './types'

// How many past feedings the history view pulls at once.
export const HISTORY_LIMIT = 200

export const isMock =
  import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK === '1'

// ---------------------------------------------------------------------------
// Stale-while-revalidate cache. The DB round-trip is ~300-400 ms (the project
// lives in ap-southeast-1), which made every tab switch feel sluggish behind a
// spinner. Screens render the last known data instantly and refresh in the
// background; writes bump refreshKey, which re-fetches and overwrites.
// Session-lifetime only — a Mini App session is short and single-user-ish, so
// no TTL/invalidation machinery is warranted.
// ---------------------------------------------------------------------------
const memCache = new Map<string, unknown>()

export function getCached<T>(key: string): T | undefined {
  return memCache.get(key) as T | undefined
}

export function setCached<T>(key: string, value: T): void {
  memCache.set(key, value)
}

export interface Child {
  id: string
  name: string
  birth_date: string
  photo_path: string | null
  bio: string | null
}

// Raw DB columns we read/write for a feeding.
interface FeedingRow {
  id: string
  method: 'breast' | 'bottle'
  fed_at: string
  breast_side: BreastSide | null
  duration_min: number | null
  amount_ml: number | null
  milk_type: MilkType | null
  notes: string | null
}

// A feeding plus its presentation fields.
export interface FeedItem extends FeedingRow {
  title: string
  detail: string
  icon: string
  iconBg: string
  iconColor: string
}

export interface FeedingPatch {
  fed_at?: string
  breast_side?: BreastSide | null
  duration_min?: number | null
  amount_ml?: number | null
  milk_type?: MilkType | null
  notes?: string | null
}

export interface HistoryDay {
  key: string
  label: string
  summary: string
  items: FeedItem[]
}

export interface FeedingHistory {
  days: HistoryDay[]
  truncated: boolean // true if HISTORY_LIMIT was hit and older records remain
}

export interface HomeData {
  lastFeedingAt: string | null
  nextFeeding: { at: string; detail: string } | null
  weightG: number | null
  weightDeltaG: number | null
  weightSeries: number[]
  heightSeries: number[]
  sleepHours: number | null
  openSleep: { id: string; started_at: string } | null
  moodLabel: string | null
  diapersToday: number
  nextVisit: { title: string; at: string; location: string | null } | null
}

const SELECT =
  'id, method, fed_at, breast_side, duration_min, amount_ml, milk_type, notes'

export const MOOD_RU: Record<string, string> = {
  great: 'Отлично',
  good: 'Хорошо',
  ok: 'Спокойна',
  fussy: 'Капризна',
  sick: 'Болеет',
}

export const SIDE_RU: Record<BreastSide, string> = {
  left: 'левая',
  right: 'правая',
  both: 'обе',
}

function memberId(): number | null {
  return get(session).member?.telegram_id ?? null
}

function decorate(row: FeedingRow): FeedItem {
  if (row.method === 'bottle') {
    const milk = row.milk_type === 'formula' ? 'Смесь' : 'Сцеженное'
    return {
      ...row,
      title: milk,
      detail: row.amount_ml ? `${row.amount_ml} мл` : '',
      icon: '🍼',
      iconBg: 'var(--peach-bg)',
      iconColor: 'var(--accent-deep)',
    }
  }
  const parts = [
    row.duration_min ? `${row.duration_min} мин` : '',
    row.breast_side ? SIDE_RU[row.breast_side] : '',
  ].filter(Boolean)
  return {
    ...row,
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

let mockFeedings: FeedItem[] | null = null
function mockList(): FeedItem[] {
  if (mockFeedings) return mockFeedings
  const t = (h: number, m: number) => {
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  mockFeedings = [
    decorate({ id: '1', method: 'bottle', fed_at: t(11, 20), breast_side: null, duration_min: null, amount_ml: 120, milk_type: 'formula', notes: null }),
    decorate({ id: '2', method: 'breast', fed_at: t(8, 5), breast_side: 'left', duration_min: 18, amount_ml: null, milk_type: null, notes: null }),
    decorate({ id: '3', method: 'bottle', fed_at: t(5, 40), breast_side: null, duration_min: null, amount_ml: 90, milk_type: 'formula', notes: null }),
    decorate({ id: '4', method: 'breast', fed_at: t(2, 10), breast_side: 'both', duration_min: 22, amount_ml: null, milk_type: null, notes: null }),
  ]
  return mockFeedings
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

export async function createChild(name: string, birthDate: string): Promise<Child> {
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
  if (isMock) return mockList().slice().sort((a, b) => b.fed_at.localeCompare(a.fed_at))
  const { data, error } = await getSupabase()
    .from('feedings')
    .select(SELECT)
    .eq('child_id', childId)
    .gte('fed_at', startOfTodayISO())
    .order('fed_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(decorate)
}

// Group day-descending feedings into calendar days with a per-day summary.
function groupHistory(items: FeedItem[], truncated: boolean): FeedingHistory {
  const order: string[] = []
  const byDay = new Map<string, FeedItem[]>()
  for (const it of items) {
    const key = localDayKey(it.fed_at)
    if (!byDay.has(key)) {
      byDay.set(key, [])
      order.push(key)
    }
    byDay.get(key)!.push(it)
  }
  const days: HistoryDay[] = order.map((key) => {
    const dayItems = byDay.get(key)!
    const ml = dayItems.reduce((s, f) => s + (f.amount_ml ?? 0), 0)
    const summary = ml > 0 ? `${feedCountLabel(dayItems.length)} · ${ml} мл` : feedCountLabel(dayItems.length)
    return { key, label: dayLabel(dayItems[0].fed_at), summary, items: dayItems }
  })
  return { days, truncated }
}

// Feedings before today, newest first, grouped by day.
export async function loadFeedingHistory(childId: string): Promise<FeedingHistory> {
  if (isMock) {
    const day = (offset: number, h: number, m: number) => {
      const d = new Date()
      d.setDate(d.getDate() - offset)
      d.setHours(h, m, 0, 0)
      return d.toISOString()
    }
    const rows: FeedingRow[] = [
      { id: 'h1', method: 'bottle', fed_at: day(1, 21, 0), breast_side: null, duration_min: null, amount_ml: 120, milk_type: 'formula', notes: null },
      { id: 'h2', method: 'breast', fed_at: day(1, 17, 30), breast_side: 'right', duration_min: 20, amount_ml: null, milk_type: null, notes: 'заснула на груди' },
      { id: 'h3', method: 'bottle', fed_at: day(1, 13, 10), breast_side: null, duration_min: null, amount_ml: 100, milk_type: 'formula', notes: null },
      { id: 'h4', method: 'breast', fed_at: day(2, 22, 15), breast_side: 'both', duration_min: 25, amount_ml: null, milk_type: null, notes: null },
      { id: 'h5', method: 'bottle', fed_at: day(2, 9, 0), breast_side: null, duration_min: null, amount_ml: 90, milk_type: 'breast_milk', notes: null },
    ]
    return groupHistory(rows.map(decorate), false)
  }
  const { data, error } = await getSupabase()
    .from('feedings')
    .select(SELECT)
    .eq('child_id', childId)
    .lt('fed_at', startOfTodayISO())
    .order('fed_at', { ascending: false })
    .limit(HISTORY_LIMIT)
  if (error) throw error
  const rows = data ?? []
  return groupHistory(rows.map(decorate), rows.length === HISTORY_LIMIT)
}

export async function addBreastFeeding(
  childId: string,
  side: BreastSide,
  durationMin: number | null,
  fedAt?: string,
): Promise<FeedItem> {
  if (isMock) {
    const item = decorate({
      id: `mock-${Date.now()}`,
      method: 'breast',
      fed_at: fedAt ?? new Date().toISOString(),
      breast_side: side,
      duration_min: durationMin,
      amount_ml: null,
      milk_type: null,
      notes: null,
    })
    mockList().push(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('feedings')
    .insert({
      child_id: childId,
      method: 'breast',
      breast_side: side,
      duration_min: durationMin,
      ...(fedAt ? { fed_at: fedAt } : {}),
      created_by: memberId(),
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return decorate(data)
}

export async function addBottleFeeding(
  childId: string,
  amountMl: number,
  milkType: MilkType,
  fedAt?: string,
): Promise<FeedItem> {
  if (isMock) {
    const item = decorate({
      id: `mock-${Date.now()}`,
      method: 'bottle',
      fed_at: fedAt ?? new Date().toISOString(),
      breast_side: null,
      duration_min: null,
      amount_ml: amountMl,
      milk_type: milkType,
      notes: null,
    })
    mockList().push(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('feedings')
    .insert({
      child_id: childId,
      method: 'bottle',
      amount_ml: amountMl,
      milk_type: milkType,
      ...(fedAt ? { fed_at: fedAt } : {}),
      created_by: memberId(),
    })
    .select(SELECT)
    .single()
  if (error) throw error
  return decorate(data)
}

export async function updateFeeding(
  id: string,
  patch: FeedingPatch,
): Promise<FeedItem> {
  if (isMock) {
    const list = mockList()
    const i = list.findIndex((f) => f.id === id)
    const merged = decorate({ ...list[i], ...patch } as FeedingRow)
    list[i] = merged
    return merged
  }
  const { data, error } = await getSupabase()
    .from('feedings')
    .update(patch)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw error
  return decorate(data)
}

export async function deleteFeeding(id: string): Promise<void> {
  if (isMock) {
    mockFeedings = mockList().filter((f) => f.id !== id)
    return
  }
  const { error } = await getSupabase().from('feedings').delete().eq('id', id)
  if (error) throw error
}

// ===========================================================================
// Diapers
// ===========================================================================

export const DIAPER_RU: Record<DiaperKind, string> = {
  wet: 'Мокрый',
  dirty: 'Грязный',
  mixed: 'Смешанный',
}

interface DiaperRow {
  id: string
  changed_at: string
  kind: DiaperKind
  notes: string | null
}

export interface DiaperItem extends DiaperRow {
  title: string
  icon: string
  iconBg: string
  iconColor: string
}

const DIAPER_LOOK: Record<DiaperKind, { icon: string; bg: string; color: string }> = {
  wet: { icon: '💧', bg: 'var(--purple-bg)', color: 'var(--purple-ink)' },
  dirty: { icon: '💩', bg: 'var(--yellow-bg)', color: 'var(--yellow-ink)' },
  mixed: { icon: '💫', bg: 'var(--rose-bg)', color: 'var(--rose-ink)' },
}

const DIAPER_SELECT = 'id, changed_at, kind, notes'

function decorateDiaper(row: DiaperRow): DiaperItem {
  const look = DIAPER_LOOK[row.kind]
  return {
    ...row,
    title: DIAPER_RU[row.kind],
    icon: look.icon,
    iconBg: look.bg,
    iconColor: look.color,
  }
}

let mockDiapers: DiaperItem[] | null = null
function mockDiaperList(): DiaperItem[] {
  if (mockDiapers) return mockDiapers
  const t = (h: number, m: number) => {
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  mockDiapers = [
    decorateDiaper({ id: 'd1', changed_at: t(10, 45), kind: 'wet', notes: null }),
    decorateDiaper({ id: 'd2', changed_at: t(7, 30), kind: 'mixed', notes: null }),
    decorateDiaper({ id: 'd3', changed_at: t(4, 15), kind: 'dirty', notes: null }),
  ]
  return mockDiapers
}

export async function loadDiapersToday(childId: string): Promise<DiaperItem[]> {
  if (isMock)
    return mockDiaperList().slice().sort((a, b) => b.changed_at.localeCompare(a.changed_at))
  const { data, error } = await getSupabase()
    .from('diapers')
    .select(DIAPER_SELECT)
    .eq('child_id', childId)
    .gte('changed_at', startOfTodayISO())
    .order('changed_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(decorateDiaper)
}

export async function addDiaper(childId: string, kind: DiaperKind): Promise<DiaperItem> {
  if (isMock) {
    const item = decorateDiaper({
      id: `mock-${Date.now()}`,
      changed_at: new Date().toISOString(),
      kind,
      notes: null,
    })
    mockDiaperList().push(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('diapers')
    .insert({ child_id: childId, kind, created_by: memberId() })
    .select(DIAPER_SELECT)
    .single()
  if (error) throw error
  return decorateDiaper(data)
}

export interface DiaperPatch {
  kind?: DiaperKind
  changed_at?: string
  notes?: string | null
}

export async function updateDiaper(id: string, patch: DiaperPatch): Promise<DiaperItem> {
  if (isMock) {
    const list = mockDiaperList()
    const i = list.findIndex((d) => d.id === id)
    const merged = decorateDiaper({ ...list[i], ...patch } as DiaperRow)
    list[i] = merged
    return merged
  }
  const { data, error } = await getSupabase()
    .from('diapers')
    .update(patch)
    .eq('id', id)
    .select(DIAPER_SELECT)
    .single()
  if (error) throw error
  return decorateDiaper(data)
}

export async function deleteDiaper(id: string): Promise<void> {
  if (isMock) {
    mockDiapers = mockDiaperList().filter((d) => d.id !== id)
    return
  }
  const { error } = await getSupabase().from('diapers').delete().eq('id', id)
  if (error) throw error
}

// ===========================================================================
// Sleep — sessions; ended_at IS NULL means "asleep right now"
// ===========================================================================

export interface SleepItem {
  id: string
  started_at: string
  ended_at: string | null
  notes: string | null
}

const SLEEP_SELECT = 'id, started_at, ended_at, notes'

let mockSleep: SleepItem[] | null = null
function mockSleepList(): SleepItem[] {
  if (mockSleep) return mockSleep
  const t = (h: number, m: number) => {
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }
  mockSleep = [
    { id: 's1', started_at: t(12, 30), ended_at: t(14, 10), notes: null },
    { id: 's2', started_at: t(8, 40), ended_at: t(9, 35), notes: null },
  ]
  return mockSleep
}

// Today's sessions plus any still-open one (which may have started yesterday),
// newest first.
export async function loadSleepToday(childId: string): Promise<SleepItem[]> {
  if (isMock)
    return mockSleepList().slice().sort((a, b) => b.started_at.localeCompare(a.started_at))
  const sb = getSupabase()
  const [today, open] = await Promise.all([
    sb.from('sleep_sessions').select(SLEEP_SELECT).eq('child_id', childId).gte('started_at', startOfTodayISO()).order('started_at', { ascending: false }),
    sb.from('sleep_sessions').select(SLEEP_SELECT).eq('child_id', childId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (today.error) throw today.error
  if (open.error) throw open.error
  const items = (today.data ?? []) as SleepItem[]
  if (open.data && !items.some((s) => s.id === open.data!.id)) items.unshift(open.data as SleepItem)
  return items
}

export async function startSleep(childId: string): Promise<SleepItem> {
  if (isMock) {
    const item: SleepItem = {
      id: `mock-${Date.now()}`,
      started_at: new Date().toISOString(),
      ended_at: null,
      notes: null,
    }
    mockSleepList().unshift(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('sleep_sessions')
    .insert({ child_id: childId, created_by: memberId() })
    .select(SLEEP_SELECT)
    .single()
  if (error) throw error
  return data as SleepItem
}

export async function endSleep(id: string): Promise<SleepItem> {
  return updateSleep(id, { ended_at: new Date().toISOString() })
}

export interface SleepPatch {
  started_at?: string
  ended_at?: string | null
  notes?: string | null
}

export async function updateSleep(id: string, patch: SleepPatch): Promise<SleepItem> {
  if (isMock) {
    const list = mockSleepList()
    const i = list.findIndex((s) => s.id === id)
    list[i] = { ...list[i], ...patch }
    return list[i]
  }
  const { data, error } = await getSupabase()
    .from('sleep_sessions')
    .update(patch)
    .eq('id', id)
    .select(SLEEP_SELECT)
    .single()
  if (error) throw error
  return data as SleepItem
}

export async function deleteSleep(id: string): Promise<void> {
  if (isMock) {
    mockSleep = mockSleepList().filter((s) => s.id !== id)
    return
  }
  const { error } = await getSupabase().from('sleep_sessions').delete().eq('id', id)
  if (error) throw error
}

// ===========================================================================
// Measurements — weight / height / head circumference, one row per date
// ===========================================================================

export interface MeasurementItem {
  id: string
  measured_at: string // date (YYYY-MM-DD)
  weight_g: number | null
  height_cm: number | null
  head_cm: number | null
  notes: string | null
}

const MEASURE_SELECT = 'id, measured_at, weight_g, height_cm, head_cm, notes'

let mockMeasures: MeasurementItem[] | null = null
function mockMeasureList(): MeasurementItem[] {
  if (mockMeasures) return mockMeasures
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    return d.toISOString().slice(0, 10)
  }
  mockMeasures = [
    { id: 'm1', measured_at: day(2), weight_g: 6200, height_cm: 61.5, head_cm: 40.5, notes: null },
    { id: 'm2', measured_at: day(9), weight_g: 6020, height_cm: 60.5, head_cm: null, notes: null },
    { id: 'm3', measured_at: day(16), weight_g: 5900, height_cm: 60.0, head_cm: 40.0, notes: 'после купания' },
  ]
  return mockMeasures
}

export async function loadMeasurements(childId: string, limit = 10): Promise<MeasurementItem[]> {
  if (isMock)
    return mockMeasureList().slice().sort((a, b) => b.measured_at.localeCompare(a.measured_at)).slice(0, limit)
  const { data, error } = await getSupabase()
    .from('measurements')
    .select(MEASURE_SELECT)
    .eq('child_id', childId)
    .order('measured_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as MeasurementItem[]
}

export interface MeasurementPatch {
  measured_at?: string
  weight_g?: number | null
  height_cm?: number | null
  head_cm?: number | null
  notes?: string | null
}

export async function addMeasurement(
  childId: string,
  fields: MeasurementPatch,
): Promise<MeasurementItem> {
  if (isMock) {
    const item: MeasurementItem = {
      id: `mock-${Date.now()}`,
      measured_at: fields.measured_at ?? new Date().toISOString().slice(0, 10),
      weight_g: fields.weight_g ?? null,
      height_cm: fields.height_cm ?? null,
      head_cm: fields.head_cm ?? null,
      notes: fields.notes ?? null,
    }
    mockMeasureList().unshift(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('measurements')
    .insert({ child_id: childId, ...fields, created_by: memberId() })
    .select(MEASURE_SELECT)
    .single()
  if (error) throw error
  return data as MeasurementItem
}

export async function updateMeasurement(id: string, patch: MeasurementPatch): Promise<MeasurementItem> {
  if (isMock) {
    const list = mockMeasureList()
    const i = list.findIndex((m) => m.id === id)
    list[i] = { ...list[i], ...patch }
    return list[i]
  }
  const { data, error } = await getSupabase()
    .from('measurements')
    .update(patch)
    .eq('id', id)
    .select(MEASURE_SELECT)
    .single()
  if (error) throw error
  return data as MeasurementItem
}

export async function deleteMeasurement(id: string): Promise<void> {
  if (isMock) {
    mockMeasures = mockMeasureList().filter((m) => m.id !== id)
    return
  }
  const { error } = await getSupabase().from('measurements').delete().eq('id', id)
  if (error) throw error
}

// ===========================================================================
// Wellbeing — mood posts for the family info page
// ===========================================================================

export type Mood = 'great' | 'good' | 'ok' | 'fussy' | 'sick'

export const MOOD_EMOJI: Record<Mood, string> = {
  great: '🤩',
  good: '😊',
  ok: '😌',
  fussy: '😫',
  sick: '🤒',
}

export interface WellbeingItem {
  id: string
  posted_at: string
  mood: Mood | null
  comment: string | null
}

const WELLBEING_SELECT = 'id, posted_at, mood, comment'

let mockPosts: WellbeingItem[] | null = null
function mockPostList(): WellbeingItem[] {
  if (mockPosts) return mockPosts
  const t = (offsetH: number) => new Date(Date.now() - offsetH * 3_600_000).toISOString()
  mockPosts = [
    { id: 'w1', posted_at: t(3), mood: 'ok', comment: 'Спала 5 часов подряд!' },
    { id: 'w2', posted_at: t(27), mood: 'great', comment: 'Первая улыбка 🥹' },
  ]
  return mockPosts
}

export async function loadWellbeing(childId: string, limit = 5): Promise<WellbeingItem[]> {
  if (isMock) return mockPostList().slice(0, limit)
  const { data, error } = await getSupabase()
    .from('wellbeing_posts')
    .select(WELLBEING_SELECT)
    .eq('child_id', childId)
    .order('posted_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as WellbeingItem[]
}

export async function addWellbeing(
  childId: string,
  mood: Mood,
  comment: string | null,
): Promise<WellbeingItem> {
  if (isMock) {
    const item: WellbeingItem = {
      id: `mock-${Date.now()}`,
      posted_at: new Date().toISOString(),
      mood,
      comment,
    }
    mockPostList().unshift(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('wellbeing_posts')
    .insert({ child_id: childId, mood, comment, created_by: memberId() })
    .select(WELLBEING_SELECT)
    .single()
  if (error) throw error
  return data as WellbeingItem
}

export interface WellbeingPatch {
  mood?: Mood
  comment?: string | null
}

export async function updateWellbeing(id: string, patch: WellbeingPatch): Promise<WellbeingItem> {
  if (isMock) {
    const list = mockPostList()
    const i = list.findIndex((w) => w.id === id)
    list[i] = { ...list[i], ...patch }
    return list[i]
  }
  const { data, error } = await getSupabase()
    .from('wellbeing_posts')
    .update(patch)
    .eq('id', id)
    .select(WELLBEING_SELECT)
    .single()
  if (error) throw error
  return data as WellbeingItem
}

export async function deleteWellbeing(id: string): Promise<void> {
  if (isMock) {
    mockPosts = mockPostList().filter((w) => w.id !== id)
    return
  }
  const { error } = await getSupabase().from('wellbeing_posts').delete().eq('id', id)
  if (error) throw error
}

// ===========================================================================
// Doctor visits — appointments with a prep checklist (jsonb)
// ===========================================================================

export type VisitStatus = 'planned' | 'done' | 'cancelled'

export interface ChecklistItem {
  text: string
  done: boolean
}

export interface VisitItem {
  id: string
  title: string
  doctor_name: string | null
  location: string | null
  visit_at: string
  prep_checklist: ChecklistItem[]
  notes: string | null
  status: VisitStatus
}

const VISIT_SELECT =
  'id, title, doctor_name, location, visit_at, prep_checklist, notes, status'

let mockVisits: VisitItem[] | null = null
function mockVisitList(): VisitItem[] {
  mockVisits ??= [
    {
      id: 'v1',
      title: 'Педиатр · плановый осмотр',
      doctor_name: 'Др. Коэн',
      location: 'Детская пол-ка №4',
      visit_at: new Date(Date.now() + 4 * 86_400_000).toISOString(),
      prep_checklist: [
        { text: 'Карта прививок', done: true },
        { text: 'Список вопросов врачу', done: false },
        { text: 'Сменная одежда и подгузник', done: false },
      ],
      notes: null,
      status: 'planned',
    },
    {
      id: 'v2',
      title: 'Невролог · консультация',
      doctor_name: null,
      location: null,
      visit_at: new Date(Date.now() + 18 * 86_400_000).toISOString(),
      prep_checklist: [],
      notes: null,
      status: 'planned',
    },
    {
      id: 'v3',
      title: 'УЗИ тазобедренных суставов',
      doctor_name: null,
      location: 'Клиника «Здоровье»',
      visit_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      prep_checklist: [],
      notes: 'всё в норме',
      status: 'done',
    },
  ]
  return mockVisits
}

export interface VisitsSplit {
  upcoming: VisitItem[] // planned, soonest first
  past: VisitItem[] // done/cancelled or planned-but-passed, latest first
}

function splitVisits(all: VisitItem[]): VisitsSplit {
  const now = Date.now()
  const upcoming = all
    .filter((v) => v.status === 'planned' && new Date(v.visit_at).getTime() >= now)
    .sort((a, b) => a.visit_at.localeCompare(b.visit_at))
  const past = all
    .filter((v) => v.status !== 'planned' || new Date(v.visit_at).getTime() < now)
    .sort((a, b) => b.visit_at.localeCompare(a.visit_at))
  return { upcoming, past }
}

export async function loadVisits(childId: string): Promise<VisitsSplit> {
  if (isMock) return splitVisits(mockVisitList().slice())
  const { data, error } = await getSupabase()
    .from('doctor_visits')
    .select(VISIT_SELECT)
    .eq('child_id', childId)
    .order('visit_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return splitVisits((data ?? []) as VisitItem[])
}

export interface VisitPatch {
  title?: string
  doctor_name?: string | null
  location?: string | null
  visit_at?: string
  prep_checklist?: ChecklistItem[]
  notes?: string | null
  status?: VisitStatus
}

export async function addVisit(childId: string, fields: VisitPatch): Promise<VisitItem> {
  if (isMock) {
    const item: VisitItem = {
      id: `mock-${Date.now()}`,
      title: fields.title ?? '',
      doctor_name: fields.doctor_name ?? null,
      location: fields.location ?? null,
      visit_at: fields.visit_at ?? new Date().toISOString(),
      prep_checklist: fields.prep_checklist ?? [],
      notes: fields.notes ?? null,
      status: 'planned',
    }
    mockVisitList().push(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('doctor_visits')
    .insert({ child_id: childId, ...fields, created_by: memberId() })
    .select(VISIT_SELECT)
    .single()
  if (error) throw error
  return data as VisitItem
}

export async function updateVisit(id: string, patch: VisitPatch): Promise<VisitItem> {
  if (isMock) {
    const list = mockVisitList()
    const i = list.findIndex((v) => v.id === id)
    list[i] = { ...list[i], ...patch }
    return list[i]
  }
  const { data, error } = await getSupabase()
    .from('doctor_visits')
    .update(patch)
    .eq('id', id)
    .select(VISIT_SELECT)
    .single()
  if (error) throw error
  return data as VisitItem
}

export async function deleteVisit(id: string): Promise<void> {
  if (isMock) {
    mockVisits = mockVisitList().filter((v) => v.id !== id)
    return
  }
  // clean up any unsent reminders pointing at this visit first
  await getSupabase().from('reminders').delete().eq('ref_id', id).is('sent_at', null)
  const { error } = await getSupabase().from('doctor_visits').delete().eq('id', id)
  if (error) throw error
}

// --- visit reminders (rows in `reminders`, delivered by send-reminders) ----

export type ReminderLead = 'none' | 'hour' | 'day'

const LEAD_MS: Record<Exclude<ReminderLead, 'none'>, number> = {
  hour: 3_600_000,
  day: 86_400_000,
}

let mockLeads: Record<string, ReminderLead> = {}

// Replace the visit's unsent reminder according to the chosen lead.
export async function setVisitReminder(visit: VisitItem, lead: ReminderLead): Promise<void> {
  if (isMock) {
    mockLeads[visit.id] = lead
    return
  }
  const sb = getSupabase()
  const { error: delError } = await sb
    .from('reminders')
    .delete()
    .eq('ref_id', visit.id)
    .is('sent_at', null)
  if (delError) throw delError
  if (lead === 'none') return
  const fireAt = new Date(new Date(visit.visit_at).getTime() - LEAD_MS[lead])
  if (fireAt.getTime() <= Date.now()) return // already in the past — nothing to schedule
  const when = lead === 'hour' ? 'через час' : 'завтра'
  const { error } = await sb.from('reminders').insert({
    kind: 'visit',
    ref_id: visit.id,
    fire_at: fireAt.toISOString(),
    message: `🩺 ${when.charAt(0).toUpperCase() + when.slice(1)}: ${visit.title}${visit.location ? ` · ${visit.location}` : ''}`,
    created_by: memberId(),
  })
  if (error) throw error
}

// Infer the current lead from the visit's unsent reminder (for the edit form).
export async function getVisitReminderLead(visit: VisitItem): Promise<ReminderLead> {
  if (isMock) return mockLeads[visit.id] ?? 'none'
  const { data, error } = await getSupabase()
    .from('reminders')
    .select('fire_at')
    .eq('ref_id', visit.id)
    .is('sent_at', null)
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) return 'none'
  const diff = new Date(visit.visit_at).getTime() - new Date(data.fire_at as string).getTime()
  return Math.abs(diff - LEAD_MS.day) < Math.abs(diff - LEAD_MS.hour) ? 'day' : 'hour'
}

// ===========================================================================
// Feeding reminder settings — "remind N minutes after the last feeding"
// ===========================================================================

export interface FeedingSettings {
  enabled: boolean
  interval_minutes: number
  quiet_from: string | null // "HH:MM"
  quiet_to: string | null
}

let mockFeedSettings: FeedingSettings = {
  enabled: true,
  interval_minutes: 180,
  quiet_from: '23:00',
  quiet_to: '07:00',
}

// Postgres `time` comes back as "HH:MM:SS" — trim for <input type="time">.
const hm = (t: string | null) => (t ? t.slice(0, 5) : null)

export async function loadFeedingSettings(childId: string): Promise<FeedingSettings> {
  if (isMock) return { ...mockFeedSettings }
  const { data, error } = await getSupabase()
    .from('feeding_reminder_settings')
    .select('enabled, interval_minutes, quiet_from, quiet_to')
    .eq('child_id', childId)
    .maybeSingle()
  if (error) throw error
  if (!data) return { enabled: false, interval_minutes: 180, quiet_from: null, quiet_to: null }
  return {
    enabled: data.enabled as boolean,
    interval_minutes: data.interval_minutes as number,
    quiet_from: hm(data.quiet_from as string | null),
    quiet_to: hm(data.quiet_to as string | null),
  }
}

export async function saveFeedingSettings(
  childId: string,
  s: FeedingSettings,
): Promise<void> {
  if (isMock) {
    mockFeedSettings = { ...s }
    return
  }
  const { error } = await getSupabase()
    .from('feeding_reminder_settings')
    .upsert({ child_id: childId, ...s })
  if (error) throw error
}

// ===========================================================================
// Lab results & documents — records whose files live in the `files` bucket
// ===========================================================================

export interface LabResult {
  id: string
  title: string
  taken_at: string // date
  file_paths: string[]
  notes: string | null
}

export type DocCategory = 'id' | 'medical' | 'insurance' | 'other'

export const DOC_CATEGORY_RU: Record<DocCategory, string> = {
  id: 'Документы',
  medical: 'Медицина',
  insurance: 'Страховка',
  other: 'Прочее',
}

export interface DocumentItem {
  id: string
  title: string
  category: DocCategory
  file_paths: string[]
  notes: string | null
}

const LAB_SELECT = 'id, title, taken_at, file_paths, notes'
const DOC_SELECT = 'id, title, category, file_paths, notes'

let mockLabs: LabResult[] | null = null
function mockLabList(): LabResult[] {
  mockLabs ??= [
    {
      id: 'l1',
      title: 'Общий анализ крови',
      taken_at: new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10),
      file_paths: ['mock/blood.pdf'],
      notes: null,
    },
    {
      id: 'l2',
      title: 'УЗИ · скрин',
      taken_at: new Date(Date.now() - 16 * 86_400_000).toISOString().slice(0, 10),
      file_paths: ['mock/uzi.jpg'],
      notes: 'всё в норме',
    },
  ]
  return mockLabs
}

let mockDocs: DocumentItem[] | null = null
function mockDocList(): DocumentItem[] {
  mockDocs ??= [
    {
      id: 'doc1',
      title: 'Свидетельство о рождении',
      category: 'id',
      file_paths: ['mock/birth-1.jpg', 'mock/birth-2.jpg'],
      notes: null,
    },
  ]
  return mockDocs
}

export async function loadLabs(childId: string): Promise<LabResult[]> {
  if (isMock) return mockLabList().slice()
  const { data, error } = await getSupabase()
    .from('lab_results')
    .select(LAB_SELECT)
    .eq('child_id', childId)
    .order('taken_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data ?? []) as LabResult[]
}

export interface LabPatch {
  title?: string
  taken_at?: string
  file_paths?: string[]
  notes?: string | null
}

export async function addLab(childId: string, fields: LabPatch): Promise<LabResult> {
  if (isMock) {
    const item: LabResult = {
      id: `mock-${Date.now()}`,
      title: fields.title ?? '',
      taken_at: fields.taken_at ?? new Date().toISOString().slice(0, 10),
      file_paths: fields.file_paths ?? [],
      notes: fields.notes ?? null,
    }
    mockLabList().unshift(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('lab_results')
    .insert({ child_id: childId, ...fields, created_by: memberId() })
    .select(LAB_SELECT)
    .single()
  if (error) throw error
  return data as LabResult
}

export async function updateLab(id: string, patch: LabPatch): Promise<LabResult> {
  if (isMock) {
    const list = mockLabList()
    const i = list.findIndex((l) => l.id === id)
    list[i] = { ...list[i], ...patch }
    return list[i]
  }
  const { data, error } = await getSupabase()
    .from('lab_results')
    .update(patch)
    .eq('id', id)
    .select(LAB_SELECT)
    .single()
  if (error) throw error
  return data as LabResult
}

export async function deleteLab(id: string): Promise<void> {
  if (isMock) {
    mockLabs = mockLabList().filter((l) => l.id !== id)
    return
  }
  const { error } = await getSupabase().from('lab_results').delete().eq('id', id)
  if (error) throw error
}

export async function loadDocs(childId: string): Promise<DocumentItem[]> {
  if (isMock) return mockDocList().slice()
  const { data, error } = await getSupabase()
    .from('documents')
    .select(DOC_SELECT)
    .eq('child_id', childId)
    .order('title', { ascending: true })
    .limit(100)
  if (error) throw error
  return (data ?? []) as DocumentItem[]
}

export interface DocPatch {
  title?: string
  category?: DocCategory
  file_paths?: string[]
  notes?: string | null
}

export async function addDoc(childId: string, fields: DocPatch): Promise<DocumentItem> {
  if (isMock) {
    const item: DocumentItem = {
      id: `mock-${Date.now()}`,
      title: fields.title ?? '',
      category: fields.category ?? 'other',
      file_paths: fields.file_paths ?? [],
      notes: fields.notes ?? null,
    }
    mockDocList().unshift(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('documents')
    .insert({ child_id: childId, ...fields, created_by: memberId() })
    .select(DOC_SELECT)
    .single()
  if (error) throw error
  return data as DocumentItem
}

export async function updateDoc(id: string, patch: DocPatch): Promise<DocumentItem> {
  if (isMock) {
    const list = mockDocList()
    const i = list.findIndex((d) => d.id === id)
    list[i] = { ...list[i], ...patch }
    return list[i]
  }
  const { data, error } = await getSupabase()
    .from('documents')
    .update(patch)
    .eq('id', id)
    .select(DOC_SELECT)
    .single()
  if (error) throw error
  return data as DocumentItem
}

export async function deleteDoc(id: string): Promise<void> {
  if (isMock) {
    mockDocs = mockDocList().filter((d) => d.id !== id)
    return
  }
  const { error } = await getSupabase().from('documents').delete().eq('id', id)
  if (error) throw error
}

// ===========================================================================
// Memories — the keepsake feed (photos + stories), visible to guests too
// ===========================================================================

export interface MemoryItem {
  id: string
  title: string | null
  story: string | null
  media_paths: string[]
  happened_at: string // date
  created_by: number | null
}

const MEMORY_SELECT = 'id, title, story, media_paths, happened_at, created_by'

let mockMemories: MemoryItem[] | null = null
function mockMemoryList(): MemoryItem[] {
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    return d.toISOString().slice(0, 10)
  }
  mockMemories ??= [
    {
      id: 'mem1',
      title: 'Первая улыбка',
      story: 'Сегодня Мия впервые схватила папу за палец и не отпускала целую минуту 🥹',
      media_paths: ['mock/a.jpg', 'mock/b.jpg'],
      happened_at: day(1),
      created_by: 100,
    },
    {
      id: 'mem2',
      title: null,
      story: 'Спали в обнимку с зайцем весь тихий час',
      media_paths: ['mock/c.jpg'],
      happened_at: day(4),
      created_by: 200,
    },
  ]
  return mockMemories
}

export async function loadMemories(childId: string, limit = 60): Promise<MemoryItem[]> {
  if (isMock) return mockMemoryList().slice(0, limit)
  const { data, error } = await getSupabase()
    .from('memories')
    .select(MEMORY_SELECT)
    .eq('child_id', childId)
    .order('happened_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as MemoryItem[]
}

export interface MemoryPatch {
  title?: string | null
  story?: string | null
  media_paths?: string[]
  happened_at?: string
}

export async function addMemory(childId: string, fields: MemoryPatch): Promise<MemoryItem> {
  if (isMock) {
    const item: MemoryItem = {
      id: `mock-${Date.now()}`,
      title: fields.title ?? null,
      story: fields.story ?? null,
      media_paths: fields.media_paths ?? [],
      happened_at: fields.happened_at ?? new Date().toISOString().slice(0, 10),
      created_by: 100,
    }
    mockMemoryList().unshift(item)
    return item
  }
  const { data, error } = await getSupabase()
    .from('memories')
    .insert({ child_id: childId, ...fields, created_by: memberId() })
    .select(MEMORY_SELECT)
    .single()
  if (error) throw error
  return data as MemoryItem
}

export async function updateMemory(id: string, patch: MemoryPatch): Promise<MemoryItem> {
  if (isMock) {
    const list = mockMemoryList()
    const i = list.findIndex((m) => m.id === id)
    list[i] = { ...list[i], ...patch }
    return list[i]
  }
  const { data, error } = await getSupabase()
    .from('memories')
    .update(patch)
    .eq('id', id)
    .select(MEMORY_SELECT)
    .single()
  if (error) throw error
  return data as MemoryItem
}

export async function deleteMemory(id: string): Promise<void> {
  if (isMock) {
    mockMemories = mockMemoryList().filter((m) => m.id !== id)
    return
  }
  const { error } = await getSupabase().from('memories').delete().eq('id', id)
  if (error) throw error
}

// ===========================================================================
// Members — the family whitelist. Everyone reads it; only admin writes
// (enforced by RLS, mirrored in the UI).
// ===========================================================================

export interface MemberRow {
  telegram_id: number
  display_name: string
  role: AppRole
}

const MEMBER_SELECT = 'telegram_id, display_name, role'

let mockMembers: MemberRow[] | null = null
function mockMemberList(): MemberRow[] {
  mockMembers ??= [
    { telegram_id: 100, display_name: 'Мама', role: 'admin' },
    { telegram_id: 200, display_name: 'Папа', role: 'editor' },
    { telegram_id: 300, display_name: 'Бабушка Ира', role: 'guest' },
  ]
  return mockMembers
}

export async function loadMembers(): Promise<MemberRow[]> {
  if (isMock) return mockMemberList().slice()
  const { data, error } = await getSupabase()
    .from('members')
    .select(MEMBER_SELECT)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as MemberRow[]
}

export async function addMember(
  telegramId: number,
  displayName: string,
  role: AppRole,
): Promise<MemberRow> {
  if (isMock) {
    const m: MemberRow = { telegram_id: telegramId, display_name: displayName, role }
    mockMemberList().push(m)
    return m
  }
  const { data, error } = await getSupabase()
    .from('members')
    .insert({ telegram_id: telegramId, display_name: displayName, role })
    .select(MEMBER_SELECT)
    .single()
  if (error) throw error
  return data as MemberRow
}

export async function updateMemberRole(telegramId: number, role: AppRole): Promise<MemberRow> {
  if (isMock) {
    const list = mockMemberList()
    const i = list.findIndex((m) => m.telegram_id === telegramId)
    list[i] = { ...list[i], role }
    return list[i]
  }
  const { data, error } = await getSupabase()
    .from('members')
    .update({ role })
    .eq('telegram_id', telegramId)
    .select(MEMBER_SELECT)
    .single()
  if (error) throw error
  return data as MemberRow
}

export async function deleteMember(telegramId: number): Promise<void> {
  if (isMock) {
    mockMembers = mockMemberList().filter((m) => m.telegram_id !== telegramId)
    return
  }
  const { error } = await getSupabase().from('members').delete().eq('telegram_id', telegramId)
  if (error) throw error
}

export async function loadHome(childId: string): Promise<HomeData> {
  if (isMock) {
    const next = new Date()
    next.setMinutes(next.getMinutes() + 42)
    const last = mockList().slice().sort((a, b) => b.fed_at.localeCompare(a.fed_at))[0]
    const sleep = mockSleepList()
    let ms = 0
    for (const s of sleep) ms += (s.ended_at ? new Date(s.ended_at).getTime() : Date.now()) - new Date(s.started_at).getTime()
    const open = sleep.find((s) => s.ended_at === null) ?? null
    return {
      lastFeedingAt: last?.fed_at ?? null,
      nextFeeding: { at: next.toISOString(), detail: 'Смесь · ~120 мл' },
      weightG: 6200,
      weightDeltaG: 180,
      weightSeries: [4900, 5200, 5400, 5700, 5900, 6050, 6200],
      heightSeries: [56, 57.5, 58.5, 59.5, 60.5, 61, 61.5],
      sleepHours: Math.round(ms / 3_600_000),
      openSleep: open ? { id: open.id, started_at: open.started_at } : null,
      moodLabel: 'Спокойна',
      diapersToday: mockDiaperList().length,
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

  const [measurements, diapers, sleep, openSleepQ, mood, visit, settings, lastFeed] =
    await Promise.all([
      sb.from('measurements').select('weight_g, height_cm, measured_at').eq('child_id', childId).order('measured_at', { ascending: false }).limit(12),
      sb.from('diapers').select('id', { count: 'exact', head: true }).eq('child_id', childId).gte('changed_at', todayStart),
      sb.from('sleep_sessions').select('started_at, ended_at').eq('child_id', childId).gte('started_at', todayStart),
      sb.from('sleep_sessions').select('id, started_at').eq('child_id', childId).is('ended_at', null).order('started_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('wellbeing_posts').select('mood, posted_at').eq('child_id', childId).not('mood', 'is', null).order('posted_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('doctor_visits').select('title, visit_at, location').eq('child_id', childId).eq('status', 'planned').gte('visit_at', nowIso).order('visit_at', { ascending: true }).limit(1).maybeSingle(),
      sb.from('feeding_reminder_settings').select('enabled, interval_minutes').eq('child_id', childId).maybeSingle(),
      sb.from('feedings').select('fed_at, method, amount_ml, milk_type').eq('child_id', childId).order('fed_at', { ascending: false }).limit(1).maybeSingle(),
    ])

  // weight (latest + delta vs previous), oldest→newest series for the chart
  const rows = measurements.data ?? []
  const weights = rows.filter((m) => m.weight_g != null).map((m) => m.weight_g as number)
  const heights = rows.filter((m) => m.height_cm != null).map((m) => Number(m.height_cm))
  const weightG = weights.length ? weights[0] : null
  const weightDeltaG = weights.length >= 2 ? weights[0] - weights[1] : null
  const weightSeries = weights.slice().reverse()
  const heightSeries = heights.slice().reverse()

  // today's sleep total (hours), counting an ongoing session up to now
  let sleepMs = 0
  for (const s of sleep.data ?? []) {
    const end = s.ended_at ? new Date(s.ended_at) : new Date()
    sleepMs += end.getTime() - new Date(s.started_at as string).getTime()
  }
  // an open session that started before midnight only counts its today part
  const openSleep = openSleepQ.data
    ? { id: openSleepQ.data.id as string, started_at: openSleepQ.data.started_at as string }
    : null
  if (openSleep && openSleep.started_at < todayStart) {
    sleepMs += Date.now() - new Date(todayStart).getTime()
  }
  const sleepHours = sleepMs > 0 ? Math.round(sleepMs / 3_600_000) : null

  // next feeding from interval settings + last feeding
  const lastFeedingAt = (lastFeed.data?.fed_at as string) ?? null
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
    lastFeedingAt,
    nextFeeding,
    weightG,
    weightDeltaG,
    weightSeries,
    heightSeries,
    sleepHours,
    openSleep,
    moodLabel: mood.data?.mood ? (MOOD_RU[mood.data.mood as string] ?? null) : null,
    diapersToday: diapers.count ?? 0,
    nextVisit: visit.data
      ? { title: visit.data.title as string, at: visit.data.visit_at as string, location: (visit.data.location as string) ?? null }
      : null,
  }
}
