<script lang="ts">
  import {
    loadDiapersToday,
    loadDiaperHistory,
    addDiaper,
    updateDiaper,
    deleteDiaper,
    DIAPER_RU,
    type DiaperItem,
    type DiaperHistory,
  } from './data'
  import { hapticSuccess, hapticError, hapticSelection } from './telegram'
  import { timeHM, toTimeInput, nearestTime } from './format'
  import type { DiaperKind } from './types'

  let {
    childId,
    canEdit,
    onClose,
    onLogged,
    onChanged,
  }: {
    childId: string
    canEdit: boolean
    onClose: () => void
    onLogged: (d: DiaperItem) => void
    onChanged: () => void
  } = $props()

  let items = $state<DiaperItem[]>([])
  let loading = $state(true)
  let busy = $state(false)

  // past days, loaded on demand
  let history = $state<DiaperHistory | null>(null)
  let loadingHistory = $state(false)

  function openHistory() {
    hapticSelection()
    loadingHistory = true
    loadDiaperHistory(childId)
      .then((h) => (history = h))
      .catch((e) => console.error('loadDiaperHistory', e))
      .finally(() => (loadingHistory = false))
  }

  // edit sub-view
  let editing = $state<DiaperItem | null>(null)
  let eKind = $state<DiaperKind>('wet')
  let eTime = $state('')
  let eNotes = $state('')

  const kinds: { kind: DiaperKind; emoji: string }[] = [
    { kind: 'wet', emoji: '💧' },
    { kind: 'dirty', emoji: '💩' },
    { kind: 'mixed', emoji: '💫' },
  ]

  $effect(() => {
    const id = childId
    loading = true
    loadDiapersToday(id)
      .then((r) => (items = r))
      .catch((e) => console.error('loadDiapersToday', e))
      .finally(() => (loading = false))
  })

  // One tap: save with the current time and close — the 4 a.m. path.
  async function quickLog(kind: DiaperKind) {
    if (busy) return
    busy = true
    try {
      const item = await addDiaper(childId, kind)
      hapticSuccess()
      onLogged(item)
      onClose()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось записать подгузник')
      console.error(e)
    }
  }

  function openEdit(d: DiaperItem) {
    if (!canEdit) return
    hapticSelection()
    editing = d
    eKind = d.kind
    eTime = toTimeInput(d.changed_at)
    eNotes = d.notes ?? ''
  }

  async function saveEdit() {
    if (!editing || busy) return
    const changed_at = nearestTime(editing.changed_at, eTime)
    if (new Date(changed_at).getTime() > Date.now() + 60_000) {
      alert('Это время ещё не наступило')
      return
    }
    busy = true
    try {
      await updateDiaper(editing.id, {
        kind: eKind,
        changed_at,
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
      await deleteDiaper(editing.id)
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
      <div class="sheet-title">{editing.icon} Подгузник</div>

      <div class="field-label">Тип</div>
      <div class="chips">
        {#each kinds as k (k.kind)}
          <button class="chip" data-active={eKind === k.kind} onclick={() => (eKind = k.kind)}>
            {k.emoji} {DIAPER_RU[k.kind]}
          </button>
        {/each}
      </div>

      <div class="field-label">Время</div>
      <input class="input input--time" type="time" bind:value={eTime} />

      <div class="field-label">Заметка</div>
      <input class="input" type="text" maxlength="200" placeholder="необязательно" bind:value={eNotes} />

      <button class="btn" style="margin-top:18px" onclick={saveEdit} disabled={busy}>
        {busy ? 'Сохраняю…' : 'Сохранить'}
      </button>
      <button class="btn btn--danger" style="margin-top:10px" onclick={removeEdit} disabled={busy}>
        Удалить запись
      </button>
    {:else}
      <div class="sheet-title">💧 Подгузник</div>

      {#if canEdit}
        <div class="quick">
          {#each kinds as k (k.kind)}
            <button class="qbtn" onclick={() => quickLog(k.kind)} disabled={busy}>
              <span class="qbtn__emoji">{k.emoji}</span>
              {DIAPER_RU[k.kind]}
            </button>
          {/each}
        </div>
        <p class="hint-line">Запишется сразу · время — сейчас</p>
      {/if}

      {#snippet diaperRow(d: DiaperItem)}
        <button class="drow" onclick={() => openEdit(d)} disabled={!canEdit}>
          <span class="drow__icon" style="background:{d.iconBg}; color:{d.iconColor}">{d.icon}</span>
          <span class="drow__title">{d.title}{d.notes ? ` · ${d.notes}` : ''}</span>
          <span class="drow__time">{timeHM(d.changed_at)}</span>
        </button>
      {/snippet}

      <div class="scrollable">
        <div class="field-label" style="margin-top:16px">Сегодня · {items.length}</div>
        {#if loading && items.length === 0}
          <div class="empty">Загрузка…</div>
        {:else if items.length === 0}
          <div class="empty">Сегодня ещё нет записей.</div>
        {:else}
          <div class="rows">
            {#each items as d (d.id)}
              {@render diaperRow(d)}
            {/each}
          </div>
        {/if}

        <!-- past days -->
        <div class="history">
          {#if history === null}
            <button class="btn btn--soft" onclick={openHistory} disabled={loadingHistory}>
              {loadingHistory ? 'Загрузка…' : 'Показать прошлые дни ▾'}
            </button>
          {:else if history.days.length === 0}
            <div class="empty">За прошлые дни записей нет.</div>
          {:else}
            {#each history.days as day (day.key)}
              <details class="hday" ontoggle={() => hapticSelection()}>
                <summary class="hday__sum">
                  <div>
                    <div class="hday__label">{day.label}</div>
                    <div class="hday__meta">{day.summary}</div>
                  </div>
                  <span class="hday__chev">›</span>
                </summary>
                <div class="rows hday__list">
                  {#each day.items as d (d.id)}
                    {@render diaperRow(d)}
                  {/each}
                </div>
              </details>
            {/each}
            {#if history.truncated}
              <p class="hint-line">Показаны последние записи — старые дни обрезаны</p>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .quick {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
  }
  .qbtn {
    border: none;
    border-radius: var(--r-chip);
    padding: 16px 8px;
    font-size: 14px;
    font-weight: 800;
    color: #fff;
    background: linear-gradient(135deg, var(--purple), #bcb0d6);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    transition: transform 0.06s ease;
  }
  .qbtn:active {
    transform: scale(0.96);
  }
  .qbtn__emoji {
    font-size: 26px;
  }
  .hint-line {
    text-align: center;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    margin-top: 12px;
  }
  .scrollable {
    max-height: 56svh;
    overflow-y: auto;
    padding-bottom: 4px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* past-day spoilers */
  .history {
    margin-top: 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .hday {
    border: 1px solid var(--hair);
    background: var(--surface);
    border-radius: 14px;
    overflow: hidden;
  }
  .hday__sum {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 11px 13px;
  }
  .hday__sum::-webkit-details-marker {
    display: none;
  }
  .hday__label {
    font-size: 14px;
    font-weight: 800;
    color: var(--ink);
  }
  .hday__meta {
    font-size: 12px;
    color: var(--muted);
    font-weight: 700;
    margin-top: 2px;
  }
  .hday__chev {
    color: var(--muted-2);
    font-size: 20px;
    font-weight: 700;
    transition: transform 0.18s ease;
  }
  .hday[open] .hday__chev {
    transform: rotate(90deg);
  }
  .hday__list {
    padding: 0 10px 10px;
  }
  .hday__list :global(.drow) {
    background: var(--bg);
  }
  .drow {
    display: flex;
    align-items: center;
    gap: 12px;
    border: 1px solid var(--hair);
    background: var(--surface);
    border-radius: 14px;
    padding: 10px 12px;
    text-align: left;
  }
  .drow:disabled {
    cursor: default;
  }
  .drow__icon {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }
  .drow__title {
    flex: 1;
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .drow__time {
    font-size: 13px;
    font-weight: 800;
    color: var(--muted);
  }
</style>
