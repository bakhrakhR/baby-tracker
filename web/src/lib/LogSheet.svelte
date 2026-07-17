<script lang="ts">
  import { hapticImpact } from './telegram'

  export type LogKind = 'feeding' | 'diaper' | 'sleep'

  let {
    sleeping,
    onPick,
    onClose,
  }: {
    sleeping: boolean
    onPick: (kind: LogKind) => void
    onClose: () => void
  } = $props()

  function pick(kind: LogKind) {
    hapticImpact('light')
    onPick(kind)
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
    <div class="sheet-title">Записать</div>

    <div class="grid">
      <button class="pick pick--feed" onclick={() => pick('feeding')}>
        <span class="pick__emoji">🍼</span>Кормление
      </button>
      <button class="pick pick--diaper" onclick={() => pick('diaper')}>
        <span class="pick__emoji">💧</span>Подгузник
      </button>
      <button class="pick pick--sleep" onclick={() => pick('sleep')}>
        <span class="pick__emoji">{sleeping ? '☀️' : '🌙'}</span>
        {sleeping ? 'Проснулась' : 'Сон'}
      </button>
    </div>
  </div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
  }
  .pick {
    border: none;
    border-radius: var(--r-chip);
    padding: 18px 8px;
    font-size: 14px;
    font-weight: 800;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    transition: transform 0.06s ease;
  }
  .pick:active {
    transform: scale(0.96);
  }
  .pick__emoji {
    font-size: 28px;
  }
  .pick--feed {
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
  }
  .pick--diaper {
    background: linear-gradient(135deg, var(--purple), #bcb0d6);
  }
  .pick--sleep {
    background: linear-gradient(135deg, var(--green), #a3bd9d);
  }
</style>
