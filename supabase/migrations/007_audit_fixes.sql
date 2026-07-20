-- ============================================================================
-- 007 — fixes from the security/logic audit (2026-07-20)
--
-- 1. created_by FKs get ON DELETE SET NULL: they defaulted to NO ACTION, so
--    removing a family member failed with an FK violation as soon as they had
--    logged a single record.
-- 2. members roster becomes editor-only reading: guests could enumerate every
--    member's telegram_id/role via PostgREST, contradicting the access model.
-- 3. The child's national ID (teudat zehut) moves to an editor-only
--    child_private table: it sat in guest-readable `children`, so any guest
--    JWT could fetch it via the API and the card UI showed it to guests.
-- 4. A partial unique index guarantees at most one open sleep session per
--    child: undo/races could create two, corrupting day stats and leaving an
--    invisible never-ending session.
-- 5. feeding_reminder_settings.last_notified_stage records WHICH reminder
--    stage was sent: inferring it from the timestamp alone broke when the
--    last feeding's time was edited between stages 1/2 and 2/2.
-- ============================================================================

-- --- 1. member removal must not be blocked by their history ------------------
do $$
declare t text;
begin
  foreach t in array array[
    'wellbeing_posts', 'feedings', 'diapers', 'sleep_sessions', 'measurements',
    'doctor_visits', 'lab_results', 'documents', 'memories', 'reminders'
  ] loop
    execute format('alter table public.%I drop constraint %I', t, t || '_created_by_fkey');
    execute format(
      'alter table public.%I add constraint %I foreign key (created_by)
         references public.members(telegram_id) on delete set null',
      t, t || '_created_by_fkey');
  end loop;
end $$;

-- --- 2. guests must not read the family roster -------------------------------
drop policy members_select on public.members;
create policy members_select on public.members
  for select using (public.is_editor());

-- --- 3. national ID is editor-only -------------------------------------------
create table public.child_private (
  child_id   uuid primary key references public.children(id) on delete cascade,
  id_number  text
);

alter table public.child_private enable row level security;

create policy child_private_editor_all on public.child_private
  for all using (public.is_editor()) with check (public.is_editor());

grant select, insert, update, delete on public.child_private to authenticated, service_role;
revoke all on public.child_private from anon;

insert into public.child_private (child_id, id_number)
  select id, id_number from public.children where id_number is not null;

alter table public.children drop column if exists id_number;

-- --- 4. at most one open sleep session per child -----------------------------
-- close any existing older duplicates first (keep the newest open)
update public.sleep_sessions s
set ended_at = s.started_at + interval '1 minute'
where s.ended_at is null
  and exists (
    select 1 from public.sleep_sessions o
    where o.child_id = s.child_id and o.ended_at is null
      and o.started_at > s.started_at
  );

create unique index if not exists one_open_sleep_per_child
  on public.sleep_sessions (child_id)
  where ended_at is null;

-- --- 5. explicit reminder stage ----------------------------------------------
alter table public.feeding_reminder_settings
  add column if not exists last_notified_stage smallint not null default 0;
