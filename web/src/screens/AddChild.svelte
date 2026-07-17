<script lang="ts">
  import { createChild, type Child } from '../lib/data'
  import { hapticSuccess, hapticError } from '../lib/telegram'

  let { onCreated }: { onCreated: (c: Child) => void } = $props()

  let name = $state('')
  let birth = $state('')
  let saving = $state(false)

  const canSave = $derived(name.trim().length > 0 && birth.length > 0)

  async function submit() {
    if (!canSave || saving) return
    saving = true
    try {
      const child = await createChild(name.trim(), birth)
      hapticSuccess()
      onCreated(child)
    } catch (e) {
      hapticError()
      saving = false
      alert('Не удалось создать профиль')
      console.error(e)
    }
  }
</script>

<div class="wrap">
  <div class="emoji">👶</div>
  <h1 class="section-title" style="text-align:center">Добавьте малыша</h1>
  <p class="lead">Создайте профиль ребёнка, чтобы начать вести дневник.</p>

  <label class="field">
    <span>Имя</span>
    <input type="text" bind:value={name} placeholder="Например, Мия" maxlength="40" />
  </label>

  <label class="field">
    <span>Дата рождения</span>
    <input type="date" bind:value={birth} />
  </label>

  <button class="btn" onclick={submit} disabled={!canSave || saving}>
    {saving ? 'Создаю…' : 'Создать профиль'}
  </button>
</div>

<style>
  .wrap {
    padding-top: 24px;
  }
  .emoji {
    font-size: 52px;
    text-align: center;
  }
  .lead {
    text-align: center;
    color: var(--muted);
    font-size: 15px;
    font-weight: 600;
    margin-bottom: 22px;
  }
  .field {
    display: block;
    margin-bottom: 14px;
  }
  .field span {
    display: block;
    font-size: 13px;
    font-weight: 800;
    color: var(--muted);
    margin-bottom: 6px;
  }
  .field input {
    width: 100%;
    border: 2px solid var(--hair);
    background: var(--surface);
    border-radius: var(--r-btn);
    padding: 13px 14px;
    font-family: inherit;
    font-size: 16px;
    font-weight: 700;
    color: var(--ink);
  }
  .field input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .btn:disabled {
    opacity: 0.5;
  }
</style>
