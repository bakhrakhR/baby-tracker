<script lang="ts">
  import {
    loadMembers,
    addMember,
    updateMemberRole,
    deleteMember,
    type MemberRow,
  } from './data'
  import { session } from './session'
  import { hapticSuccess, hapticError, hapticSelection } from './telegram'
  import type { AppRole } from './types'

  let { onClose }: { onClose: () => void } = $props()

  let members = $state<MemberRow[]>([])
  let loading = $state(true)
  let busy = $state(false)

  // add-form state
  let adding = $state(false)
  let fId = $state<number | null>(null)
  let fName = $state('')
  let fRole = $state<AppRole>('guest')

  // per-member edit state
  let editing = $state<MemberRow | null>(null)
  let eRole = $state<AppRole>('guest')

  const ROLE_LABEL: Record<AppRole, string> = {
    admin: 'Админ',
    editor: 'Родитель',
    guest: 'Гость',
  }
  const ROLE_HINT: Record<AppRole, string> = {
    admin: 'всё + управление семьёй',
    editor: 'записи и правки',
    guest: 'только инфо-страница',
  }
  const roles: AppRole[] = ['editor', 'guest', 'admin']

  const myId = $derived($session.member?.telegram_id ?? -1)
  const canAdd = $derived(fId != null && fId > 0 && fName.trim().length > 0)

  function reload() {
    loading = true
    loadMembers()
      .then((r) => (members = r))
      .catch((e) => console.error('loadMembers', e))
      .finally(() => (loading = false))
  }
  $effect(() => {
    reload()
  })

  async function submitAdd() {
    if (!canAdd || busy) return
    busy = true
    try {
      await addMember(fId!, fName.trim(), fRole)
      hapticSuccess()
      adding = false
      fId = null
      fName = ''
      fRole = 'guest'
      reload()
    } catch (e) {
      hapticError()
      alert('Не удалось добавить. Возможно, этот ID уже в списке.')
      console.error(e)
    } finally {
      busy = false
    }
  }

  function openEdit(m: MemberRow) {
    // Guard against locking yourself out: your own row is read-only here.
    if (m.telegram_id === myId) return
    hapticSelection()
    editing = m
    eRole = m.role
  }

  async function saveRole() {
    if (!editing || busy) return
    busy = true
    try {
      await updateMemberRole(editing.telegram_id, eRole)
      hapticSuccess()
      editing = null
      reload()
    } catch (e) {
      hapticError()
      alert('Не удалось изменить роль')
      console.error(e)
    } finally {
      busy = false
    }
  }

  async function removeMember() {
    if (!editing || busy) return
    if (!confirm(`Убрать «${editing.display_name}» из семьи? Доступ пропадёт сразу.`)) return
    busy = true
    try {
      await deleteMember(editing.telegram_id)
      hapticSuccess()
      editing = null
      reload()
    } catch (e) {
      hapticError()
      alert('Не удалось удалить участника')
      console.error(e)
    } finally {
      busy = false
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

    {#if editing}
      <div class="sheet-title">👤 {editing.display_name}</div>
      <div class="idline">Telegram ID: {editing.telegram_id}</div>

      <div class="field-label">Роль</div>
      <div class="chips">
        {#each roles as r (r)}
          <button class="chip" data-active={eRole === r} onclick={() => (eRole = r)}>
            {ROLE_LABEL[r]}
          </button>
        {/each}
      </div>
      <p class="rolehint">{ROLE_HINT[eRole]}</p>

      <button class="btn" style="margin-top:14px" onclick={saveRole} disabled={busy || eRole === editing.role}>
        {busy ? 'Сохраняю…' : 'Сохранить роль'}
      </button>
      <button class="btn btn--danger" style="margin-top:10px" onclick={removeMember} disabled={busy}>
        Убрать из семьи
      </button>
      <button class="btn btn--soft" style="margin-top:10px" onclick={() => (editing = null)} disabled={busy}>
        Назад
      </button>
    {:else if adding}
      <div class="sheet-title">➕ Добавить в семью</div>

      <div class="field-label">Telegram ID</div>
      <input class="input" type="number" placeholder="например, 349513510" bind:value={fId} />
      <p class="rolehint">
        Человек пишет боту <b>@userinfobot</b> в Telegram — тот отвечает его ID.
      </p>

      <div class="field-label">Имя</div>
      <input class="input" type="text" maxlength="40" placeholder="Например, Папа" bind:value={fName} />

      <div class="field-label">Роль</div>
      <div class="chips">
        {#each roles as r (r)}
          <button class="chip" data-active={fRole === r} onclick={() => (fRole = r)}>
            {ROLE_LABEL[r]}
          </button>
        {/each}
      </div>
      <p class="rolehint">{ROLE_HINT[fRole]}</p>

      <button class="btn" style="margin-top:14px" onclick={submitAdd} disabled={!canAdd || busy}>
        {busy ? 'Добавляю…' : 'Добавить'}
      </button>
      <button class="btn btn--soft" style="margin-top:10px" onclick={() => (adding = false)} disabled={busy}>
        Назад
      </button>
    {:else}
      <div class="sheet-title">👨‍👩‍👧 Семья</div>

      {#if loading && members.length === 0}
        <div class="empty">Загрузка…</div>
      {:else}
        <div class="rows">
          {#each members as m (m.telegram_id)}
            <button class="frow" onclick={() => openEdit(m)} disabled={m.telegram_id === myId}>
              <span class="frow__name">
                {m.display_name}{m.telegram_id === myId ? ' (вы)' : ''}
              </span>
              <span class="frow__role" data-role={m.role}>{ROLE_LABEL[m.role]}</span>
            </button>
          {/each}
        </div>
      {/if}

      <button class="btn" style="margin-top:16px" onclick={() => (adding = true)}>
        ＋ Добавить участника
      </button>
    {/if}
  </div>
</div>

<style>
  .idline {
    font-size: 13px;
    color: var(--muted);
    font-weight: 700;
    margin: -8px 0 6px;
  }
  .rolehint {
    font-size: 12px;
    color: var(--muted);
    font-weight: 600;
    margin-top: 8px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 260px;
    overflow-y: auto;
  }
  .frow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    border: 1px solid var(--hair);
    background: var(--surface);
    border-radius: 14px;
    padding: 12px 14px;
    text-align: left;
  }
  .frow:disabled {
    cursor: default;
    opacity: 0.75;
  }
  .frow__name {
    font-size: 15px;
    font-weight: 800;
    color: var(--ink);
  }
  .frow__role {
    font-size: 12px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: var(--r-pill);
    background: var(--bg);
    color: var(--muted);
  }
  .frow__role[data-role='admin'] {
    background: var(--peach-bg);
    color: var(--accent-deep);
  }
  .frow__role[data-role='editor'] {
    background: var(--green-bg);
    color: var(--green-ink);
  }
  .frow__role[data-role='guest'] {
    background: var(--purple-bg);
    color: var(--purple-ink);
  }
</style>
