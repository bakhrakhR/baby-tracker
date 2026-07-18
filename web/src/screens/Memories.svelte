<script lang="ts">
  import type { Child } from '../lib/data'
  import {
    loadMemories,
    loadMembers,
    getCached,
    setCached,
    type MemoryItem,
    type MemberRow,
  } from '../lib/data'
  import { session } from '../lib/session'
  import { hapticSelection, hapticImpact } from '../lib/telegram'
  import { dayLabel } from '../lib/format'
  import MediaThumb from '../lib/MediaThumb.svelte'
  import MemorySheet from '../lib/MemorySheet.svelte'

  let { child, refreshKey }: { child: Child; refreshKey: number } = $props()

  let items = $state<MemoryItem[]>([])
  let names = $state<Map<number, string>>(new Map())
  let loading = $state(true)
  let localBump = $state(0)
  let sheet = $state<'new' | MemoryItem | null>(null)

  const canEdit = $derived(
    $session.member?.role === 'admin' || $session.member?.role === 'editor',
  )

  $effect(() => {
    refreshKey
    localBump
    const id = child.id
    const hit = getCached<MemoryItem[]>(`memories:${id}`)
    if (hit) {
      items = hit
      loading = false
    } else {
      loading = true
    }
    loadMemories(id)
      .then((r) => {
        items = r
        setCached(`memories:${id}`, r)
      })
      .catch((e) => console.error('loadMemories', e))
      .finally(() => (loading = false))
    loadMembers()
      .then((m: MemberRow[]) => (names = new Map(m.map((x) => [x.telegram_id, x.display_name]))))
      .catch(() => {})
  })

  function author(m: MemoryItem): string {
    const who = m.created_by ? names.get(m.created_by) : null
    return who ? ` · ${who.toLowerCase()}` : ''
  }

  function openEdit(m: MemoryItem) {
    if (!canEdit) return
    hapticSelection()
    sheet = m
  }
</script>

<h1 class="section-title" style="margin-bottom:6px">На память</h1>
<p class="subnote">Видно бабушкам и гостям 🌸</p>

{#if canEdit}
  <button
    class="btn"
    style="margin-bottom:18px"
    onclick={() => {
      hapticImpact('light')
      sheet = 'new'
    }}
  >
    ＋ Добавить момент
  </button>
{/if}

{#if loading && items.length === 0}
  <div class="empty">Загрузка…</div>
{:else if items.length === 0}
  <div class="empty">Пока нет моментов.<br />Добавьте первое фото или историю 🌸</div>
{:else}
  <div class="feed">
    {#each items as m (m.id)}
      <button class="mem card" onclick={() => openEdit(m)} disabled={!canEdit}>
        {#if m.media_paths.length === 1}
          <MediaThumb path={m.media_paths[0]} alt={m.title ?? ''} />
        {:else if m.media_paths.length > 1}
          <div class="mem__grid">
            {#each m.media_paths.slice(0, 4) as p (p)}
              <MediaThumb path={p} alt={m.title ?? ''} />
            {/each}
          </div>
        {/if}
        {#if m.title}<div class="mem__title">{m.title}</div>{/if}
        {#if m.story}<div class="mem__story">«{m.story}»</div>{/if}
        <div class="mem__when">{dayLabel(m.happened_at)}{author(m)}</div>
      </button>
    {/each}
  </div>
{/if}

{#if sheet !== null}
  <MemorySheet
    childId={child.id}
    memory={sheet === 'new' ? null : sheet}
    onClose={() => (sheet = null)}
    onChanged={() => {
      sheet = null
      localBump += 1
    }}
  />
{/if}

<style>
  .subnote {
    font-size: 13px;
    color: var(--muted);
    font-weight: 600;
    margin-bottom: 16px;
  }
  .feed {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .mem {
    border: none;
    text-align: left;
    font-family: inherit;
    padding: 10px;
    display: block;
    width: 100%;
    transition: transform 0.06s ease;
  }
  .mem:not(:disabled):active {
    transform: scale(0.99);
  }
  .mem:disabled {
    cursor: default;
  }
  .mem__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .mem__title {
    font-size: 15px;
    font-weight: 800;
    color: var(--ink);
    padding: 10px 8px 0;
  }
  .mem__story {
    font-family: var(--font-serif);
    font-style: italic;
    font-size: 15px;
    color: var(--ink);
    line-height: 1.5;
    padding: 8px 8px 0;
  }
  .mem__when {
    font-size: 12px;
    color: var(--muted);
    font-weight: 700;
    padding: 8px 8px 4px;
  }
</style>
