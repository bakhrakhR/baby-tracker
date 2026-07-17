<script lang="ts">
  import {
    loadSleepToday,
    updateSleep,
    deleteSleep,
    type SleepItem,
  } from './data'
  import { hapticSuccess, hapticError, hapticSelection } from './telegram'
  import { timeHM, toTimeInput, fromTimeInput, fromTimeInputAfter, durationLabel } from './format'

  let {
    childId,
    canEdit,
    onClose,
    onToggle,
    onChanged,
  }: {
    childId: string
    canEdit: boolean
    onClose: () => void
    // App owns start/end so the home-screen chip and this sheet share one path.
    onToggle: (open: { id: string; started_at: string } | null) => void
    onChanged: () => void
  } = $props()

  let items = $state<SleepItem[]>([])
  let loading = $state(true)
  let busy = $state(false)

  const open = $derived(items.find((s) => s.ended_at === null) ?? null)

  // edit sub-view
  let editing = $state<SleepItem | null>(null)
  let eStart = $state('')
  let eEnd = $state('')
  let eStillAsleep = $state(false)
  let eNotes = $state('')

  $effect(() => {
    const id = childId
    loading = true
    loadSleepToday(id)
      .then((r) => (items = r))
      .catch((e) => console.error('loadSleepToday', e))
      .finally(() => (loading = false))
  })

  function toggle() {
    onToggle(open ? { id: open.id, started_at: open.started_at } : null)
    onClose()
  }

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
    busy = true
    const started_at = fromTimeInput(editing.started_at, eStart)
    try {
      await updateSleep(editing.id, {
        started_at,
        // sleep can cross midnight, so the end rolls forward from the start
        ended_at: eStillAsleep ? null : fromTimeInputAfter(started_at, eEnd),
        notes: eNotes.trim() || null,
      })
      hapticSuccess()
      onChanged()
      onClose()
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
      onChanged()
      onClose()
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
    {:else}
      <div class="sheet-title">{open ? '😴 Спит' : '🌙 Сон'}</div>

      {#if open}
        <div class="status">Спит уже <b>{durationLabel(open.started_at)}</b> · с {timeHM(open.started_at)}</div>
      {/if}

      {#if canEdit}
        <button class="btn {open ? '' : 'btn--sleep'}" onclick={toggle}>
          {open ? '☀️ Проснулась' : '🌙 Уснула'}
        </button>
      {/if}

      <div class="field-label" style="margin-top:16px">Сегодня</div>
      {#if loading && items.length === 0}
        <div class="empty">Загрузка…</div>
      {:else if items.length === 0}
        <div class="empty">Сегодня ещё нет записей сна.</div>
      {:else}
        <div class="rows">
          {#each items as s (s.id)}
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
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .status {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-soft);
    margin-bottom: 14px;
  }
  .btn--sleep {
    background: linear-gradient(135deg, var(--green), #a3bd9d);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 240px;
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
    background: var(--green-bg);
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
</style>
