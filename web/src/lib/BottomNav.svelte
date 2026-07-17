<script lang="ts">
  import { hapticSelection } from './telegram'
  import type { Tab } from './types'

  let { active, onChange }: { active: Tab; onChange: (t: Tab) => void } = $props()

  const items: { id: Tab; icon: string; label: string }[] = [
    { id: 'home', icon: '🏠', label: 'Малыш' },
    { id: 'feed', icon: '🍼', label: 'Кормление' },
    { id: 'visit', icon: '🩺', label: 'Врачи' },
    { id: 'files', icon: '📁', label: 'Файлы' },
    { id: 'memory', icon: '🌸', label: 'Память' },
  ]

  function pick(t: Tab) {
    if (t !== active) hapticSelection()
    onChange(t)
  }
</script>

<nav class="nav">
  {#each items as it (it.id)}
    <button class="nav__item" data-active={active === it.id} onclick={() => pick(it.id)}>
      <div class="nav__icon">{it.icon}</div>
      <div class="nav__label">{it.label}</div>
    </button>
  {/each}
</nav>
