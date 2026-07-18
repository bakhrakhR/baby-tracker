<script lang="ts">
  import type { Child } from '../lib/data'
  import {
    loadLabs,
    loadDocs,
    getCached,
    setCached,
    DOC_CATEGORY_RU,
    type LabResult,
    type DocumentItem,
  } from '../lib/data'
  import { session } from '../lib/session'
  import { hapticSelection, hapticImpact } from '../lib/telegram'
  import { dayLabel } from '../lib/format'
  import FileSheet from '../lib/FileSheet.svelte'

  let { child, refreshKey }: { child: Child; refreshKey: number } = $props()

  let labs = $state<LabResult[]>([])
  let docs = $state<DocumentItem[]>([])
  let loading = $state(true)
  let localBump = $state(0)
  // sheet: 'new' opens the kind chooser; an item opens its edit form
  let sheet = $state<'new' | { kind: 'lab'; item: LabResult } | { kind: 'doc'; item: DocumentItem } | null>(null)

  const canEdit = $derived(
    $session.member?.role === 'admin' || $session.member?.role === 'editor',
  )

  $effect(() => {
    refreshKey
    localBump
    const id = child.id
    const hit = getCached<{ labs: LabResult[]; docs: DocumentItem[] }>(`files:${id}`)
    if (hit) {
      labs = hit.labs
      docs = hit.docs
      loading = false
    } else {
      loading = true
    }
    Promise.all([loadLabs(id), loadDocs(id)])
      .then(([l, d]) => {
        labs = l
        docs = d
        setCached(`files:${id}`, { labs: l, docs: d })
      })
      .catch((e) => console.error('loadFiles', e))
      .finally(() => (loading = false))
  })

  function filesLabel(n: number): string {
    const m10 = n % 10
    const m100 = n % 100
    const word =
      m10 === 1 && m100 !== 11
        ? 'файл'
        : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)
          ? 'файла'
          : 'файлов'
    return `${n} ${word}`
  }

  function openLab(item: LabResult) {
    if (!canEdit) return
    hapticSelection()
    sheet = { kind: 'lab', item }
  }
  function openDoc(item: DocumentItem) {
    if (!canEdit) return
    hapticSelection()
    sheet = { kind: 'doc', item }
  }
</script>

<h1 class="section-title">Анализы и документы</h1>

{#if loading && labs.length === 0 && docs.length === 0}
  <div class="empty">Загрузка…</div>
{:else}
  <div class="eyebrow">Результаты анализов</div>
  {#if labs.length === 0}
    <div class="empty">Анализов пока нет.</div>
  {:else}
    <div class="rows">
      {#each labs as l (l.id)}
        <button class="frow card" onclick={() => openLab(l)} disabled={!canEdit}>
          <span class="frow__icon" style="background:var(--rose-bg); color:var(--rose-ink)">📄</span>
          <span class="frow__body">
            <span class="frow__title">{l.title}</span>
            <span class="frow__sub">{dayLabel(l.taken_at)} · {filesLabel(l.file_paths.length)}{l.notes ? ` · ${l.notes}` : ''}</span>
          </span>
        </button>
      {/each}
    </div>
  {/if}

  <div class="eyebrow" style="margin-top:20px">Документы</div>
  {#if docs.length === 0}
    <div class="empty">Документов пока нет.</div>
  {:else}
    <div class="rows">
      {#each docs as d (d.id)}
        <button class="frow card" onclick={() => openDoc(d)} disabled={!canEdit}>
          <span class="frow__icon" style="background:var(--yellow-bg); color:var(--yellow-ink)">📁</span>
          <span class="frow__body">
            <span class="frow__title">{d.title}</span>
            <span class="frow__sub">{DOC_CATEGORY_RU[d.category]} · {filesLabel(d.file_paths.length)}</span>
          </span>
        </button>
      {/each}
    </div>
  {/if}

  {#if canEdit}
    <button
      class="upload"
      onclick={() => {
        hapticImpact('light')
        sheet = 'new'
      }}
    >
      ＋ Загрузить файл или скан
    </button>
  {/if}
{/if}

{#if sheet !== null}
  <FileSheet
    childId={child.id}
    preset={sheet === 'new' ? null : sheet}
    onClose={() => (sheet = null)}
    onChanged={() => {
      sheet = null
      localBump += 1
    }}
  />
{/if}

<style>
  .rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .frow {
    display: flex;
    align-items: center;
    gap: 13px;
    border: none;
    text-align: left;
    padding: 13px 15px;
    border-radius: 16px;
  }
  .frow:disabled {
    cursor: default;
  }
  .frow__icon {
    width: 40px;
    height: 40px;
    border-radius: 11px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }
  .frow__body {
    min-width: 0;
    display: block;
  }
  .frow__title {
    display: block;
    font-size: 14px;
    font-weight: 800;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .frow__sub {
    display: block;
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .upload {
    width: 100%;
    margin-top: 18px;
    background: var(--peach-bg);
    color: var(--accent-deep);
    border: 2px dashed #e8b79c;
    font-family: inherit;
    font-weight: 800;
    font-size: 14px;
    padding: 16px;
    border-radius: var(--r-btn);
    transition: transform 0.06s ease;
  }
  .upload:active {
    transform: scale(0.98);
  }
</style>
