<script lang="ts">
  import type { Child } from '../lib/data'
  import { loadHome, getCached, setCached, type HomeData } from '../lib/data'
  import { session } from '../lib/session'
  import { hapticImpact } from '../lib/telegram'
  import { ageLabel, kg, timeHM, relativeMinutes, dateTimeLabel, agoLabel, durationLabel, minutesLabel, todayLocalISO } from '../lib/format'
  import { sparkline } from '../lib/sparkline'
  import ChildAvatar from '../lib/ChildAvatar.svelte'

  let {
    child,
    refreshKey,
    onLogFeeding,
    onOpenDiapers,
    onOpenMeasure,
    onOpenMood,
    onOpenFamily,
    onOpenFeedSettings,
    onOpenChild,
    onOpenSleep,
    openSleepOut = $bindable(null),
  }: {
    child: Child
    refreshKey: number
    onLogFeeding: () => void
    onOpenDiapers: () => void
    onOpenMeasure: () => void
    onOpenMood: () => void
    onOpenFamily: () => void
    onOpenFeedSettings: () => void
    onOpenChild: () => void
    onOpenSleep: () => void
    openSleepOut?: { id: string; started_at: string } | null
  } = $props()

  let chartMode = $state<'weight' | 'height'>('weight')

  let data = $state<HomeData | null>(null)
  let loading = $state(true)

  const canEdit = $derived(
    $session.member?.role === 'admin' || $session.member?.role === 'editor',
  )

  // Re-render the live sleep duration every 30s while a session is open.
  let nowTick = $state(0)
  $effect(() => {
    const t = setInterval(() => (nowTick += 1), 30_000)
    return () => clearInterval(t)
  })
  const sleepingFor = $derived.by(() => {
    void nowTick
    return data?.openSleep ? durationLabel(data.openSleep.started_at) : ''
  })
  // how long the baby has been awake since the last recorded sleep today
  const awakeFor = $derived.by(() => {
    void nowTick
    if (!data || data.openSleep || !data.lastSleepEndAt) return ''
    return durationLabel(data.lastSleepEndAt)
  })

  const roleLabel: Record<string, string> = {
    admin: 'Админ',
    editor: 'Родитель',
    guest: 'Гость',
  }

  $effect(() => {
    // re-run when the child or refreshKey changes
    refreshKey
    const id = child.id
    const cacheKey = `home:${id}:${todayLocalISO()}`
    const hit = getCached<HomeData>(cacheKey)
    if (hit) {
      data = hit
      openSleepOut = hit.openSleep
      loading = false
    } else {
      loading = true
    }
    loadHome(id)
      .then((d) => {
        data = d
        openSleepOut = d.openSleep
        setCached(cacheKey, d)
      })
      .catch((e) => console.error('loadHome', e))
      .finally(() => (loading = false))
  })

  const tap = () => {
    hapticImpact('medium')
    onLogFeeding()
  }
</script>

<!-- header -->
<header class="head">
  <button class="head__id" onclick={onOpenChild}>
    <ChildAvatar path={child.photo_path} size={50} />
    <div>
      <div class="name">{child.name}</div>
      <div class="sub">{ageLabel(child.birth_date)}</div>
    </div>
  </button>
  {#if $session.member?.role === 'admin'}
    <button class="pill role role--btn" onclick={onOpenFamily}>
      👨‍👩‍👧 Семья
    </button>
  {:else}
    <div class="pill role">● {roleLabel[$session.member?.role ?? 'guest']}</div>
  {/if}
</header>

<!-- feeding hero: the scheduled next feed when reminders are on, otherwise
     "how long since the last one" — the number that matters at 4 a.m. -->
<section class="hero">
  {#if canEdit}
    <button class="hero__bell" aria-label="Настройки напоминаний" onclick={onOpenFeedSettings}>🔔</button>
  {/if}
  {#if data?.nextFeeding}
    <div class="hero__row">🍼 Следующее кормление</div>
    <div class="hero__time">
      <span class="hero__hm">{timeHM(data.nextFeeding.at)}</span>
      <span class="hero__rel">{relativeMinutes(data.nextFeeding.at)}</span>
    </div>
    <div class="hero__detail">{data.nextFeeding.detail}</div>
    {#if data.lastFeedingAt}
      <div class="hero__detail">Последнее — {agoLabel(data.lastFeedingAt)} назад</div>
    {/if}
  {:else if data?.lastFeedingAt}
    <div class="hero__row">🍼 Последнее кормление</div>
    <div class="hero__time">
      <span class="hero__hm hero__hm--sm">{agoLabel(data.lastFeedingAt)}</span>
      <span class="hero__rel">назад</span>
    </div>
    <div class="hero__detail">в {timeHM(data.lastFeedingAt)}</div>
  {:else}
    <div class="hero__row">🍼 Кормление</div>
    <div class="hero__detail" style="margin-top:6px">Запишите кормление в одно касание</div>
  {/if}
  <button class="btn btn--ghost" style="margin-top:16px" onclick={tap}>Покормили</button>
</section>

<!-- metric chips -->
<section class="chips">
  <button class="metric metric--tap" onclick={onOpenMeasure} disabled={!data}>
    <div class="metric__k">📈 Вес</div>
    <div class="metric__v">
      {data?.weightG ? kg(data.weightG) : '—'} <span class="unit">кг</span>
    </div>
    {#if data?.weightDeltaG}
      <div class="metric__d up">↑ +{data.weightDeltaG} г</div>
    {:else if canEdit}
      <div class="metric__d purple">Замер →</div>
    {/if}
  </button>

  <!-- sleep: opens the sleep sheet (slider + timeline); shows the live state -->
  <button
    class="metric metric--tap"
    class:sleeping={data?.openSleep}
    onclick={onOpenSleep}
    disabled={!data}
  >
    {#if data?.openSleep}
      <div class="metric__k">😴 Спит</div>
      <div class="metric__v sm">{sleepingFor}</div>
      <div class="metric__d purple">Открыть →</div>
    {:else}
      <div class="metric__k">🌙 Сон · за сутки</div>
      <div class="metric__v sm">{data?.sleepMinutes != null ? minutesLabel(data.sleepMinutes) : '—'}</div>
      <div class="metric__d purple">{awakeFor ? `☀️ не спит ${awakeFor} →` : 'Открыть →'}</div>
    {/if}
  </button>

  <button class="metric metric--tap" onclick={onOpenMood} disabled={!data}>
    <div class="metric__k">😊 Настроение</div>
    <div class="metric__v sm">{data?.moodLabel ?? '—'}</div>
    {#if canEdit}
      <div class="metric__d purple">Записать →</div>
    {/if}
  </button>

  <button class="metric metric--tap" onclick={onOpenDiapers} disabled={!data}>
    <div class="metric__k">💧 Подгузники</div>
    <div class="metric__v">{data?.diapersToday ?? 0} <span class="unit">за день</span></div>
    {#if canEdit}
      <div class="metric__d purple">Записать →</div>
    {/if}
  </button>
</section>

<!-- growth trend (weight / height) -->
{#if data}
  {@const series = chartMode === 'weight' ? data.weightSeries : data.heightSeries}
  {@const sp = sparkline(series)}
  {#if sp}
    <section class="card trend">
      <div class="trend__head">
        <span class="trend__title">Тренд {chartMode === 'weight' ? 'веса' : 'роста'}</span>
        {#if sparkline(data.heightSeries)}
          <span class="trend__tabs">
            <button class="ttab" data-active={chartMode === 'weight'} onclick={() => (chartMode = 'weight')}>Вес</button>
            <button class="ttab" data-active={chartMode === 'height'} onclick={() => (chartMode = 'height')}>Рост</button>
          </span>
        {:else}
          <span class="sub">{series.length} замеров</span>
        {/if}
      </div>
      <svg viewBox="0 0 300 90" style="width:100%; height:90px">
        <defs>
          <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#E08A5B" stop-opacity=".28" />
            <stop offset="1" stop-color="#E08A5B" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d={sp.area} fill="url(#wg)" />
        <polyline points={sp.line} fill="none" stroke="#E08A5B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx={sp.last[0]} cy={sp.last[1]} r="5" fill="#E08A5B" stroke="#fff" stroke-width="2.5" />
      </svg>
    </section>
  {/if}
{/if}

<!-- next visit -->
{#if data?.nextVisit}
  <section class="visit">
    <div class="visit__icon">🩺</div>
    <div>
      <div class="visit__eyebrow">БЛИЖАЙШИЙ ВИЗИТ</div>
      <div class="visit__title">{data.nextVisit.title}</div>
      <div class="visit__when">
        {dateTimeLabel(data.nextVisit.at)}{data.nextVisit.location ? ` · ${data.nextVisit.location}` : ''}
      </div>
    </div>
  </section>
{/if}

{#if loading && !data}
  <div class="empty">Загрузка…</div>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }
  .head__id {
    display: flex;
    align-items: center;
    gap: 13px;
    border: none;
    background: none;
    padding: 0;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    transition: transform 0.06s ease;
  }
  .head__id:active {
    transform: scale(0.98);
  }
  .name {
    font-family: var(--font-serif);
    font-size: 22px;
    font-weight: 600;
    color: var(--ink);
  }
  .sub {
    font-size: 13px;
    color: var(--muted);
    font-weight: 600;
  }
  .role {
    background: var(--peach-bg);
    color: var(--accent-deep);
  }
  .role--btn {
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: transform 0.06s ease;
  }
  .role--btn:active {
    transform: scale(0.96);
  }

  .hero {
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    border-radius: var(--r-hero);
    padding: 22px 22px 20px;
    color: #fff;
    box-shadow: var(--sh-hero);
    margin-bottom: 16px;
    position: relative;
  }
  .hero__bell {
    position: absolute;
    top: 10px;
    right: 10px;
    border: none;
    background: rgba(255, 255, 255, 0.18);
    border-radius: 50%;
    /* 44px is the minimum comfortable touch target */
    width: 44px;
    height: 44px;
    font-size: 19px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.06s ease;
    -webkit-tap-highlight-color: transparent;
    /* the hero rows use opacity < 1, which creates stacking contexts that
       paint in DOM order — later full-width rows were overlapping the bell's
       left half and stealing its taps. Lift the bell above them. */
    z-index: 1;
  }
  /* invisible halo: extends the tap zone to ~60px without growing the circle */
  .hero__bell::before {
    content: '';
    position: absolute;
    inset: -8px;
    border-radius: 50%;
  }
  .hero__bell:active {
    transform: scale(0.92);
  }
  .hero__row {
    font-size: 13px;
    font-weight: 700;
    opacity: 0.92;
  }
  .hero__time {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-top: 6px;
  }
  .hero__hm {
    font-size: 40px;
    font-weight: 800;
    line-height: 1;
  }
  /* "2 ч 15 мин" is a longer string than "14:30" — keep it on one line. */
  .hero__hm--sm {
    font-size: 30px;
  }
  .hero__rel {
    font-size: 15px;
    font-weight: 700;
    opacity: 0.9;
  }
  .hero__detail {
    font-size: 13px;
    font-weight: 600;
    opacity: 0.9;
    margin-top: 4px;
  }

  .chips {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 11px;
    margin-bottom: 16px;
  }
  .metric {
    background: var(--surface);
    border-radius: 20px;
    padding: 15px 16px;
    box-shadow: var(--sh-card);
  }
  .metric--tap {
    border: none;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    transition: transform 0.06s ease;
  }
  .metric--tap:not(:disabled):active {
    transform: scale(0.97);
  }
  .metric--tap:disabled {
    cursor: default;
  }
  .metric--tap.sleeping {
    background: var(--purple-bg);
  }
  .metric__k {
    font-size: 12px;
    color: var(--muted);
    font-weight: 700;
  }
  .metric__v {
    font-size: 24px;
    font-weight: 800;
    color: var(--ink);
    margin-top: 3px;
  }
  .metric__v.sm {
    font-size: 20px;
  }
  .unit {
    font-size: 14px;
    color: var(--muted);
    font-weight: 700;
  }
  .metric__d {
    font-size: 12px;
    font-weight: 700;
  }
  .metric__d.up {
    color: var(--green);
  }
  .metric__d.purple {
    color: var(--purple);
  }

  .trend {
    padding: 18px 18px 12px;
    margin-bottom: 16px;
  }
  .trend__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .trend__title {
    font-size: 14px;
    font-weight: 800;
    color: var(--ink);
  }
  .trend__tabs {
    display: flex;
    gap: 6px;
  }
  .ttab {
    border: none;
    background: var(--bg);
    color: var(--muted);
    font-size: 12px;
    font-weight: 800;
    padding: 5px 12px;
    border-radius: var(--r-pill);
  }
  .ttab[data-active='true'] {
    background: var(--peach-bg);
    color: var(--accent-deep);
  }

  .visit {
    background: var(--green-bg);
    border-radius: var(--r-card);
    padding: 18px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .visit__icon {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: var(--green);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    flex: none;
  }
  .visit__eyebrow {
    font-size: 12px;
    color: var(--green-ink);
    font-weight: 800;
  }
  .visit__title {
    font-size: 15px;
    font-weight: 800;
    color: #3d4a38;
    margin-top: 2px;
  }
  .visit__when {
    font-size: 13px;
    color: var(--green-ink);
    font-weight: 600;
  }
</style>
