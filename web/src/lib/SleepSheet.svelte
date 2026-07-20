<script lang="ts">
  import {
    loadSleepToday,
    sleepStatsToday,
    updateSleep,
    deleteSleep,
    type SleepItem,
  } from './data'
  import { hapticSuccess, hapticError, hapticSelection } from './telegram'
  import { timeHM, toTimeInput, nearestTime, fromTimeInputAfter, durationLabel, minutesLabel } from './format'

  let {
    childId,
    canEdit,
    refreshKey,
    onClose,
    onToggle,
    onChanged,
  }: {
    childId: string
    canEdit: boolean
    refreshKey: number
    onClose: () => void
    // App owns start/stop; after it completes, refreshKey bumps and we reload.
    onToggle: (open: { id: string; started_at: string } | null) => void
    onChanged: () => void
  } = $props()

  let items = $state<SleepItem[]>([])
  let loading = $state(true)
  let busy = $state(false)

  const open = $derived(items.find((s) => s.ended_at === null) ?? null)

  // live durations while the sheet is visible
  let nowTick = $state(0)
  $effect(() => {
    const t = setInterval(() => (nowTick += 1), 30_000)
    return () => clearInterval(t)
  })

  const stats = $derived.by(() => {
    void nowTick
    return sleepStatsToday(items)
  })

  // Timeline: sleep episodes with computed wake gaps between them, newest
  // first. The current ongoing wake (if any) sits on top.
  interface WakeGap {
    from: string
    to: string | null // null = still awake now
  }
  type TimelineEntry = { kind: 'sleep'; s: SleepItem } | { kind: 'wake'; w: WakeGap }

  const timeline = $derived.by(() => {
    void nowTick
    const asc = items.slice().sort((a, b) => a.started_at.localeCompare(b.started_at))
    const out: TimelineEntry[] = []
    for (let i = 0; i < asc.length; i++) {
      out.push({ kind: 'sleep', s: asc[i] })
      const end = asc[i].ended_at
      if (!end) continue
      const next = asc[i + 1]
      if (next) {
        if (new Date(next.started_at).getTime() - new Date(end).getTime() > 60_000) {
          out.push({ kind: 'wake', w: { from: end, to: next.started_at } })
        }
      } else {
        out.push({ kind: 'wake', w: { from: end, to: null } }) // awake right now
      }
    }
    return out.reverse()
  })

  $effect(() => {
    refreshKey
    const id = childId
    loading = true
    loadSleepToday(id)
      .then((r) => (items = r))
      .catch((e) => console.error('loadSleepToday', e))
      .finally(() => (loading = false))
  })

  function toggle() {
    if (!canEdit) return
    hapticSelection()
    onToggle(open ? { id: open.id, started_at: open.started_at } : null)
  }

  // --- edit sub-view (unchanged mechanics) ---
  let editing = $state<SleepItem | null>(null)
  let eStart = $state('')
  let eEnd = $state('')
  let eStillAsleep = $state(false)
  let eNotes = $state('')

  function openEdit(s: SleepItem) {
    if (!canEdit) return
    hapticSelection()
    editing = s
    eStart = toTimeInput(s.started_at)
    eStillAsleep = s.ended_at === null
    eEnd = s.ended_at ? toTimeInput(s.ended_at) : toTimeInput(new Date().toISOString())
    eNotes = s.notes ?? ''
  }

  async function saveEdit() {
    if (!editing || busy) return
    // resolve to the day nearest the original start (a 23:40→06:20 session
    // corrected to "00:10" must roll forward, not shift a day back)
    const started_at = nearestTime(editing.started_at, eStart)
    if (new Date(started_at).getTime() > Date.now() + 60_000) {
      alert('Начало сна ещё не наступило')
      return
    }
    const ended_at = eStillAsleep ? null : fromTimeInputAfter(started_at, eEnd)
    if (ended_at) {
      if (ended_at === started_at) {
        alert('Конец сна должен быть позже начала')
        return
      }
      if (new Date(ended_at).getTime() > Date.now() + 60_000) {
        alert('Конец сна ещё не наступил')
        return
      }
    }
    busy = true
    try {
      await updateSleep(editing.id, {
        started_at,
        ended_at,
        notes: eNotes.trim() || null,
      })
      hapticSuccess()
      editing = null
      busy = false
      onChanged()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось сохранить изменения')
      console.error(e)
    }
  }

  async function removeEdit() {
    if (!editing || busy) return
    if (!confirm('Удалить эту запись?')) return
    busy = true
    try {
      await deleteSleep(editing.id)
      hapticSuccess()
      editing = null
      busy = false
      onChanged()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось удалить запись')
      console.error(e)
    }
  }
</script>

<div
  class="sheet-backdrop"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="button"
  tabindex="-1"
>
  <div
    class="sheet"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
  >
    <div class="sheet__grip"></div>

    {#if editing}
      <div class="sheet-title">🌙 Сон</div>

      <div class="field-label">Уснула</div>
      <input class="input input--time" type="time" bind:value={eStart} />

      <div class="field-label">Проснулась</div>
      <div class="chips" style="margin-bottom:8px">
        <button class="chip" data-active={eStillAsleep} onclick={() => (eStillAsleep = true)}>Ещё спит</button>
        <button class="chip" data-active={!eStillAsleep} onclick={() => (eStillAsleep = false)}>Проснулась</button>
      </div>
      {#if !eStillAsleep}
        <input class="input input--time" type="time" bind:value={eEnd} />
      {/if}

      <div class="field-label">Заметка</div>
      <input class="input" type="text" maxlength="200" placeholder="необязательно" bind:value={eNotes} />

      <button class="btn" style="margin-top:18px" onclick={saveEdit} disabled={busy}>
        {busy ? 'Сохраняю…' : 'Сохранить'}
      </button>
      <button class="btn btn--danger" style="margin-top:10px" onclick={removeEdit} disabled={busy}>
        Удалить запись
      </button>
      <button class="btn btn--soft" style="margin-top:10px" onclick={() => (editing = null)} disabled={busy}>
        Назад
      </button>
    {:else}
      <div class="sheet-title">🌙 Сон</div>

      <!-- state slider: what's happening right now, tap to switch -->
      {#if canEdit}
        <button class="ss" data-asleep={!!open} onclick={toggle} aria-label={open ? 'Отметить пробуждение' : 'Отметить засыпание'}>
          <span class="ss__half" data-dim={!!open}>☀️ Бодрствует</span>
          <span class="ss__half" data-dim={!open}>😴 Спит</span>
          <span class="ss__knob">{open ? '😴 Спит' : '☀️ Бодрствует'}</span>
        </button>
      {/if}
      <p class="ss__status">
        {#if open}
          Спит уже <b>{(void nowTick, durationLabel(open.started_at))}</b> · с {timeHM(open.started_at)} · нажмите, когда проснётся
        {:else if timeline[0]?.kind === 'wake'}
          Бодрствует <b>{(void nowTick, durationLabel(timeline[0].w.from))}</b> · с {timeHM(timeline[0].w.from)}
        {:else}
          Сегодня сон ещё не записан
        {/if}
      </p>

      <!-- day stats -->
      <div class="stats">
        <div class="stat">
          <div class="stat__k">🌙 Сон</div>
          <div class="stat__v">{stats.sleepMs > 0 ? minutesLabel(Math.round(stats.sleepMs / 60_000)) : '—'}</div>
        </div>
        <div class="stat">
          <div class="stat__k">Снов</div>
          <div class="stat__v">{stats.count}</div>
        </div>
        <div class="stat">
          <div class="stat__k">☀️ Бодрств.</div>
          <div class="stat__v">{minutesLabel(Math.round(stats.wakeMs / 60_000))}</div>
        </div>
      </div>

      <div class="field-label" style="margin-top:14px">Сегодня</div>
      {#if loading && items.length === 0}
        <div class="empty">Загрузка…</div>
      {:else if items.length === 0}
        <div class="empty">Записей сна пока нет. Переключите слайдер, когда малыш уснёт.</div>
      {:else}
        <div class="rows">
          {#each timeline as entry, i (i)}
            {#if entry.kind === 'sleep'}
              {@const s = entry.s}
              <button class="srow" onclick={() => openEdit(s)} disabled={!canEdit}>
                <span class="srow__icon">{s.ended_at ? '🌙' : '😴'}</span>
                <span class="srow__title">
                  {#if s.ended_at}
                    {timeHM(s.started_at)} → {timeHM(s.ended_at)}{s.notes ? ` · ${s.notes}` : ''}
                  {:else}
                    Спит с {timeHM(s.started_at)}
                  {/if}
                </span>
                <span class="srow__dur">{durationLabel(s.started_at, s.ended_at)}</span>
              </button>
            {:else}
              {@const w = entry.w}
              <div class="wrow">
                <span class="wrow__icon">☀️</span>
                <span class="wrow__title">
                  {#if w.to}
                    {timeHM(w.from)} → {timeHM(w.to)}
                  {:else}
                    Бодрствует с {timeHM(w.from)}
                  {/if}
                </span>
                <span class="wrow__dur">{durationLabel(w.from, w.to)}</span>
              </div>
            {/if}
          {/each}
        </div>
        {#if canEdit}
          <p class="hint-line">Нажмите на запись сна, чтобы изменить или удалить</p>
        {/if}
      {/if}
    {/if}
  </div>
</div>

<style>
  /* ---- state slider ---- */
  .ss {
    position: relative;
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: none;
    background: var(--surface);
    border-radius: var(--r-pill);
    padding: 5px;
    box-shadow: var(--sh-card);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .ss__half {
    font-family: inherit;
    font-size: 14px;
    font-weight: 800;
    color: var(--muted);
    padding: 12px 0;
    text-align: center;
    transition: opacity 0.2s;
  }
  .ss__half[data-dim='true'] {
    opacity: 0.55;
  }
  .ss__knob {
    position: absolute;
    top: 5px;
    bottom: 5px;
    left: 5px;
    width: calc(50% - 5px);
    border-radius: var(--r-pill);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 800;
    color: #8a6a1f;
    background: linear-gradient(135deg, #fbefcf, #f7e3a8);
    box-shadow: 0 3px 10px -3px rgba(90, 64, 40, 0.35);
    transition:
      transform 0.22s cubic-bezier(0.34, 1.3, 0.64, 1),
      background 0.22s,
      color 0.22s;
  }
  .ss[data-asleep='true'] .ss__knob {
    transform: translateX(100%);
    background: linear-gradient(135deg, var(--purple), #8a79b0);
    color: #fff;
  }
  .ss:active .ss__knob {
    filter: brightness(0.97);
  }

  .ss__status {
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
    margin-top: 10px;
  }
  .ss__status b {
    color: var(--ink-soft);
  }

  /* ---- day stats ---- */
  .stats {
    display: grid;
    grid-template-columns: 1.4fr 0.8fr 1.4fr;
    gap: 8px;
    margin-top: 12px;
  }
  .stat {
    background: var(--purple-bg);
    border-radius: 16px;
    padding: 10px 12px;
    text-align: center;
  }
  .stat__k {
    font-size: 11px;
    font-weight: 800;
    color: var(--purple-ink);
  }
  .stat__v {
    font-size: 15px;
    font-weight: 800;
    color: var(--ink);
    margin-top: 2px;
    white-space: nowrap;
  }

  /* ---- timeline ---- */
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 34svh;
    overflow-y: auto;
  }
  .srow {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--hair);
    background: var(--surface);
    border-radius: 14px;
    padding: 10px 12px;
    text-align: left;
  }
  .srow:disabled {
    cursor: default;
  }
  .srow__icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    background: var(--purple-bg);
  }
  .srow__title {
    flex: 1;
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .srow__dur {
    font-size: 13px;
    font-weight: 800;
    color: var(--muted);
  }

  .wrow {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px dashed var(--hair);
    background: transparent;
    border-radius: 14px;
    padding: 8px 12px;
  }
  .wrow__icon {
    width: 34px;
    text-align: center;
    font-size: 14px;
    flex: none;
    opacity: 0.8;
  }
  .wrow__title {
    flex: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }
  .wrow__dur {
    font-size: 12px;
    font-weight: 700;
    color: var(--muted-2);
  }

  .hint-line {
    text-align: center;
    color: var(--muted-2);
    font-size: 12px;
    font-weight: 600;
    margin-top: 10px;
  }
</style>
