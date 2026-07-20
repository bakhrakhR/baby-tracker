<script lang="ts">
  import { untrack } from 'svelte'
  import {
    addVisit,
    updateVisit,
    deleteVisit,
    setVisitReminder,
    getVisitReminderLead,
    type VisitItem,
    type VisitStatus,
    type ReminderLead,
    type ChecklistItem,
  } from './data'
  import { hapticSuccess, hapticError } from './telegram'
  import { localDateISO, todayLocalISO } from './format'

  let {
    childId,
    visit,
    onClose,
    onChanged,
  }: {
    childId: string
    visit: VisitItem | null // null = create
    onClose: () => void
    onChanged: () => void
  } = $props()

  // Snapshot once — the sheet is mounted per visit.
  const init = untrack(() => {
    const v = visit
    const at = v ? new Date(v.visit_at) : null
    return {
      title: v?.title ?? '',
      doctor: v?.doctor_name ?? '',
      location: v?.location ?? '',
      date: at ? localDateISO(at) : todayLocalISO(),
      time: at
        ? `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
        : '10:00',
      checklist: (v?.prep_checklist ?? []).map((c) => c.text).join('\n'),
      prevDone: new Map((v?.prep_checklist ?? []).map((c) => [c.text, c.done])),
      notes: v?.notes ?? '',
      status: v?.status ?? ('planned' as VisitStatus),
    }
  })

  let fTitle = $state(init.title)
  let fDoctor = $state(init.doctor)
  let fLocation = $state(init.location)
  let fDate = $state(init.date)
  let fTime = $state(init.time)
  let fChecklist = $state(init.checklist)
  let fNotes = $state(init.notes)
  let fStatus = $state<VisitStatus>(init.status)
  let fLead = $state<ReminderLead>('none')
  let busy = $state(false)
  // Saving before the existing lead loads would wrongly wipe the reminder
  // with the 'none' default (audit finding) — block save until it resolves.
  let leadLoaded = $state(untrack(() => visit) === null)

  // Load the current reminder lead for an existing visit.
  $effect(() => {
    const v = untrack(() => visit)
    if (v) {
      getVisitReminderLead(v)
        .then((l) => {
          fLead = l
          leadLoaded = true
        })
        .catch((e) => {
          console.error('getVisitReminderLead', e)
          leadLoaded = true // don't brick the sheet on a lookup failure
        })
    }
  })

  const canSave = $derived(fTitle.trim().length > 0 && !!fDate && !!fTime && leadLoaded)

  const STATUS_RU: Record<VisitStatus, string> = {
    planned: 'Запланирован',
    done: 'Прошёл',
    cancelled: 'Отменён',
  }
  const LEAD_RU: Record<ReminderLead, string> = {
    none: 'Без напоминания',
    hour: 'За час',
    day: 'За день',
  }

  function buildChecklist(): ChecklistItem[] {
    return fChecklist
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((text) => ({ text, done: init.prevDone.get(text) ?? false }))
  }

  function buildVisitAt(): string {
    const [h, m] = fTime.split(':').map(Number)
    const d = new Date(fDate)
    d.setHours(h, m, 0, 0)
    return d.toISOString()
  }

  async function save() {
    if (!canSave || busy) return
    busy = true
    const fields = {
      title: fTitle.trim(),
      doctor_name: fDoctor.trim() || null,
      location: fLocation.trim() || null,
      visit_at: buildVisitAt(),
      prep_checklist: buildChecklist(),
      notes: fNotes.trim() || null,
      status: fStatus,
    }
    try {
      const saved = visit
        ? await updateVisit(visit.id, fields)
        : await addVisit(childId, fields)
      // reminders only make sense for planned future visits
      await setVisitReminder(saved, saved.status === 'planned' ? fLead : 'none')
      hapticSuccess()
      onChanged()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось сохранить визит')
      console.error(e)
    }
  }

  async function remove() {
    if (!visit || busy) return
    if (!confirm('Удалить этот визит?')) return
    busy = true
    try {
      await deleteVisit(visit.id)
      hapticSuccess()
      onChanged()
    } catch (e) {
      hapticError()
      busy = false
      alert('Не удалось удалить визит')
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
    class="sheet sheet--tall"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="dialog"
    tabindex="-1"
  >
    <div class="sheet__grip"></div>
    <div class="sheet-title">🩺 {visit ? 'Визит' : 'Новый визит'}</div>

    <div class="scrollable">
      <div class="field-label">Название</div>
      <input class="input" type="text" maxlength="120" placeholder="Педиатр · плановый осмотр" bind:value={fTitle} />

      <div class="grid2">
        <label class="f">
          <span class="field-label">Дата</span>
          <input class="input" type="date" bind:value={fDate} />
        </label>
        <label class="f">
          <span class="field-label">Время</span>
          <input class="input" type="time" bind:value={fTime} />
        </label>
      </div>

      <div class="field-label">Врач</div>
      <input class="input" type="text" maxlength="80" placeholder="необязательно" bind:value={fDoctor} />

      <div class="field-label">Место</div>
      <input class="input" type="text" maxlength="120" placeholder="необязательно" bind:value={fLocation} />

      <div class="field-label">Чек-лист подготовки · по пункту на строку</div>
      <textarea
        class="input area"
        rows="3"
        placeholder={'Карта прививок\nСписок вопросов врачу'}
        bind:value={fChecklist}
      ></textarea>

      <div class="field-label">🔔 Напоминание в Telegram</div>
      <div class="chips">
        {#each ['none', 'hour', 'day'] as const as l (l)}
          <button class="chip" data-active={fLead === l} onclick={() => (fLead = l)}>
            {LEAD_RU[l]}
          </button>
        {/each}
      </div>

      {#if visit}
        <div class="field-label">Статус</div>
        <div class="chips">
          {#each ['planned', 'done', 'cancelled'] as const as s (s)}
            <button class="chip" data-active={fStatus === s} onclick={() => (fStatus = s)}>
              {STATUS_RU[s]}
            </button>
          {/each}
        </div>
      {/if}

      <div class="field-label">Заметка</div>
      <input class="input" type="text" maxlength="300" placeholder="необязательно" bind:value={fNotes} />

      <button class="btn" style="margin-top:16px" onclick={save} disabled={!canSave || busy}>
        {busy ? 'Сохраняю…' : visit ? 'Сохранить' : 'Записать визит'}
      </button>
      {#if visit}
        <button class="btn btn--danger" style="margin-top:10px" onclick={remove} disabled={busy}>
          Удалить визит
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .sheet--tall .scrollable {
    max-height: 68svh;
    overflow-y: auto;
    padding-bottom: 4px;
  }
  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 12px;
  }
  .f {
    display: block;
  }
  .area {
    resize: none;
    line-height: 1.5;
  }
</style>
