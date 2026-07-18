<script lang="ts">
  import { onMount } from 'svelte'
  import { initTelegram, hapticSuccess, hapticError, hapticImpact } from './lib/telegram'
  import { session, initSession } from './lib/session'
  import {
    loadChild,
    deleteFeeding,
    deleteDiaper,
    deleteSleep,
    startSleep,
    endSleep,
    updateSleep,
    deleteMeasurement,
    deleteWellbeing,
    MOOD_RU,
    type Child,
    type FeedItem,
    type DiaperItem,
    type MeasurementItem,
    type WellbeingItem,
  } from './lib/data'
  import { durationLabel } from './lib/format'
  import type { Tab } from './lib/types'
  import BottomNav from './lib/BottomNav.svelte'
  import FeedingSheet from './lib/FeedingSheet.svelte'
  import DiaperSheet from './lib/DiaperSheet.svelte'
  import SleepSheet from './lib/SleepSheet.svelte'
  import MeasureSheet from './lib/MeasureSheet.svelte'
  import MoodSheet from './lib/MoodSheet.svelte'
  import LogSheet, { type LogKind } from './lib/LogSheet.svelte'
  import FamilySheet from './lib/FamilySheet.svelte'
  import FeedingSettingsSheet from './lib/FeedingSettingsSheet.svelte'
  import ChildSheet from './lib/ChildSheet.svelte'
  import Home from './screens/Home.svelte'
  import Feeding from './screens/Feeding.svelte'
  import Visits from './screens/Visits.svelte'
  import Files from './screens/Files.svelte'
  import Memories from './screens/Memories.svelte'
  import AddChild from './screens/AddChild.svelte'
  import Info from './screens/Info.svelte'

  let tab = $state<Tab>('home')
  let child = $state<Child | null | undefined>(undefined)
  let sheet = $state<
    | 'log'
    | 'feeding'
    | 'diapers'
    | 'sleep'
    | 'measure'
    | 'mood'
    | 'family'
    | 'feedset'
    | 'child'
    | null
  >(null)
  let refreshKey = $state(0)
  let sleepBusy = $state(false)
  // Home passes the open sleep session up so LogSheet can label its button.
  let openSleep = $state<{ id: string; started_at: string } | null>(null)

  // Undo affordance: a mis-tap at 4 a.m. shouldn't need the edit sheet.
  let toast = $state<{ label: string; undo: (() => Promise<void>) | null } | null>(null)
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
  const isGuest = $derived($session.member?.role === 'guest')

  function showToast(label: string, undo: (() => Promise<void>) | null) {
    if (toastTimer) clearTimeout(toastTimer)
    toast = { label, undo }
    toastTimer = setTimeout(() => (toast = null), 5000)
  }

  async function undo() {
    const t = toast
    if (!t?.undo) return
    toast = null
    if (toastTimer) clearTimeout(toastTimer)
    try {
      await t.undo()
      hapticSuccess()
      refreshKey += 1
    } catch (e) {
      console.error('undo', e)
      alert('Не удалось отменить запись')
    }
  }

  function onFeedingSaved(item: FeedItem) {
    refreshKey += 1
    sheet = null
    showToast(`${item.title} · записано`, () => deleteFeeding(item.id))
  }

  function onDiaperLogged(item: DiaperItem) {
    refreshKey += 1
    showToast(`${item.title} подгузник · записано`, () => deleteDiaper(item.id))
  }

  function onMeasureLogged(item: MeasurementItem) {
    refreshKey += 1
    showToast('Замер · записано', () => deleteMeasurement(item.id))
  }

  function onMoodLogged(item: WellbeingItem) {
    refreshKey += 1
    const label = item.mood ? MOOD_RU[item.mood] : 'Запись'
    showToast(`${label} · записано`, () => deleteWellbeing(item.id))
  }

  // One shared start/stop path for the home chip and the sleep sheet.
  async function toggleSleep(open: { id: string; started_at: string } | null) {
    if (sleepBusy || !child) return
    sleepBusy = true
    hapticImpact('medium')
    try {
      if (open) {
        const s = await endSleep(open.id)
        showToast(`Сон · ${durationLabel(s.started_at, s.ended_at)}`, () =>
          updateSleep(s.id, { ended_at: null }).then(() => {}),
        )
      } else {
        const s = await startSleep(child.id)
        showToast('Сон начат 😴', () => deleteSleep(s.id))
      }
      hapticSuccess()
      refreshKey += 1
    } catch (e) {
      hapticError()
      console.error('toggleSleep', e)
      alert('Не удалось записать сон')
    } finally {
      sleepBusy = false
    }
  }

  // Every pick opens its full sheet (sleep includes the toggle plus editing).
  function pickLog(kind: LogKind) {
    const map = {
      feeding: 'feeding',
      diaper: 'diapers',
      sleep: 'sleep',
      measure: 'measure',
      mood: 'mood',
    } as const
    sheet = map[kind]
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
    {:else if isGuest}
      <!-- guests get the info page only: no tabs, no logging, no private data -->
      <div class="app__scroll">
        <Info {child} />
      </div>
    {:else}
      <div class="app__scroll">
        {#if tab === 'home'}
          <Home
            {child}
            {refreshKey}
            onLogFeeding={() => (sheet = 'feeding')}
            onOpenDiapers={() => (sheet = 'diapers')}
            onOpenMeasure={() => (sheet = 'measure')}
            onOpenMood={() => (sheet = 'mood')}
            onOpenFamily={() => (sheet = 'family')}
            onOpenFeedSettings={() => (sheet = 'feedset')}
            onOpenChild={() => (sheet = 'child')}
            onToggleSleep={(open) => toggleSleep(open)}
            bind:openSleepOut={openSleep}
          />
        {:else if tab === 'feed'}
          <Feeding
            {child}
            {refreshKey}
            onLogFeeding={() => (sheet = 'feeding')}
            onChanged={() => (refreshKey += 1)}
          />
        {:else if tab === 'visit'}
          <Visits {child} {refreshKey} />
        {:else if tab === 'files'}
          <Files {child} {refreshKey} />
        {:else if tab === 'memory'}
          <Memories {child} {refreshKey} />
        {/if}
      </div>
      <BottomNav active={tab} onChange={(t) => (tab = t)} />

      {#if isEditor && tab === 'home'}
        <button class="fab" aria-label="Записать" onclick={() => (sheet = 'log')}>＋</button>
      {/if}
    {/if}
  </div>

  {#if child}
    {#if sheet === 'log'}
      <LogSheet sleeping={openSleep !== null} onPick={pickLog} onClose={() => (sheet = null)} />
    {:else if sheet === 'feeding'}
      <FeedingSheet childId={child.id} onClose={() => (sheet = null)} onSaved={onFeedingSaved} />
    {:else if sheet === 'diapers'}
      <DiaperSheet
        childId={child.id}
        canEdit={isEditor}
        onClose={() => (sheet = null)}
        onLogged={onDiaperLogged}
        onChanged={() => (refreshKey += 1)}
      />
    {:else if sheet === 'sleep'}
      <SleepSheet
        childId={child.id}
        canEdit={isEditor}
        onClose={() => (sheet = null)}
        onToggle={toggleSleep}
        onChanged={() => (refreshKey += 1)}
      />
    {:else if sheet === 'measure'}
      <MeasureSheet
        childId={child.id}
        canEdit={isEditor}
        onClose={() => (sheet = null)}
        onLogged={onMeasureLogged}
        onChanged={() => (refreshKey += 1)}
      />
    {:else if sheet === 'mood'}
      <MoodSheet
        childId={child.id}
        canEdit={isEditor}
        onClose={() => (sheet = null)}
        onLogged={onMoodLogged}
        onChanged={() => (refreshKey += 1)}
      />
    {:else if sheet === 'family'}
      <FamilySheet onClose={() => (sheet = null)} />
    {:else if sheet === 'feedset'}
      <FeedingSettingsSheet
        childId={child.id}
        onClose={() => (sheet = null)}
        onChanged={() => (refreshKey += 1)}
      />
    {:else if sheet === 'child'}
      <ChildSheet
        {child}
        canEdit={isEditor}
        onClose={() => (sheet = null)}
        onSaved={(c) => {
          child = c
          refreshKey += 1
        }}
      />
    {/if}
  {/if}

  {#if toast}
    <div class="toast">
      <span>{toast.label}</span>
      {#if toast.undo}
        <button class="toast__undo" onclick={undo}>Отменить</button>
      {/if}
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
