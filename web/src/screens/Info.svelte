<script lang="ts">
  import type { Child } from '../lib/data'
  import {
    loadWellbeing,
    loadMeasurements,
    loadMemories,
    getCached,
    setCached,
    MOOD_EMOJI,
    MOOD_RU,
    type WellbeingItem,
    type MeasurementItem,
    type MemoryItem,
  } from '../lib/data'
  import { sparkline } from '../lib/sparkline'
  import { ageLabel, dayLabel, kg, timeHM } from '../lib/format'
  import MediaThumb from '../lib/MediaThumb.svelte'
  import ChildAvatar from '../lib/ChildAvatar.svelte'
  import ChildSheet from '../lib/ChildSheet.svelte'

  let { child }: { child: Child } = $props()

  let cardOpen = $state(false)

  let posts = $state<WellbeingItem[]>([])
  let measures = $state<MeasurementItem[]>([])
  let memories = $state<MemoryItem[]>([])
  let loading = $state(true)

  let chartMode = $state<'weight' | 'height'>('weight')

  interface InfoCache {
    posts: WellbeingItem[]
    measures: MeasurementItem[]
    memories: MemoryItem[]
  }

  $effect(() => {
    const id = child.id
    const hit = getCached<InfoCache>(`info:${id}`)
    if (hit) {
      posts = hit.posts
      measures = hit.measures
      memories = hit.memories
      loading = false
    } else {
      loading = true
    }
    Promise.all([loadWellbeing(id, 3), loadMeasurements(id, 12), loadMemories(id, 6)])
      .then(([w, m, mem]) => {
        posts = w
        measures = m
        memories = mem
        setCached(`info:${id}`, { posts: w, measures: m, memories: mem })
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

<!-- header (design 1c); tap opens the read-only card -->
<header class="ghead">
  <button class="ghead__btn" onclick={() => (cardOpen = true)}>
    <ChildAvatar path={child.photo_path} size={56} radius="20px" />
    <div>
      <div class="ghead__name">{child.name}</div>
      <div class="ghead__sub">
        {ageLabel(child.birth_date)}{latestWeight ? ` · ${kg(latestWeight)} кг` : ''}
      </div>
    </div>
  </button>
</header>

{#if cardOpen}
  <ChildSheet {child} canEdit={false} onClose={() => (cardOpen = false)} onSaved={() => {}} />
{/if}

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

<!-- memories feed -->
{#if memories.length > 0}
  <div class="eyebrow">🌸 Моменты</div>
  <div class="mems">
    {#each memories as m (m.id)}
      <div class="memcard card">
        {#if m.media_paths.length === 1}
          <MediaThumb path={m.media_paths[0]} alt={m.title ?? ''} />
        {:else if m.media_paths.length > 1}
          <div class="memcard__grid">
            {#each m.media_paths.slice(0, 4) as p (p)}
              <MediaThumb path={p} alt={m.title ?? ''} />
            {/each}
          </div>
        {/if}
        {#if m.story}
          <div class="memcard__story">«{m.story}»</div>
        {:else if m.title}
          <div class="memcard__story">{m.title}</div>
        {/if}
        <div class="memcard__when">{dayLabel(m.happened_at)}</div>
      </div>
    {/each}
  </div>
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
    margin: 6px 0 16px;
  }
  .ghead__btn {
    display: flex;
    align-items: center;
    gap: 14px;
    border: none;
    background: none;
    padding: 0;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
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

  .mems {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 16px;
  }
  .memcard {
    padding: 10px;
  }
  .memcard__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .memcard__story {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 15px;
    color: var(--ink);
    line-height: 1.5;
    padding: 8px 8px 0;
  }
  .memcard__when {
    font-size: 12px;
    color: var(--muted);
    font-weight: 700;
    padding: 6px 8px 4px;
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
