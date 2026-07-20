<script lang="ts">
  import { untrack } from 'svelte'
  import {
    updateFeeding,
    deleteFeeding,
    SIDE_RU,
    type FeedItem,
    type FeedingPatch,
  } from './data'
  import { hapticSuccess, hapticError } from './telegram'
  import { toTimeInput, nearestTime } from './format'
  import type { BreastSide, MilkType } from './types'

  let {
    item,
    onClose,
    onSaved,
    onDeleted,
  }: {
    item: FeedItem
    onClose: () => void
    onSaved: (f: FeedItem) => void
    onDeleted: (id: string) => void
  } = $props()

  // Snapshot the record once: the sheet is mounted per record, and later prop
  // changes must not clobber what the user is typing.
  const init = untrack(() => ({
    side: item.breast_side ?? ('both' as BreastSide),
    duration: item.duration_min,
    amount: item.amount_ml ?? 120,
    milk: item.milk_type ?? ('formula' as MilkType),
    time: toTimeInput(item.fed_at),
    notes: item.notes ?? '',
  }))

  let side = $state<BreastSide>(init.side)
  let duration = $state<number | null>(init.duration)
  let amount = $state<number>(init.amount)
  let milk = $state<MilkType>(init.milk)
  let time = $state(init.time)
  let notes = $state(init.notes)
  let busy = $state(false)

  const sides: BreastSide[] = ['left', 'both', 'right']
  const amountChips = [60, 90, 120, 150, 180]

  const validNumbers = $derived(
    item.method === 'bottle'
      ? amount != null && amount >= 1 && amount <= 500
      : duration == null || (duration >= 1 && duration <= 240),
  )

  async function save() {
    if (busy || !validNumbers) return
    // edits resolve the typed time to the day nearest the original record and
    // must never land in the future (audit findings: the old day-roll
    // teleported records 24h away on a fat-fingered future time)
    const fed_at = nearestTime(item.fed_at, time)
    if (new Date(fed_at).getTime() > Date.now() + 60_000) {
      alert('Это время ещё не наступило')
      return
    }
    busy = true
    const patch: FeedingPatch = {
      fed_at,
      notes: notes.trim() || null,
    }
    if (item.method === 'breast') {
      patch.breast_side = side
      patch.duration_min = duration || null
    } else {
      patch.amount_ml = amount
      patch.milk_type = milk
    }
    try {
      const updated = await updateFeeding(item.id, patch)
      hapticSuccess()
      onSaved(updated)
      onClose()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось сохранить изменения')
      console.error(e)
    }
  }

  async function remove() {
    if (busy) return
    if (!confirm('Удалить эту запись?')) return
    busy = true
    try {
      await deleteFeeding(item.id)
      hapticSuccess()
      onDeleted(item.id)
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
    <div class="sheet-title">{item.icon} {item.title}</div>

    {#if item.method === 'breast'}
      <div class="field-label">Сторона</div>
      <div class="chips">
        {#each sides as s (s)}
          <button class="chip" data-active={side === s} onclick={() => (side = s)}>
            {SIDE_RU[s]}
          </button>
        {/each}
      </div>

      <div class="field-label">Длительность, мин</div>
      <input
        class="input input--time"
        type="number"
        min="1"
        max="240"
        placeholder="—"
        bind:value={duration}
      />
    {:else}
      <div class="field-label">Объём, мл</div>
      <div class="chips">
        {#each amountChips as a (a)}
          <button class="chip" data-active={amount === a} onclick={() => (amount = a)}>{a}</button>
        {/each}
      </div>
      <input
        class="input input--time"
        style="margin-top:8px"
        type="number"
        min="1"
        max="500"
        bind:value={amount}
      />

      <div class="field-label">Тип</div>
      <div class="chips">
        <button class="chip" data-active={milk === 'formula'} onclick={() => (milk = 'formula')}>Смесь</button>
        <button class="chip" data-active={milk === 'breast_milk'} onclick={() => (milk = 'breast_milk')}>Сцеженное</button>
      </div>
    {/if}

    <div class="field-label">Время</div>
    <input class="input input--time" type="time" bind:value={time} />

    <div class="field-label">Заметка</div>
    <input class="input" type="text" maxlength="200" placeholder="необязательно" bind:value={notes} />

    <button class="btn" style="margin-top:18px" onclick={save} disabled={busy || !validNumbers}>
      {busy ? 'Сохраняю…' : validNumbers ? 'Сохранить' : 'Проверьте значения'}
    </button>
    <button class="btn btn--danger" style="margin-top:10px" onclick={remove} disabled={busy}>
      Удалить запись
    </button>
  </div>
</div>
