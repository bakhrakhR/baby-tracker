<script lang="ts">
  import {
    loadFeedingSettings,
    saveFeedingSettings,
    type FeedingSettings,
  } from './data'
  import { hapticSuccess, hapticError, hapticSelection } from './telegram'

  let {
    childId,
    onClose,
    onChanged,
  }: {
    childId: string
    onClose: () => void
    onChanged: () => void
  } = $props()

  let loaded = $state(false)
  let busy = $state(false)

  let enabled = $state(false)
  let interval = $state(180)
  let quiet = $state(false)
  let quietFrom = $state('23:00')
  let quietTo = $state('07:00')

  const intervals = [120, 150, 180, 210, 240]

  $effect(() => {
    const id = childId
    loadFeedingSettings(id)
      .then((s) => {
        enabled = s.enabled
        interval = s.interval_minutes
        quiet = s.quiet_from != null && s.quiet_to != null
        if (s.quiet_from) quietFrom = s.quiet_from
        if (s.quiet_to) quietTo = s.quiet_to
        loaded = true
      })
      .catch((e) => {
        console.error('loadFeedingSettings', e)
        loaded = true
      })
  })

  async function save() {
    if (busy) return
    busy = true
    const s: FeedingSettings = {
      enabled,
      interval_minutes: interval,
      quiet_from: quiet ? quietFrom : null,
      quiet_to: quiet ? quietTo : null,
    }
    try {
      await saveFeedingSettings(childId, s)
      hapticSuccess()
      onChanged()
      onClose()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось сохранить настройки')
      console.error(e)
    }
  }

  function toggleEnabled() {
    hapticSelection()
    enabled = !enabled
  }
  function toggleQuiet() {
    hapticSelection()
    quiet = !quiet
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
    <div class="sheet-title">🔔 Напоминания о кормлении</div>

    {#if !loaded}
      <div class="empty">Загрузка…</div>
    {:else}
      <button class="switchrow" onclick={toggleEnabled}>
        <span>Напоминать в Telegram</span>
        <span class="track" data-on={enabled}><span class="knob"></span></span>
      </button>

      {#if enabled}
        <div class="field-label">Через сколько после последнего кормления</div>
        <div class="chips">
          {#each intervals as m (m)}
            <button class="chip" data-active={interval === m} onclick={() => (interval = m)}>
              {m % 60 === 0 ? `${m / 60} ч` : `${Math.floor(m / 60)},5 ч`}
            </button>
          {/each}
        </div>

        <button class="switchrow" style="margin-top:14px" onclick={toggleQuiet}>
          <span>Тихие часы · не будить ночью</span>
          <span class="track" data-on={quiet}><span class="knob"></span></span>
        </button>

        {#if quiet}
          <div class="grid2">
            <label class="f">
              <span class="field-label">С</span>
              <input class="input" type="time" bind:value={quietFrom} />
            </label>
            <label class="f">
              <span class="field-label">До</span>
              <input class="input" type="time" bind:value={quietTo} />
            </label>
          </div>
          <p class="qhint">В тихие часы напоминание не отправится — придёт после их окончания.</p>
        {/if}
      {/if}

      <button class="btn" style="margin-top:18px" onclick={save} disabled={busy}>
        {busy ? 'Сохраняю…' : 'Сохранить'}
      </button>
    {/if}
  </div>
</div>

<style>
  .switchrow {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: none;
    background: var(--surface);
    border-radius: var(--r-btn);
    padding: 14px 16px;
    font-family: inherit;
    font-size: 15px;
    font-weight: 700;
    color: var(--ink);
    box-shadow: var(--sh-card);
    margin-bottom: 4px;
  }
  .track {
    width: 44px;
    height: 26px;
    border-radius: 999px;
    background: var(--hair);
    padding: 3px;
    display: flex;
    justify-content: flex-start;
    transition: background 0.15s;
    flex: none;
  }
  .track[data-on='true'] {
    background: var(--accent);
    justify-content: flex-end;
  }
  .knob {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 12px;
  }
  .f {
    display: block;
  }
  .qhint {
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
    margin-top: 8px;
  }
</style>
