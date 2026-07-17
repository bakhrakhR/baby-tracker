<script lang="ts">
  import type { Child } from '../lib/data'
  import { loadHome, type HomeData } from '../lib/data'
  import { session } from '../lib/session'
  import { hapticImpact } from '../lib/telegram'
  import { ageLabel, kg, timeHM, relativeMinutes, dateTimeLabel } from '../lib/format'

  let {
    child,
    refreshKey,
    onLogFeeding,
  }: { child: Child; refreshKey: number; onLogFeeding: () => void } = $props()

  let data = $state<HomeData | null>(null)
  let loading = $state(true)

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
      .then((d) => (data = d))
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

<!-- next feeding hero -->
<section class="hero">
  <div class="hero__row">🍼 {data?.nextFeeding ? 'Следующее кормление' : 'Кормление'}</div>
  {#if data?.nextFeeding}
    <div class="hero__time">
      <span class="hero__hm">{timeHM(data.nextFeeding.at)}</span>
      <span class="hero__rel">{relativeMinutes(data.nextFeeding.at)}</span>
    </div>
    <div class="hero__detail">{data.nextFeeding.detail}</div>
  {:else}
    <div class="hero__detail" style="margin-top:6px">Запишите кормление в одно касание</div>
  {/if}
  <button class="btn btn--ghost" style="margin-top:16px" onclick={tap}>Покормили</button>
</section>

<!-- metric chips -->
<section class="chips">
  <div class="metric">
    <div class="metric__k">📈 Вес</div>
    <div class="metric__v">
      {data?.weightG ? kg(data.weightG) : '—'} <span class="unit">кг</span>
    </div>
    {#if data?.weightDeltaG}
      <div class="metric__d up">↑ +{data.weightDeltaG} г</div>
    {/if}
  </div>
  <div class="metric">
    <div class="metric__k">🌙 Сон</div>
    <div class="metric__v">{data?.sleepHours ?? '—'} <span class="unit">ч</span></div>
    <div class="metric__d purple">за сутки</div>
  </div>
  <div class="metric">
    <div class="metric__k">😊 Настроение</div>
    <div class="metric__v sm">{data?.moodLabel ?? '—'}</div>
  </div>
  <div class="metric">
    <div class="metric__k">💧 Подгузники</div>
    <div class="metric__v">{data?.diapersToday ?? 0} <span class="unit">за день</span></div>
  </div>
</section>

<!-- weight trend -->
{#if data && sparkline(data.weightSeries)}
  {@const sp = sparkline(data.weightSeries)!}
  <section class="card trend">
    <div class="trend__head">
      <span class="trend__title">Тренд веса</span>
      <span class="sub">{data.weightSeries.length} замеров</span>
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
