<script lang="ts">
  import { addBreastFeeding, addBottleFeeding, type FeedItem } from './data'
  import { hapticImpact, hapticSuccess, hapticError } from './telegram'
  import { toTimeInput, fromTimeInput } from './format'

  let {
    childId,
    onClose,
    onSaved,
  }: {
    childId: string
    onClose: () => void
    onSaved: (f: FeedItem) => void
  } = $props()

  let step = $state<'choose' | 'bottle'>('choose')
  let amount = $state(120)
  let milk = $state<'formula' | 'breast_milk'>('formula')
  let time = $state(toTimeInput(new Date().toISOString()))
  let saving = $state(false)

  const amountChips = [60, 90, 120, 150, 180]

  async function save(fn: () => Promise<FeedItem>) {
    if (saving) return
    saving = true
    try {
      const item = await fn()
      hapticSuccess()
      onSaved(item)
      onClose()
    } catch (e) {
      hapticError()
      saving = false
      alert('Не удалось сохранить кормление')
      console.error(e)
    }
  }

  // Breast is the 4 a.m. path: one tap, stamped now, editable afterwards.
  const saveBreast = () => save(() => addBreastFeeding(childId, 'both', null))
  const saveBottle = () =>
    save(() =>
      addBottleFeeding(
        childId,
        amount,
        milk,
        fromTimeInput(new Date().toISOString(), time),
      ),
    )

  function chooseBottle() {
    hapticImpact('light')
    step = 'bottle'
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

    {#if step === 'choose'}
      <div class="sheet-title">Записать кормление</div>
      <div class="choose">
        <button class="choice choice--breast" onclick={saveBreast} disabled={saving}>
          <span class="choice__emoji">🤱</span>
          Грудь
        </button>
        <button class="choice choice--bottle" onclick={chooseBottle} disabled={saving}>
          <span class="choice__emoji">🍼</span>
          Бутылочка
        </button>
      </div>
      <p class="sheet-hint">Грудь запишется сразу · время — сейчас</p>
    {:else}
      <div class="sheet-title">🍼 Бутылочка</div>

      <div class="field-label">Объём, мл</div>
      <div class="chips">
        {#each amountChips as a (a)}
          <button class="chip" data-active={amount === a} onclick={() => (amount = a)}>{a}</button>
        {/each}
      </div>

      <div class="field-label">Тип</div>
      <div class="chips">
        <button class="chip" data-active={milk === 'formula'} onclick={() => (milk = 'formula')}>Смесь</button>
        <button class="chip" data-active={milk === 'breast_milk'} onclick={() => (milk = 'breast_milk')}>Сцеженное</button>
      </div>

      <div class="field-label">Время</div>
      <input class="input input--time" type="time" bind:value={time} />

      <button class="btn" style="margin-top:18px" onclick={saveBottle} disabled={saving}>
        {saving ? 'Сохраняю…' : `Сохранить · ${amount} мл`}
      </button>
      <button class="btn btn--soft" style="margin-top:10px" onclick={() => (step = 'choose')} disabled={saving}>
        Назад
      </button>
    {/if}
  </div>
</div>

<style>
  .sheet-hint {
    text-align: center;
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    margin-top: 14px;
  }
  .choose {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .choice {
    border: none;
    border-radius: var(--r-card);
    padding: 26px 12px;
    font-size: 17px;
    font-weight: 800;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    transition: transform 0.06s ease;
  }
  .choice:active {
    transform: scale(0.97);
  }
  .choice__emoji {
    font-size: 34px;
  }
  .choice--breast {
    background: linear-gradient(135deg, var(--green), #a3bd9d);
  }
  .choice--bottle {
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
  }
</style>
