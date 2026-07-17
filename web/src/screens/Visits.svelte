<script lang="ts">
  import type { Child } from '../lib/data'
  import {
    loadVisits,
    updateVisit,
    type VisitItem,
    type VisitsSplit,
  } from '../lib/data'
  import { session } from '../lib/session'
  import { hapticSelection, hapticImpact } from '../lib/telegram'
  import { dateTimeLabel } from '../lib/format'
  import VisitSheet from '../lib/VisitSheet.svelte'

  let { child, refreshKey }: { child: Child; refreshKey: number } = $props()

  let visits = $state<VisitsSplit>({ upcoming: [], past: [] })
  let loading = $state(true)
  let localBump = $state(0)
  let sheet = $state<'new' | VisitItem | null>(null)

  const canEdit = $derived(
    $session.member?.role === 'admin' || $session.member?.role === 'editor',
  )

  $effect(() => {
    refreshKey
    localBump
    const id = child.id
    loading = true
    loadVisits(id)
      .then((r) => (visits = r))
      .catch((e) => console.error('loadVisits', e))
      .finally(() => (loading = false))
  })

  // Toggle a checklist item right on the card — the frequent action.
  async function toggleCheck(v: VisitItem, index: number) {
    if (!canEdit) return
    hapticSelection()
    const list = v.prep_checklist.map((c, i) =>
      i === index ? { ...c, done: !c.done } : c,
    )
    v.prep_checklist = list // optimistic
    try {
      await updateVisit(v.id, { prep_checklist: list })
    } catch (e) {
      console.error('toggleCheck', e)
      localBump += 1 // reload to revert
    }
  }

  function openNew() {
    hapticImpact('light')
    sheet = 'new'
  }

  function openEdit(v: VisitItem) {
    if (!canEdit) return
    hapticSelection()
    sheet = v
  }

  const STATUS_LABEL: Record<string, string> = {
    done: 'прошёл',
    cancelled: 'отменён',
    planned: 'пропущен?',
  }
</script>

<h1 class="section-title">Визиты к врачам</h1>

{#if canEdit}
  <button class="btn" style="margin-bottom:18px" onclick={openNew}>
    ＋ Записать визит
  </button>
{/if}

{#if loading && visits.upcoming.length === 0 && visits.past.length === 0}
  <div class="empty">Загрузка…</div>
{:else if visits.upcoming.length === 0 && visits.past.length === 0}
  <div class="empty">Визитов пока нет.</div>
{/if}

{#each visits.upcoming as v (v.id)}
  <article class="visit card">
    <div class="visit__head">
      <button class="visit__title" onclick={() => openEdit(v)} disabled={!canEdit}>
        {v.title}
      </button>
    </div>
    <div class="visit__when">
      {dateTimeLabel(v.visit_at)}{v.location ? ` · ${v.location}` : ''}
      {#if v.doctor_name}<span class="visit__doc"> · {v.doctor_name}</span>{/if}
    </div>

    {#if v.prep_checklist.length > 0}
      <div class="prep">
        <div class="prep__label">Подготовить</div>
        {#each v.prep_checklist as item, i (i)}
          <button class="check" onclick={() => toggleCheck(v, i)} disabled={!canEdit}>
            <span class="check__box" data-done={item.done}>{item.done ? '✓' : ''}</span>
            <span class="check__text" data-done={item.done}>{item.text}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if v.notes}
      <div class="visit__notes">{v.notes}</div>
    {/if}
  </article>
{/each}

{#if visits.past.length > 0}
  <details class="pastblock" ontoggle={() => hapticSelection()}>
    <summary class="pastblock__sum">
      <span>Прошедшие · {visits.past.length}</span>
      <span class="pastblock__chev">›</span>
    </summary>
    <div class="pastlist">
      {#each visits.past as v (v.id)}
        <button class="past card" onclick={() => openEdit(v)} disabled={!canEdit}>
          <div class="past__row">
            <span class="past__title">{v.title}</span>
            <span class="past__status" data-status={v.status}>{STATUS_LABEL[v.status]}</span>
          </div>
          <div class="visit__when">{dateTimeLabel(v.visit_at)}</div>
          {#if v.notes}<div class="visit__notes">{v.notes}</div>{/if}
        </button>
      {/each}
    </div>
  </details>
{/if}

{#if sheet !== null}
  <VisitSheet
    childId={child.id}
    visit={sheet === 'new' ? null : sheet}
    onClose={() => (sheet = null)}
    onChanged={() => {
      sheet = null
      localBump += 1
    }}
  />
{/if}

<style>
  .visit {
    border-left: 5px solid var(--green);
    margin-bottom: 14px;
  }
  .visit__head {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .visit__title {
    border: none;
    background: none;
    padding: 0;
    text-align: left;
    font-family: inherit;
    font-size: 16px;
    font-weight: 800;
    color: var(--ink);
  }
  .visit__title:disabled {
    cursor: default;
  }
  .visit__when {
    font-size: 13px;
    color: var(--muted);
    font-weight: 700;
    margin-top: 3px;
  }
  .visit__doc {
    color: var(--muted);
  }
  .visit__notes {
    font-size: 13px;
    color: var(--ink-soft);
    font-weight: 600;
    margin-top: 10px;
  }

  .prep {
    margin-top: 12px;
    background: #f8f2e8;
    border-radius: 14px;
    padding: 12px 14px;
  }
  .prep__label {
    font-size: 12px;
    font-weight: 800;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
  .check {
    display: flex;
    gap: 9px;
    align-items: center;
    border: none;
    background: none;
    padding: 4px 0;
    width: 100%;
    text-align: left;
    font-family: inherit;
  }
  .check:disabled {
    cursor: default;
  }
  .check__box {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    border: 2px solid #d8cdbd;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 800;
    flex: none;
  }
  .check__box[data-done='true'] {
    background: var(--green);
    border-color: var(--green);
  }
  .check__text {
    font-size: 13px;
    color: var(--ink-soft);
    font-weight: 600;
  }
  .check__text[data-done='true'] {
    color: var(--muted-2);
    text-decoration: line-through;
  }

  .pastblock {
    background: var(--surface);
    border-radius: var(--r-card);
    box-shadow: var(--sh-card);
    overflow: hidden;
    margin-top: 4px;
  }
  .pastblock__sum {
    list-style: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 15px 16px;
    font-size: 15px;
    font-weight: 800;
    color: var(--ink);
  }
  .pastblock__sum::-webkit-details-marker {
    display: none;
  }
  .pastblock__chev {
    color: var(--muted-2);
    font-size: 22px;
    transition: transform 0.18s ease;
  }
  .pastblock[open] .pastblock__chev {
    transform: rotate(90deg);
  }
  .pastlist {
    padding: 0 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .past {
    text-align: left;
    border: 1px solid var(--hair);
    box-shadow: none;
    background: var(--bg);
    opacity: 0.9;
    padding: 14px 15px;
  }
  .past:disabled {
    cursor: default;
  }
  .past__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .past__title {
    font-size: 15px;
    font-weight: 800;
    color: var(--ink);
  }
  .past__status {
    font-size: 11px;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: var(--r-pill);
    background: var(--green-bg);
    color: var(--green-ink);
    flex: none;
  }
  .past__status[data-status='cancelled'] {
    background: var(--rose-bg);
    color: var(--rose-ink);
  }
  .past__status[data-status='planned'] {
    background: var(--yellow-bg);
    color: var(--yellow-ink);
  }
</style>
