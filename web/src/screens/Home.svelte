<script lang="ts">
  import type { Child } from '../lib/data'
  import { loadHome, type HomeData } from '../lib/data'
  import { session } from '../lib/session'
  import { hapticImpact } from '../lib/telegram'
  import { ageLabel, kg, timeHM, relativeMinutes, dateTimeLabel, agoLabel, durationLabel } from '../lib/format'

  let {
    child,
    refreshKey,
    onLogFeeding,
    onOpenDiapers,
    onOpenMeasure,
    onOpenMood,
    onToggleSleep,
    openSleepOut = $bindable(null),
  }: {
    child: Child
    refreshKey: number
    onLogFeeding: () => void
    onOpenDiapers: () => void
    onOpenMeasure: () => void
    onOpenMood: () => void
    onToggleSleep: (open: { id: string; started_at: string } | null) => void
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

  const roleLabel: Record<string, string> = {
    admin: 'Админ',
    editor: 'Родитель',
    guest: 'Гость',
  }

  $effect(() => {
    // re-run when the child or refreshKey changes
    refreshKey
    const id = child.id
    loading = true
    loadHome(id)
      .then((d) => {
        data = d
        openSleepOut = d.openSleep
      })
      .catch((e) => console.error('loadHome', e))
      .finally(() => (loading = false))
  })

  // Build an SVG sparkline path from a numeric series.
  function sparkline(series: number[], w = 300, h = 90): { line: string; area: string; last: [number, number] } | null {
    if (series.length < 2) return null
    const min = Math.min(...series)
    const max = Math.max(...series)
    const span = max - min || 1
    const step = w / (series.length - 1)
    const pts = series.map((v, i) => [
      Math.round(i * step),
      Math.round(h - 6 - ((v - min) / span) * (h - 16)),
    ]) as [number, number][]
    const line = pts.map((p) => p.join(',')).join(' ')
    const area = `M${pts[0][0]},${pts[0][1]} L${line.replace(/ /g, ' L')} L${w},${h} L0,${h} Z`
    return { line, area, last: pts[pts.length - 1] }
  }

  const tap = () => {
    hapticImpact('medium')
    onLogFeeding()
  }
</script>

<!-- header -->
<header class="head">
  <div class="head__id">
    <div class="avatar"></div>
    <div>
      <div class="name">{child.name}</div>
      <div class="sub">{ageLabel(child.birth_date)}</div>
    </div>
  </div>
  <div class="pill role">● {roleLabel[$session.member?.role ?? 'guest']}</div>
</header>

<!-- feeding hero: the scheduled next feed when reminders are on, otherwise
     "how long since the last one" — the number that matters at 4 a.m. -->
<section class="hero">
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

  <!-- sleep: a live toggle — the second most frequent action -->
  <button
    class="metric metric--tap"
    class:sleeping={data?.openSleep}
    onclick={() => data && onToggleSleep(data.openSleep)}
    disabled={!canEdit || !data}
  >
    {#if data?.openSleep}
      <div class="metric__k">😴 Спит</div>
      <div class="metric__v sm">{sleepingFor}</div>
      <div class="metric__d purple">Проснулась →</div>
    {:else}
      <div class="metric__k">🌙 Сон</div>
      <div class="metric__v">{data?.sleepHours ?? '—'} <span class="unit">ч</span></div>
      <div class="metric__d purple">{canEdit ? 'Уснула →' : 'за сутки'}</div>
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
  }
  .avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 3px 8px rgba(90, 64, 40, 0.15);
    background: repeating-linear-gradient(45deg, #f0e6d8, #f0e6d8 7px, #f7efe3 7px, #f7efe3 14px);
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

  .hero {
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
    border-radius: var(--r-hero);
    padding: 22px 22px 20px;
    color: #fff;
    box-shadow: var(--sh-hero);
    margin-bottom: 16px;
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
