<script lang="ts">
  import type { Child } from '../lib/data'
  import {
    loadWellbeing,
    loadMeasurements,
    getCached,
    setCached,
    MOOD_EMOJI,
    MOOD_RU,
    type WellbeingItem,
    type MeasurementItem,
  } from '../lib/data'
  import { sparkline } from '../lib/sparkline'
  import { ageLabel, dayLabel, kg, timeHM } from '../lib/format'

  let { child }: { child: Child } = $props()

  let posts = $state<WellbeingItem[]>([])
  let measures = $state<MeasurementItem[]>([])
  let loading = $state(true)

  let chartMode = $state<'weight' | 'height'>('weight')

  $effect(() => {
    const id = child.id
    const hit = getCached<{ posts: WellbeingItem[]; measures: MeasurementItem[] }>(`info:${id}`)
    if (hit) {
      posts = hit.posts
      measures = hit.measures
      loading = false
    } else {
      loading = true
    }
    Promise.all([loadWellbeing(id, 3), loadMeasurements(id, 12)])
      .then(([w, m]) => {
        posts = w
        measures = m
        setCached(`info:${id}`, { posts: w, measures: m })
      })
      .catch((e) => console.error('info load', e))
      .finally(() => (loading = false))
  })

  const latestWeight = $derived(measures.find((m) => m.weight_g != null)?.weight_g ?? null)

  const series = $derived.by(() => {
    const vals =
      chartMode === 'weight'
        ? measures.filter((m) => m.weight_g != null).map((m) => m.weight_g as number)
        : measures.filter((m) => m.height_cm != null).map((m) => Number(m.height_cm))
    return vals.slice().reverse()
  })
  const heightAvailable = $derived(
    measures.filter((m) => m.height_cm != null).length >= 2,
  )
</script>

<!-- header (design 1c) -->
<header class="ghead">
  <div class="ghead__avatar"></div>
  <div>
    <div class="ghead__name">{child.name}</div>
    <div class="ghead__sub">
      {ageLabel(child.birth_date)}{latestWeight ? ` · ${kg(latestWeight)} кг` : ''}
    </div>
  </div>
</header>

{#if child.bio}
  <p class="bio">{child.bio}</p>
{/if}

<!-- latest wellbeing post as a serif quote card -->
{#if posts.length > 0}
  {@const p = posts[0]}
  <section class="quote card">
    <div class="quote__mood">
      {p.mood ? MOOD_EMOJI[p.mood] : '💬'}
      <span>{p.mood ? MOOD_RU[p.mood] : ''}</span>
    </div>
    {#if p.comment}
      <div class="quote__text">«{p.comment}»</div>
    {/if}
    <div class="quote__when">{dayLabel(p.posted_at)} · {timeHM(p.posted_at)}</div>
  </section>
{/if}

<!-- growth chart -->
{#if sparkline(series)}
  {@const sp = sparkline(series)!}
  <section class="card trend">
    <div class="trend__head">
      <span class="trend__title">Тренд {chartMode === 'weight' ? 'веса' : 'роста'}</span>
      {#if heightAvailable}
        <span class="trend__tabs">
          <button class="ttab" data-active={chartMode === 'weight'} onclick={() => (chartMode = 'weight')}>Вес</button>
          <button class="ttab" data-active={chartMode === 'height'} onclick={() => (chartMode = 'height')}>Рост</button>
        </span>
      {/if}
    </div>
    <svg viewBox="0 0 300 90" style="width:100%; height:90px">
      <defs>
        <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#E08A5B" stop-opacity=".28" />
          <stop offset="1" stop-color="#E08A5B" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path d={sp.area} fill="url(#ig)" />
      <polyline points={sp.line} fill="none" stroke="#E08A5B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={sp.last[0]} cy={sp.last[1]} r="5" fill="#E08A5B" stroke="#fff" stroke-width="2.5" />
    </svg>
  </section>
{/if}

<!-- earlier posts -->
{#if posts.length > 1}
  <div class="eyebrow">Раньше</div>
  <div class="plist">
    {#each posts.slice(1) as p (p.id)}
      <div class="prow card">
        <span class="prow__emoji">{p.mood ? MOOD_EMOJI[p.mood] : '💬'}</span>
        <div class="prow__body">
          {#if p.comment}<div class="prow__text">{p.comment}</div>{/if}
          <div class="prow__when">{dayLabel(p.posted_at)}</div>
        </div>
      </div>
    {/each}
  </div>
{/if}

{#if loading && posts.length === 0 && measures.length === 0}
  <div class="empty">Загрузка…</div>
{:else if posts.length === 0 && measures.length === 0}
  <div class="empty">Родители ещё ничего не опубликовали 🌱</div>
{/if}

<p class="foot">Сделано с любовью для семьи 🌸</p>

<style>
  .ghead {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 6px 0 16px;
  }
  .ghead__avatar {
    width: 56px;
    height: 56px;
    border-radius: 20px;
    border: 2px solid #fff;
    box-shadow: 0 3px 8px rgba(90, 64, 40, 0.15);
    background: repeating-linear-gradient(45deg, #f0e6d8, #f0e6d8 7px, #f7efe3 7px, #f7efe3 14px);
  }
  .ghead__name {
    font-family: var(--font-serif);
    font-size: 24px;
    font-weight: 600;
    color: var(--ink);
  }
  .ghead__sub {
    font-size: 13px;
    color: var(--muted);
    font-weight: 700;
  }
  .bio {
    font-size: 14px;
    color: var(--ink-soft);
    font-weight: 600;
    margin-bottom: 16px;
  }

  .quote {
    margin-bottom: 16px;
  }
  .quote__mood {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 800;
    color: var(--ink-soft);
    margin-bottom: 8px;
  }
  .quote__text {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 16px;
    color: var(--ink);
    line-height: 1.5;
  }
  .quote__when {
    font-size: 12px;
    color: var(--muted);
    font-weight: 700;
    margin-top: 10px;
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

  .plist {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .prow {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
  }
  .prow__emoji {
    font-size: 22px;
    flex: none;
  }
  .prow__body {
    min-width: 0;
  }
  .prow__text {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }
  .prow__when {
    font-size: 12px;
    color: var(--muted);
    font-weight: 700;
    margin-top: 2px;
  }
  .foot {
    text-align: center;
    color: var(--muted-2);
    font-size: 12px;
    font-weight: 600;
    margin-top: 24px;
  }
</style>
