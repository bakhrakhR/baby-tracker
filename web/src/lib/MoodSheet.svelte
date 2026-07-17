<script lang="ts">
  import {
    loadWellbeing,
    addWellbeing,
    updateWellbeing,
    deleteWellbeing,
    MOOD_EMOJI,
    MOOD_RU,
    type Mood,
    type WellbeingItem,
  } from './data'
  import { hapticSuccess, hapticError, hapticSelection } from './telegram'
  import { timeHM, dayLabel } from './format'

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
    onLogged: (w: WellbeingItem) => void
    onChanged: () => void
  } = $props()

  let items = $state<WellbeingItem[]>([])
  let loading = $state(true)
  let busy = $state(false)

  let editing = $state<WellbeingItem | null>(null)
  let fMood = $state<Mood | null>(null)
  let fComment = $state('')

  const moods: Mood[] = ['great', 'good', 'ok', 'fussy', 'sick']

  $effect(() => {
    const id = childId
    loading = true
    loadWellbeing(id)
      .then((r) => (items = r))
      .catch((e) => console.error('loadWellbeing', e))
      .finally(() => (loading = false))
  })

  async function save() {
    if (!fMood || busy) return
    busy = true
    try {
      if (editing) {
        await updateWellbeing(editing.id, { mood: fMood, comment: fComment.trim() || null })
        onChanged()
      } else {
        const item = await addWellbeing(childId, fMood, fComment.trim() || null)
        onLogged(item)
      }
      hapticSuccess()
      onClose()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось сохранить запись')
      console.error(e)
    }
  }

  async function remove() {
    if (!editing || busy) return
    if (!confirm('Удалить эту запись?')) return
    busy = true
    try {
      await deleteWellbeing(editing.id)
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

  function openEdit(w: WellbeingItem) {
    if (!canEdit) return
    hapticSelection()
    editing = w
    fMood = w.mood
    fComment = w.comment ?? ''
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
    <div class="sheet-title">😊 {editing ? 'Запись' : 'Как малыш?'}</div>

    {#if canEdit}
      <div class="moods">
        {#each moods as m (m)}
          <button class="mood" data-active={fMood === m} onclick={() => (fMood = m)}>
            <span class="mood__emoji">{MOOD_EMOJI[m]}</span>
            <span class="mood__label">{MOOD_RU[m]}</span>
          </button>
        {/each}
      </div>

      <div class="field-label">Комментарий</div>
      <input
        class="input"
        type="text"
        maxlength="300"
        placeholder="видно бабушкам на инфо-странице"
        bind:value={fComment}
      />

      <button class="btn" style="margin-top:16px" onclick={save} disabled={!fMood || busy}>
        {busy ? 'Сохраняю…' : editing ? 'Сохранить' : 'Записать'}
      </button>
      {#if editing}
        <button class="btn btn--danger" style="margin-top:10px" onclick={remove} disabled={busy}>
          Удалить запись
        </button>
      {/if}
    {/if}

    {#if !editing}
      <div class="field-label" style="margin-top:16px">Недавние записи</div>
      {#if loading && items.length === 0}
        <div class="empty">Загрузка…</div>
      {:else if items.length === 0}
        <div class="empty">Записей пока нет.</div>
      {:else}
        <div class="rows">
          {#each items as w (w.id)}
            <button class="wrow" onclick={() => openEdit(w)} disabled={!canEdit}>
              <span class="wrow__emoji">{w.mood ? MOOD_EMOJI[w.mood] : '💬'}</span>
              <span class="wrow__text">{w.comment ?? (w.mood ? MOOD_RU[w.mood] : '')}</span>
              <span class="wrow__when">{dayLabel(w.posted_at)} · {timeHM(w.posted_at)}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .moods {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
  }
  .mood {
    border: 2px solid var(--hair);
    background: var(--surface);
    border-radius: var(--r-chip);
    padding: 10px 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    transition: transform 0.06s ease;
  }
  .mood:active {
    transform: scale(0.95);
  }
  .mood[data-active='true'] {
    background: var(--peach-bg);
    border-color: var(--accent);
  }
  .mood__emoji {
    font-size: 24px;
  }
  .mood__label {
    font-size: 10px;
    font-weight: 800;
    color: var(--ink-soft);
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 220px;
    overflow-y: auto;
  }
  .wrow {
    display: flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--hair);
    background: var(--surface);
    border-radius: 14px;
    padding: 10px 12px;
    text-align: left;
  }
  .wrow:disabled {
    cursor: default;
  }
  .wrow__emoji {
    font-size: 20px;
    flex: none;
  }
  .wrow__text {
    flex: 1;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .wrow__when {
    font-size: 11px;
    font-weight: 800;
    color: var(--muted);
    flex: none;
  }
</style>
