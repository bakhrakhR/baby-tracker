<script lang="ts">
  import type { Child, FeedItem } from '../lib/data'
  import { loadFeedingsToday } from '../lib/data'
  import { session } from '../lib/session'
  import { hapticImpact, hapticSelection } from '../lib/telegram'
  import { timeHM } from '../lib/format'
  import EditFeedingSheet from '../lib/EditFeedingSheet.svelte'

  let {
    child,
    refreshKey,
    onLogFeeding,
    onChanged,
  }: {
    child: Child
    refreshKey: number
    onLogFeeding: () => void
    onChanged: () => void
  } = $props()

  let items = $state<FeedItem[]>([])
  let loading = $state(true)
  let editing = $state<FeedItem | null>(null)

  const canEdit = $derived(
    $session.member?.role === 'admin' || $session.member?.role === 'editor',
  )

  $effect(() => {
    refreshKey
    const id = child.id
    loading = true
    loadFeedingsToday(id)
      .then((r) => (items = r))
      .catch((e) => console.error('loadFeedingsToday', e))
      .finally(() => (loading = false))
  })

  const tap = () => {
    hapticImpact('medium')
    onLogFeeding()
  }

  function openEdit(f: FeedItem) {
    if (!canEdit) return
    hapticSelection()
    editing = f
  }
</script>

<h1 class="section-title">Кормление</h1>

<div class="log-actions">
  <button class="log log--breast" onclick={tap}>
    <span class="log__emoji">🤱</span>Грудь
  </button>
  <button class="log log--bottle" onclick={tap}>
    <span class="log__emoji">🍼</span>Бутылочка
  </button>
</div>

<div class="eyebrow">Сегодня</div>

{#if loading && items.length === 0}
  <div class="empty">Загрузка…</div>
{:else if items.length === 0}
  <div class="empty">Сегодня ещё нет записей.<br />Нажмите «Грудь» или «Бутылочка».</div>
{:else}
  <div class="list">
    {#each items as f (f.id)}
      <button class="row" onclick={() => openEdit(f)} disabled={!canEdit}>
        <div class="row__icon" style="background:{f.iconBg}; color:{f.iconColor}">{f.icon}</div>
        <div class="row__body">
          <div class="row__top">
            <span class="row__title">{f.title}</span>
            <span class="row__time">{timeHM(f.fed_at)}</span>
          </div>
          {#if f.detail || f.notes}
            <div class="row__detail">
              {f.detail}{f.notes ? `${f.detail ? ' · ' : ''}${f.notes}` : ''}
            </div>
          {/if}
        </div>
        {#if canEdit}<span class="row__chev">›</span>{/if}
      </button>
    {/each}
  </div>
  {#if canEdit}
    <p class="list-hint">Нажмите на запись, чтобы изменить или удалить</p>
  {/if}
{/if}

{#if editing}
  <EditFeedingSheet
    item={editing}
    onClose={() => (editing = null)}
    onSaved={() => onChanged()}
    onDeleted={() => onChanged()}
  />
{/if}

<style>
  .log-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 22px;
  }
  .log {
    border: none;
    border-radius: var(--r-card);
    padding: 22px 12px;
    font-size: 17px;
    font-weight: 800;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    box-shadow: var(--sh-card);
    transition: transform 0.06s ease;
  }
  .log:active {
    transform: scale(0.97);
  }
  .log__emoji {
    font-size: 30px;
  }
  .log--breast {
    background: linear-gradient(135deg, var(--green), #a3bd9d);
  }
  .log--bottle {
    background: linear-gradient(135deg, var(--accent), var(--accent-2));
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 11px;
  }
  .row {
    width: 100%;
    text-align: left;
    border: none;
    background: var(--surface);
    border-radius: 18px;
    padding: 14px 16px;
    box-shadow: var(--sh-card);
    display: flex;
    align-items: center;
    gap: 14px;
    transition: transform 0.06s ease;
  }
  .row:not(:disabled):active {
    transform: scale(0.985);
  }
  .row:disabled {
    cursor: default;
  }
  .row__icon {
    width: 44px;
    height: 44px;
    border-radius: 13px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
  }
  .row__body {
    flex: 1;
    min-width: 0;
  }
  .row__top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .row__title {
    font-size: 15px;
    font-weight: 800;
    color: var(--ink);
  }
  .row__time {
    font-size: 14px;
    font-weight: 800;
    color: var(--muted);
  }
  .row__detail {
    font-size: 13px;
    color: var(--muted);
    font-weight: 600;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .row__chev {
    color: var(--muted-2);
    font-size: 22px;
    font-weight: 700;
    flex: none;
  }
  .list-hint {
    text-align: center;
    color: var(--muted-2);
    font-size: 12px;
    font-weight: 600;
    margin-top: 14px;
  }
</style>
