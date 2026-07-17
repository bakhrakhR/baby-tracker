<script lang="ts">
  import { onMount } from 'svelte'
  import { initTelegram, hapticSuccess } from './lib/telegram'
  import { session, initSession } from './lib/session'
  import { loadChild, deleteFeeding, type Child, type FeedItem } from './lib/data'
  import type { Tab } from './lib/types'
  import BottomNav from './lib/BottomNav.svelte'
  import FeedingSheet from './lib/FeedingSheet.svelte'
  import Home from './screens/Home.svelte'
  import Feeding from './screens/Feeding.svelte'
  import Soon from './screens/Soon.svelte'
  import AddChild from './screens/AddChild.svelte'

  let tab = $state<Tab>('home')
  let child = $state<Child | null | undefined>(undefined)
  let sheetOpen = $state(false)
  let refreshKey = $state(0)

  // Undo affordance: a mis-tap at 4 a.m. shouldn't need the edit sheet.
  let toast = $state<{ id: string; label: string } | null>(null)
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  onMount(() => {
    initTelegram()
    initSession()
  })

  // Load the child profile once authenticated.
  $effect(() => {
    if ($session.status === 'authed' && child === undefined) {
      loadChild()
        .then((c) => (child = c ?? null))
        .catch((e) => {
          console.error('loadChild', e)
          child = null
        })
    }
  })

  const isEditor = $derived(
    $session.member?.role === 'admin' || $session.member?.role === 'editor',
  )

  function onSaved(item: FeedItem) {
    refreshKey += 1
    sheetOpen = false
    if (toastTimer) clearTimeout(toastTimer)
    toast = { id: item.id, label: `${item.title} · записано` }
    toastTimer = setTimeout(() => (toast = null), 5000)
  }

  async function undo() {
    const t = toast
    if (!t) return
    toast = null
    if (toastTimer) clearTimeout(toastTimer)
    try {
      await deleteFeeding(t.id)
      hapticSuccess()
      refreshKey += 1
    } catch (e) {
      console.error('undo', e)
      alert('Не удалось отменить запись')
    }
  }
</script>

{#if $session.status === 'loading'}
  <div class="app"><div class="center"><div class="spinner"></div></div></div>
{:else if $session.status === 'forbidden'}
  <div class="app"><div class="center">
    <div class="big-emoji">🔒</div>
    <h2>Нет доступа</h2>
    <p class="muted">Этого аккаунта нет в списке семьи. Обратитесь к администратору.</p>
  </div></div>
{:else if $session.status === 'no_telegram'}
  <div class="app"><div class="center">
    <div class="big-emoji">📱</div>
    <h2>Откройте в Telegram</h2>
    <p class="muted">Приложение работает как Telegram Mini App.</p>
  </div></div>
{:else if $session.status === 'error'}
  <div class="app"><div class="center">
    <div class="big-emoji">😕</div>
    <h2>Что-то пошло не так</h2>
    <p class="muted">Ошибка: {$session.error}</p>
    <button class="btn" style="max-width:200px" onclick={() => initSession()}>Повторить</button>
  </div></div>
{:else}
  <!-- authed -->
  <div class="app">
    {#if child === undefined}
      <div class="center"><div class="spinner"></div></div>
    {:else if child === null}
      <div class="app__scroll">
        {#if isEditor}
          <AddChild onCreated={(c) => (child = c)} />
        {:else}
          <div class="center">
            <div class="big-emoji">🌱</div>
            <h2>Пока пусто</h2>
            <p class="muted">Профиль малыша ещё не создан.</p>
          </div>
        {/if}
      </div>
    {:else}
      <div class="app__scroll">
        {#if tab === 'home'}
          <Home {child} {refreshKey} onLogFeeding={() => (sheetOpen = true)} />
        {:else if tab === 'feed'}
          <Feeding
            {child}
            {refreshKey}
            onLogFeeding={() => (sheetOpen = true)}
            onChanged={() => (refreshKey += 1)}
          />
        {:else if tab === 'visit'}
          <Soon title="Визиты к врачам" emoji="🩺" note="Календарь визитов и чек-листы подготовки появятся в следующем обновлении." />
        {:else if tab === 'files'}
          <Soon title="Анализы и документы" emoji="📁" note="Хранилище анализов и сканов документов — скоро." />
        {:else if tab === 'memory'}
          <Soon title="На память" emoji="🌸" note="Лента фото и историй для родных — скоро." />
        {/if}
      </div>
      <BottomNav active={tab} onChange={(t) => (tab = t)} />
    {/if}
  </div>

  {#if sheetOpen && child}
    <FeedingSheet childId={child.id} onClose={() => (sheetOpen = false)} onSaved={onSaved} />
  {/if}

  {#if toast}
    <div class="toast">
      <span>{toast.label}</span>
      <button class="toast__undo" onclick={undo}>Отменить</button>
    </div>
  {/if}
{/if}

<style>
  .big-emoji {
    font-size: 48px;
  }
  h2 {
    font-size: 19px;
    font-weight: 700;
    color: var(--ink);
  }
  .muted {
    color: var(--muted);
    font-size: 15px;
    font-weight: 600;
    max-width: 280px;
  }
</style>
