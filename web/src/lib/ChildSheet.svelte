<script lang="ts">
  import { untrack } from 'svelte'
  import { updateChild, loadChildIdNumber, saveChildIdNumber, type Child } from './data'
  import { uploadMedia, removeMedia } from './storage'
  import { hapticSuccess, hapticError } from './telegram'
  import { ageLabel } from './format'
  import ChildAvatar from './ChildAvatar.svelte'

  let {
    child,
    canEdit,
    onClose,
    onSaved,
  }: {
    child: Child
    canEdit: boolean
    onClose: () => void
    onSaved: (c: Child) => void
  } = $props()

  const init = untrack(() => child)

  let fName = $state(init.name)
  let fDate = $state(init.birth_date)
  let fTime = $state(init.birth_time ? init.birth_time.slice(0, 5) : '')
  // The national ID lives in editor-only child_private (migration 007);
  // guests never load or see it.
  let idNumber = $state<string | null>(null)
  let fId = $state('')

  $effect(() => {
    if (!canEdit) return
    loadChildIdNumber(init.id)
      .then((v) => {
        idNumber = v
        fId = v ?? ''
      })
      .catch((e) => console.error('loadChildIdNumber', e))
  })
  let newPhoto = $state<File | null>(null)
  let busy = $state(false)
  let editing = $state(false)

  const MONTHS_GEN = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ]

  function bornLine(c: Child): string {
    const d = new Date(c.birth_date)
    let line = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`
    if (c.birth_time) line += ` в ${c.birth_time.slice(0, 5)}`
    return line
  }

  function onPhotoPicked(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files?.[0]) newPhoto = input.files[0]
    input.value = ''
  }

  async function save() {
    if (busy || !fName.trim() || !fDate) return
    busy = true
    try {
      let photo_path = init.photo_path
      if (newPhoto) {
        const [uploaded] = await uploadMedia(init.id, [newPhoto])
        photo_path = uploaded
      }
      const updated = await updateChild(init.id, {
        name: fName.trim(),
        birth_date: fDate,
        birth_time: fTime || null,
        photo_path,
      })
      if ((fId.trim() || null) !== idNumber) {
        await saveChildIdNumber(init.id, fId.trim() || null)
      }
      // remove the replaced photo only after the record points at the new one
      if (newPhoto && init.photo_path) await removeMedia([init.photo_path])
      hapticSuccess()
      onSaved(updated)
      onClose()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось сохранить')
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

    {#if !editing}
      <!-- визитка -->
      <div class="vcard">
        <ChildAvatar path={child.photo_path} size={104} radius="32px" />
        <div class="vcard__name">{child.name}</div>
        <div class="vcard__age">{ageLabel(child.birth_date)}</div>

        <div class="vrows">
          <div class="vrow">
            <span class="vrow__k">🎂 Родилась</span>
            <span class="vrow__v">{bornLine(child)}</span>
          </div>
          {#if canEdit && idNumber}
            <div class="vrow">
              <span class="vrow__k">🪪 Теудат-зеут</span>
              <span class="vrow__v vrow__v--num">{idNumber}</span>
            </div>
          {/if}
        </div>

        {#if canEdit}
          <button class="btn btn--soft" style="margin-top:18px" onclick={() => (editing = true)}>
            Редактировать
          </button>
        {/if}
      </div>
    {:else}
      <div class="sheet-title">👶 Профиль</div>

      <div class="photo-edit">
        <ChildAvatar path={child.photo_path} size={72} radius="24px" />
        <label class="addfile">
          {newPhoto ? `🆕 ${newPhoto.name}` : child.photo_path ? 'Заменить фото' : '＋ Добавить фото'}
          <input type="file" accept="image/*" onchange={onPhotoPicked} hidden />
        </label>
      </div>

      <div class="field-label">Имя</div>
      <input class="input" type="text" maxlength="40" bind:value={fName} />

      <div class="grid2">
        <label class="f">
          <span class="field-label">Дата рождения</span>
          <input class="input" type="date" bind:value={fDate} />
        </label>
        <label class="f">
          <span class="field-label">Время</span>
          <input class="input" type="time" bind:value={fTime} />
        </label>
      </div>

      <div class="field-label">Номер теудат-зеут</div>
      <input class="input" type="text" inputmode="numeric" maxlength="20" placeholder="необязательно" bind:value={fId} />

      <button class="btn" style="margin-top:16px" onclick={save} disabled={busy || !fName.trim() || !fDate}>
        {busy ? 'Сохраняю…' : 'Сохранить'}
      </button>
      <button class="btn btn--soft" style="margin-top:10px" onclick={() => (editing = false)} disabled={busy}>
        Назад
      </button>
    {/if}
  </div>
</div>

<style>
  .vcard {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 6px 0 2px;
  }
  .vcard__name {
    font-family: var(--font-serif);
    font-size: 28px;
    font-weight: 600;
    color: var(--ink);
    margin-top: 12px;
  }
  .vcard__age {
    font-size: 14px;
    color: var(--muted);
    font-weight: 700;
    margin-top: 2px;
  }
  .vrows {
    width: 100%;
    margin-top: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .vrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    background: var(--surface);
    border-radius: var(--r-btn);
    padding: 13px 15px;
    box-shadow: var(--sh-card);
  }
  .vrow__k {
    font-size: 13px;
    font-weight: 800;
    color: var(--muted);
    flex: none;
  }
  .vrow__v {
    font-size: 14px;
    font-weight: 700;
    color: var(--ink);
    text-align: right;
  }
  .vrow__v--num {
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
  }

  .photo-edit {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 6px;
  }
  .addfile {
    flex: 1;
    text-align: center;
    background: var(--peach-bg);
    color: var(--accent-deep);
    border: 2px dashed #e8b79c;
    font-weight: 800;
    font-size: 13px;
    padding: 12px;
    border-radius: var(--r-btn);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 12px;
  }
  .f {
    display: block;
  }
</style>
