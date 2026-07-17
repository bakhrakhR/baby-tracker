-- ============================================================================
-- Local test harness: emulates the Supabase environment
-- (auth.jwt() + API roles), applies the migration, then verifies RLS.
-- ============================================================================
\set ON_ERROR_STOP on

drop database if exists babytest;
create database babytest;
\c babytest

-- --- emulate Supabase: roles ------------------------------------------------
do $$
begin
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  -- service_role is the backend/admin role used by Edge Functions; it bypasses
  -- RLS but still relies on the table GRANTs from migration 002.
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- --- emulate Supabase: auth.jwt() reads claims from a session GUC -----------
create schema auth;
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb,
                  '{}'::jsonb);
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.jwt() to authenticated, anon, service_role;

-- --- apply the migrations under test -----------------------------------------
-- Paths are relative to the repo root; run from there, as documented:
--   sudo -u postgres psql -v ON_ERROR_STOP=1 -f test/rls_test.sql
\i supabase/migrations/001_init.sql
\i supabase/migrations/002_service_role_grants.sql

-- ============================================================================
-- Seed data (as superuser, bypassing RLS)
-- ============================================================================
insert into public.members (telegram_id, display_name, role) values
  (100, 'Papa',    'admin'),
  (200, 'Mama',    'editor'),
  (300, 'Grandma', 'guest');

insert into public.children (id, name, birth_date, bio) values
  ('11111111-1111-1111-1111-111111111111', 'Baby', '2026-06-20', 'Our sunshine');

insert into public.measurements (child_id, measured_at, weight_g, height_cm)
  values ('11111111-1111-1111-1111-111111111111', '2026-07-01', 3900, 53.0);

insert into public.wellbeing_posts (child_id, mood, comment, created_by)
  values ('11111111-1111-1111-1111-111111111111', 'great', 'Slept 5 hours straight!', 200);

insert into public.feedings (child_id, method, breast_side, duration_min, created_by)
  values ('11111111-1111-1111-1111-111111111111', 'breast', 'left', 20, 200);

-- ============================================================================
-- Helper: expect_fail(sql, label) — asserts that a statement is rejected
-- ============================================================================
create or replace function public.expect_fail(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
    raise exception 'TEST FAILED: % — statement unexpectedly succeeded', label;
  exception
    when insufficient_privilege or check_violation then
      raise notice 'OK (rejected as expected): %', label;
    when raise_exception then
      raise;  -- re-raise our own TEST FAILED
  end;
end $$;

-- ============================================================================
-- SCENARIO 1: GUEST (grandma) — sees info page, nothing else, cannot write
-- ============================================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","app_role":"guest","tg_id":"300"}', false);

do $$
declare n int;
begin
  select count(*) into n from public.children;
  assert n = 1, 'guest must see the child profile';

  select count(*) into n from public.measurements;
  assert n = 1, 'guest must see measurements (charts)';

  select count(*) into n from public.wellbeing_posts;
  assert n = 1, 'guest must see wellbeing posts';

  -- RLS on private tables filters rows to zero for guests
  select count(*) into n from public.feedings;
  assert n = 0, 'guest must NOT see feedings';

  select count(*) into n from public.reminders;
  assert n = 0, 'guest must NOT see reminders';

  raise notice 'OK: guest read scope is correct';
end $$;

-- guest write attempts must be rejected
select public.expect_fail(
  $q$ insert into public.feedings (child_id, method, amount_ml, milk_type)
      values ('11111111-1111-1111-1111-111111111111','bottle',90,'formula') $q$,
  'guest cannot insert feeding');

-- RLS filters rows silently on UPDATE/DELETE: assert 0 rows were affected
do $$
declare n int; b text;
begin
  update public.children set bio = 'hacked';
  get diagnostics n = row_count;
  assert n = 0, 'guest UPDATE must affect 0 rows';
  select bio into b from public.children limit 1;
  assert b = 'Our sunshine', 'child bio must remain unchanged';
  raise notice 'OK (no-op as expected): guest cannot update child profile';
end $$;

do $$
declare n int;
begin
  delete from public.measurements;
  get diagnostics n = row_count;
  assert n = 0, 'guest DELETE must affect 0 rows';
  raise notice 'OK (no-op as expected): guest cannot delete measurements';
end $$;

select public.expect_fail(
  $q$ insert into public.members (telegram_id, display_name, role)
      values (999,'Intruder','admin') $q$,
  'guest cannot add members');

reset role;

-- ============================================================================
-- SCENARIO 2: EDITOR (mama) — full data access, but no member management
-- ============================================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","app_role":"editor","tg_id":"200"}', false);

do $$
declare n int;
begin
  select count(*) into n from public.feedings;
  assert n = 1, 'editor must see feedings';

  insert into public.feedings (child_id, method, amount_ml, milk_type, created_by)
    values ('11111111-1111-1111-1111-111111111111','bottle', 90, 'formula', 200);

  insert into public.diapers (child_id, kind, created_by)
    values ('11111111-1111-1111-1111-111111111111','wet', 200);

  insert into public.doctor_visits (child_id, title, visit_at, prep_checklist, created_by)
    values ('11111111-1111-1111-1111-111111111111','Pediatrician checkup',
            now() + interval '3 days',
            '[{"text":"vaccination card","done":false}]'::jsonb, 200);

  insert into public.reminders (kind, fire_at, message, created_by)
    values ('custom', now() + interval '1 day', 'Buy diapers', 200);

  select count(*) into n from public.members;
  assert n = 3, 'editor must see the member list';

  raise notice 'OK: editor read/write scope is correct';
end $$;

-- editor must not manage members
select public.expect_fail(
  $q$ insert into public.members (telegram_id, display_name, role)
      values (400,'Aunt','guest') $q$,
  'editor cannot add members');

do $$
declare n int; r text;
begin
  update public.members set role = 'admin' where telegram_id = 200;
  get diagnostics n = row_count;
  assert n = 0, 'editor role-escalation UPDATE must affect 0 rows';
  select role into r from public.members where telegram_id = 200;
  assert r = 'editor', 'editor role must remain unchanged';
  raise notice 'OK (no-op as expected): editor cannot escalate own role';
end $$;

reset role;

-- ============================================================================
-- SCENARIO 3: ADMIN (papa) — can manage members
-- ============================================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","app_role":"admin","tg_id":"100"}', false);

do $$
begin
  insert into public.members (telegram_id, display_name, role)
    values (400, 'Second Grandma', 'guest');
  update public.members set notifications_enabled = false where telegram_id = 400;
  delete from public.members where telegram_id = 400;
  raise notice 'OK: admin can manage members';
end $$;

reset role;

-- ============================================================================
-- SCENARIO 4: ANON (no valid JWT) — sees and does nothing
-- ============================================================================
set role anon;
select public.expect_fail(
  $q$ select count(*) from public.children $q$,
  'anon cannot even read the child profile');
reset role;

-- ============================================================================
-- SCENARIO 5: data integrity — the mixed-feeding branch constraint
-- ============================================================================
set role authenticated;
select set_config('request.jwt.claims',
  '{"role":"authenticated","app_role":"editor","tg_id":"200"}', false);

-- bottle entry with breast fields must be rejected
select public.expect_fail(
  $q$ insert into public.feedings (child_id, method, amount_ml, milk_type, breast_side)
      values ('11111111-1111-1111-1111-111111111111','bottle',90,'formula','left') $q$,
  'bottle feeding cannot carry breast fields');

-- bottle entry without amount must be rejected
select public.expect_fail(
  $q$ insert into public.feedings (child_id, method)
      values ('11111111-1111-1111-1111-111111111111','bottle') $q$,
  'bottle feeding requires amount and milk type');

-- sleep session ending before it starts must be rejected
select public.expect_fail(
  $q$ insert into public.sleep_sessions (child_id, started_at, ended_at)
      values ('11111111-1111-1111-1111-111111111111', now(), now() - interval '1 hour') $q$,
  'sleep session cannot end before it starts');

reset role;

-- ============================================================================
-- SCENARIO 6: SERVICE ROLE (Edge Functions) — full table access, bypasses RLS
-- This is what auth-telegram relies on to read the members whitelist.
-- ============================================================================
set role service_role;

do $$
declare n int;
begin
  -- no request.jwt.claims set: RLS would block a normal role, but service_role
  -- has BYPASSRLS and the GRANTs from migration 002.
  select count(*) into n from public.members;
  assert n >= 3, 'service_role must read the members whitelist';

  select count(*) into n from public.feedings;
  assert n >= 1, 'service_role must read private tables (bypasses RLS)';

  insert into public.diapers (child_id, kind, created_by)
    values ('11111111-1111-1111-1111-111111111111', 'wet', 100);

  raise notice 'OK: service_role has full data access';
end $$;

reset role;

select 'ALL RLS TESTS PASSED' as result;
