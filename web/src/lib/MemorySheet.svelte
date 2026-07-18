<script lang="ts">
  import { untrack } from 'svelte'
  import {
    addMemory,
    updateMemory,
    deleteMemory,
    type MemoryItem,
  } from './data'
  import { uploadMedia, removeMedia } from './storage'
  import { hapticSuccess, hapticError } from './telegram'
  import { todayLocalISO } from './format'
  import MediaThumb from './MediaThumb.svelte'

  let {
    childId,
    memory,
    onClose,
    onChanged,
  }: {
    childId: string
    memory: MemoryItem | null // null = new
    onClose: () => void
    onChanged: () => void
  } = $props()

  const init = untrack(() => memory)

  let fTitle = $state(init?.title ?? '')
  let fStory = $state(init?.story ?? '')
  let fDate = $state(init?.happened_at ?? todayLocalISO())
  let existing = $state<string[]>(init?.media_paths ?? [])
  let toRemove = $state<string[]>([])
  let newFiles = $state<File[]>([])
  let busy = $state(false)
  let progress = $state('')

  const canSave = $derived(
    fStory.trim().length > 0 ||
      existing.length - toRemove.length + newFiles.length > 0,
  )

  function onFilesPicked(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files) newFiles = [...newFiles, ...input.files]
    input.value = ''
  }

  function markRemove(path: string) {
    toRemove = toRemove.includes(path)
      ? toRemove.filter((p) => p !== path)
      : [...toRemove, path]
  }

  async function save() {
    if (!canSave || busy) return
    busy = true
    try {
      const uploaded = await uploadMedia(childId, newFiles, (done, total) => {
        progress = total > 0 ? `Загружаю ${Math.min(done + 1, total)}/${total}…` : ''
      })
      progress = 'Сохраняю…'
      const keep = existing.filter((p) => !toRemove.includes(p))
      const fields = {
        title: fTitle.trim() || null,
        story: fStory.trim() || null,
        media_paths: [...keep, ...uploaded],
        happened_at: fDate,
      }
      if (init) await updateMemory(init.id, fields)
      else await addMemory(childId, fields)
      if (toRemove.length > 0) await removeMedia(toRemove)
      hapticSuccess()
      onChanged()
    } catch (e) {
      hapticError()
      busy = false
      progress = ''
      alert('Не удалось сохранить. Фото до 10 МБ.')
      console.error(e)
    }
  }

  async function remove() {
    if (!init || busy) return
    if (!confirm('Удалить этот момент вместе с фото?')) return
    busy = true
    try {
      await deleteMemory(init.id)
      await removeMedia(init.media_paths)
      hapticSuccess()
      onChanged()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось удалить')
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
    <div class="sheet-title">🌸 {init ? 'Момент' : 'Новый момент'}</div>

    <div class="scrollable">
      <div class="field-label">Фото</div>
      {#if existing.length > 0}
        <div class="pgrid">
          {#each existing as p (p)}
            <div class="pcell" data-removed={toRemove.includes(p)}>
              <MediaThumb path={p} />
              <button class="pcell__x" onclick={() => markRemove(p)} aria-label="Удалить фото">
                {toRemove.includes(p) ? '↩' : '✕'}
              </button>
            </div>
          {/each}
        </div>
      {/if}
      {#if newFiles.length > 0}
        <div class="newlist">
          {#each newFiles as f, i (i)}
            <div class="newitem">
              🆕 {f.name}
              <button
                class="pcell__x pcell__x--inline"
                onclick={() => (newFiles = newFiles.filter((_, j) => j !== i))}
                aria-label="Убрать">✕</button
              >
            </div>
          {/each}
        </div>
      {/if}
      <label class="addfile">
        ＋ Добавить фото
        <input type="file" accept="image/*" multiple onchange={onFilesPicked} hidden />
      </label>

      <div class="field-label">Заголовок</div>
      <input class="input" type="text" maxlength="80" placeholder="необязательно" bind:value={fTitle} />

      <div class="field-label">История</div>
      <textarea
        class="input area"
        rows="3"
        maxlength="1000"
        placeholder="Что сегодня случилось хорошего?"
        bind:value={fStory}
      ></textarea>

      <div class="field-label">Дата</div>
      <input class="input input--time" type="date" bind:value={fDate} />

      <button class="btn" style="margin-top:16px" onclick={save} disabled={!canSave || busy}>
        {busy ? progress || 'Сохраняю…' : init ? 'Сохранить' : 'Добавить момент'}
      </button>
      {#if init}
        <button class="btn btn--danger" style="margin-top:10px" onclick={remove} disabled={busy}>
          Удалить момент
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .scrollable {
    max-height: 68svh;
    overflow-y: auto;
    padding-bottom: 4px;
  }
  .pgrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin-bottom: 8px;
  }
  .pcell {
    position: relative;
  }
  .pcell[data-removed='true'] {
    opacity: 0.4;
  }
  .pcell__x {
    position: absolute;
    top: 6px;
    right: 6px;
    border: none;
    background: rgba(42, 36, 30, 0.65);
    color: #fff;
    border-radius: 8px;
    width: 26px;
    height: 26px;
    font-size: 13px;
    font-weight: 800;
  }
  .pcell__x--inline {
    position: static;
    background: var(--bg);
    color: var(--muted);
  }
  .newlist {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }
  .newitem {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px dashed var(--hair);
    background: var(--surface);
    border-radius: 12px;
    padding: 8px 8px 8px 12px;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink-soft);
    overflow: hidden;
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
  }
  .area {
    resize: none;
    line-height: 1.5;
  }
</style>
