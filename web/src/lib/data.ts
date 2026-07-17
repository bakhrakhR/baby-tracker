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
