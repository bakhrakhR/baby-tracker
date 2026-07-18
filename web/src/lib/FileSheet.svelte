<script lang="ts">
  import { untrack } from 'svelte'
  import {
    addLab,
    updateLab,
    deleteLab,
    addDoc,
    updateDoc,
    deleteDoc,
    DOC_CATEGORY_RU,
    type LabResult,
    type DocumentItem,
    type DocCategory,
  } from './data'
  import { uploadFiles, openFile, removeFiles } from './storage'
  import { hapticSuccess, hapticError, hapticImpact } from './telegram'
  import { todayLocalISO } from './format'

  type Preset =
    | { kind: 'lab'; item: LabResult }
    | { kind: 'doc'; item: DocumentItem }
    | null

  let {
    childId,
    preset,
    onClose,
    onChanged,
  }: {
    childId: string
    preset: Preset // null = new record, kind chosen inside
    onClose: () => void
    onChanged: () => void
  } = $props()

  const init = untrack(() => ({
    kind: preset?.kind ?? null,
    item: preset?.item ?? null,
  }))

  let kind = $state<'lab' | 'doc' | null>(init.kind)
  let fTitle = $state(init.item?.title ?? '')
  let fDate = $state(
    init.kind === 'lab' && init.item
      ? (init.item as LabResult).taken_at
      : todayLocalISO(),
  )
  let fCategory = $state<DocCategory>(
    init.kind === 'doc' && init.item ? (init.item as DocumentItem).category : 'medical',
  )
  let fNotes = $state(init.item?.notes ?? '')
  let existing = $state<string[]>(init.item?.file_paths ?? [])
  let toRemove = $state<string[]>([])
  let newFiles = $state<File[]>([])
  let busy = $state(false)
  let progress = $state('')

  const categories: DocCategory[] = ['id', 'medical', 'insurance', 'other']
  const canSave = $derived(
    fTitle.trim().length > 0 &&
      kind !== null &&
      existing.length - toRemove.length + newFiles.length > 0,
  )

  function pickKind(k: 'lab' | 'doc') {
    hapticImpact('light')
    kind = k
  }

  function onFilesPicked(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files) newFiles = [...newFiles, ...input.files]
    input.value = ''
  }

  function fileName(path: string): string {
    return path.split('/').pop() ?? path
  }

  function markRemove(path: string) {
    toRemove = toRemove.includes(path)
      ? toRemove.filter((p) => p !== path)
      : [...toRemove, path]
  }

  async function open(path: string) {
    try {
      await openFile(path)
    } catch (e) {
      console.error('openFile', e)
      alert('Не удалось открыть файл')
    }
  }

  async function save() {
    if (!canSave || busy || !kind) return
    busy = true
    try {
      const uploaded = await uploadFiles(childId, newFiles, (done, total) => {
        progress = total > 0 ? `Загружаю ${Math.min(done + 1, total)}/${total}…` : ''
      })
      progress = 'Сохраняю…'
      const keep = existing.filter((p) => !toRemove.includes(p))
      const file_paths = [...keep, ...uploaded]
      const notes = fNotes.trim() || null

      if (kind === 'lab') {
        const fields = { title: fTitle.trim(), taken_at: fDate, file_paths, notes }
        if (init.item) await updateLab(init.item.id, fields)
        else await addLab(childId, fields)
      } else {
        const fields = { title: fTitle.trim(), category: fCategory, file_paths, notes }
        if (init.item) await updateDoc(init.item.id, fields)
        else await addDoc(childId, fields)
      }
      if (toRemove.length > 0) await removeFiles(toRemove)
      hapticSuccess()
      onChanged()
    } catch (e) {
      hapticError()
      busy = false
      progress = ''
      alert('Не удалось сохранить. Проверьте файлы (фото или PDF, до 10 МБ).')
      console.error(e)
    }
  }

  async function remove() {
    if (!init.item || busy || !kind) return
    if (!confirm('Удалить эту запись вместе с файлами?')) return
    busy = true
    try {
      if (kind === 'lab') await deleteLab(init.item.id)
      else await deleteDoc(init.item.id)
      await removeFiles(init.item.file_paths)
      hapticSuccess()
      onChanged()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось удалить запись')
      console.error(e)
    }
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

    {#if kind === null}
      <div class="sheet-title">Что загружаем?</div>
      <div class="choose">
        <button class="pickbtn pickbtn--lab" onclick={() => pickKind('lab')}>
          <span class="pickbtn__emoji">📄</span>Анализ
        </button>
        <button class="pickbtn pickbtn--doc" onclick={() => pickKind('doc')}>
          <span class="pickbtn__emoji">📁</span>Документ
        </button>
      </div>
    {:else}
      <div class="sheet-title">
        {kind === 'lab' ? '📄' : '📁'}
        {init.item ? 'Запись' : kind === 'lab' ? 'Новый анализ' : 'Новый документ'}
      </div>

      <div class="scrollable">
        <div class="field-label">Название</div>
        <input
          class="input"
          type="text"
          maxlength="120"
          placeholder={kind === 'lab' ? 'Общий анализ крови' : 'Свидетельство о рождении'}
          bind:value={fTitle}
        />

        {#if kind === 'lab'}
          <div class="field-label">Дата сдачи</div>
          <input class="input input--time" type="date" bind:value={fDate} />
        {:else}
          <div class="field-label">Категория</div>
          <div class="chips">
            {#each categories as c (c)}
              <button class="chip" data-active={fCategory === c} onclick={() => (fCategory = c)}>
                {DOC_CATEGORY_RU[c]}
              </button>
            {/each}
          </div>
        {/if}

        <div class="field-label">Файлы</div>
        {#if existing.length > 0}
          <div class="flist">
            {#each existing as p (p)}
              <div class="fitem" data-removed={toRemove.includes(p)}>
                <button class="fitem__open" onclick={() => open(p)} disabled={toRemove.includes(p)}>
                  📎 {fileName(p)}
                </button>
                <button class="fitem__x" onclick={() => markRemove(p)} aria-label="Удалить файл">
                  {toRemove.includes(p) ? '↩' : '✕'}
                </button>
              </div>
            {/each}
          </div>
        {/if}
        {#each newFiles as f, i (i)}
          <div class="fitem fitem--new">
            <span class="fitem__open">🆕 {f.name}</span>
            <button
              class="fitem__x"
              onclick={() => (newFiles = newFiles.filter((_, j) => j !== i))}
              aria-label="Убрать файл">✕</button
            >
          </div>
        {/each}
        <label class="addfile">
          ＋ Добавить фото или PDF
          <input type="file" accept="image/*,application/pdf" multiple onchange={onFilesPicked} hidden />
        </label>

        <div class="field-label">Заметка</div>
        <input class="input" type="text" maxlength="300" placeholder="необязательно" bind:value={fNotes} />

        <button class="btn" style="margin-top:16px" onclick={save} disabled={!canSave || busy}>
          {busy ? progress || 'Сохраняю…' : init.item ? 'Сохранить' : 'Загрузить'}
        </button>
        {#if init.item}
          <button class="btn btn--danger" style="margin-top:10px" onclick={remove} disabled={busy}>
            Удалить запись
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .choose {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .pickbtn {
    border: none;
    border-radius: var(--r-card);
    padding: 24px 12px;
    font-size: 16px;
    font-weight: 800;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    transition: transform 0.06s ease;
  }
  .pickbtn:active {
    transform: scale(0.96);
  }
  .pickbtn__emoji {
    font-size: 32px;
  }
  .pickbtn--lab {
    background: linear-gradient(135deg, var(--rose-ink), #db9186);
  }
  .pickbtn--doc {
    background: linear-gradient(135deg, var(--yellow-ink), #d0a856);
  }

  .scrollable {
    max-height: 68svh;
    overflow-y: auto;
    padding-bottom: 4px;
  }
  .flist {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .fitem {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--hair);
    background: var(--surface);
    border-radius: 12px;
    padding: 4px 6px 4px 12px;
    margin-bottom: 2px;
  }
  .fitem[data-removed='true'] {
    opacity: 0.45;
  }
  .fitem--new {
    border-style: dashed;
  }
  .fitem__open {
    flex: 1;
    border: none;
    background: none;
    text-align: left;
    font-family: inherit;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink-soft);
    padding: 7px 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .fitem__x {
    border: none;
    background: var(--bg);
    color: var(--muted);
    border-radius: 8px;
    width: 30px;
    height: 30px;
    font-size: 14px;
    font-weight: 800;
    flex: none;
  }
  .addfile {
    display: block;
    text-align: center;
    background: var(--peach-bg);
    color: var(--accent-deep);
    border: 2px dashed #e8b79c;
    font-weight: 800;
    font-size: 13px;
    padding: 12px;
    border-radius: var(--r-btn);
    cursor: pointer;
    margin-top: 8px;
  }
</style>
