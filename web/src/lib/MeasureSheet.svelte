<script lang="ts">
  import {
    loadMeasurements,
    addMeasurement,
    updateMeasurement,
    deleteMeasurement,
    type MeasurementItem,
    type MeasurementPatch,
  } from './data'
  import { hapticSuccess, hapticError, hapticSelection } from './telegram'
  import { dayLabel, kg } from './format'

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
    onLogged: (m: MeasurementItem) => void
    onChanged: () => void
  } = $props()

  let items = $state<MeasurementItem[]>([])
  let loading = $state(true)
  let busy = $state(false)

  // form state (used both for new and edit)
  let editing = $state<MeasurementItem | null>(null)
  let fDate = $state(new Date().toISOString().slice(0, 10))
  let fWeight = $state<number | null>(null)
  let fHeight = $state<number | null>(null)
  let fHead = $state<number | null>(null)
  let fNotes = $state('')

  const canSave = $derived(fWeight != null || fHeight != null || fHead != null)

  $effect(() => {
    const id = childId
    loading = true
    loadMeasurements(id)
      .then((r) => (items = r))
      .catch((e) => console.error('loadMeasurements', e))
      .finally(() => (loading = false))
  })

  function fields(): MeasurementPatch {
    return {
      measured_at: fDate,
      weight_g: fWeight || null,
      height_cm: fHeight || null,
      head_cm: fHead || null,
      notes: fNotes.trim() || null,
    }
  }

  async function save() {
    if (!canSave || busy) return
    busy = true
    try {
      if (editing) {
        await updateMeasurement(editing.id, fields())
        onChanged()
      } else {
        const item = await addMeasurement(childId, fields())
        onLogged(item)
      }
      hapticSuccess()
      onClose()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось сохранить замер')
      console.error(e)
    }
  }

  async function remove() {
    if (!editing || busy) return
    if (!confirm('Удалить этот замер?')) return
    busy = true
    try {
      await deleteMeasurement(editing.id)
      hapticSuccess()
      onChanged()
      onClose()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось удалить замер')
      console.error(e)
    }
  }

  function openEdit(m: MeasurementItem) {
    if (!canEdit) return
    hapticSelection()
    editing = m
    fDate = m.measured_at
    fWeight = m.weight_g
    fHeight = m.height_cm != null ? Number(m.height_cm) : null
    fHead = m.head_cm != null ? Number(m.head_cm) : null
    fNotes = m.notes ?? ''
  }

  function rowLabel(m: MeasurementItem): string {
    const parts: string[] = []
    if (m.weight_g != null) parts.push(`${kg(m.weight_g)} кг`)
    if (m.height_cm != null) parts.push(`${m.height_cm} см`)
    if (m.head_cm != null) parts.push(`голова ${m.head_cm} см`)
    return parts.join(' · ') || '—'
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
    <div class="sheet-title">📈 {editing ? 'Замер' : 'Новый замер'}</div>

    {#if canEdit}
      <div class="grid2">
        <label class="f">
          <span class="field-label">Вес, г</span>
          <input class="input" type="number" min="300" max="30000" placeholder="6240" bind:value={fWeight} />
          {#if fWeight}<span class="conv">= {kg(fWeight)} кг</span>{/if}
        </label>
        <label class="f">
          <span class="field-label">Дата</span>
          <input class="input" type="date" bind:value={fDate} />
        </label>
        <label class="f">
          <span class="field-label">Рост, см</span>
          <input class="input" type="number" min="20" max="150" step="0.5" placeholder="61.5" bind:value={fHeight} />
        </label>
        <label class="f">
          <span class="field-label">Голова, см</span>
          <input class="input" type="number" min="20" max="70" step="0.5" placeholder="40.5" bind:value={fHead} />
        </label>
      </div>

      <div class="field-label">Заметка</div>
      <input class="input" type="text" maxlength="200" placeholder="необязательно" bind:value={fNotes} />

      <button class="btn" style="margin-top:16px" onclick={save} disabled={!canSave || busy}>
        {busy ? 'Сохраняю…' : editing ? 'Сохранить' : 'Записать замер'}
      </button>
      {#if editing}
        <button class="btn btn--danger" style="margin-top:10px" onclick={remove} disabled={busy}>
          Удалить замер
        </button>
      {/if}
    {/if}

    {#if !editing}
      <div class="field-label" style="margin-top:16px">Недавние замеры</div>
      {#if loading && items.length === 0}
        <div class="empty">Загрузка…</div>
      {:else if items.length === 0}
        <div class="empty">Замеров пока нет.</div>
      {:else}
        <div class="rows">
          {#each items as m (m.id)}
            <button class="mrow" onclick={() => openEdit(m)} disabled={!canEdit}>
              <span class="mrow__date">{dayLabel(m.measured_at)}</span>
              <span class="mrow__vals">{rowLabel(m)}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 12px;
  }
  .f {
    display: block;
  }
  .conv {
    display: block;
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    margin-top: 4px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 220px;
    overflow-y: auto;
  }
  .mrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--hair);
    background: var(--surface);
    border-radius: 14px;
    padding: 11px 13px;
    text-align: left;
  }
  .mrow:disabled {
    cursor: default;
  }
  .mrow__date {
    font-size: 13px;
    font-weight: 800;
    color: var(--muted);
    flex: none;
  }
  .mrow__vals {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
