-- ============================================================================
-- Baby Tracker — initial schema
-- Target: Supabase (PostgreSQL 15+)
--
-- Access model (enforced with Row Level Security):
--   admin  — full access + member management
--   editor — full read/write on all child data
--   guest  — read-only access to the public info page:
--            children, wellbeing_posts, measurements
--
-- Authentication: a Telegram Mini App validates initData in an Edge
-- Function which issues a Supabase-compatible JWT containing:
--   { "role": "authenticated", "app_role": "admin|editor|guest",
--     "tg_id": <telegram user id> }
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions to read custom claims from the JWT
-- ---------------------------------------------------------------------------
create or replace function public.app_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'app_role', 'anon');
$$;

create or replace function public.tg_id()
returns bigint
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'tg_id', '')::bigint;
$$;

create or replace function public.is_editor()
returns boolean
language sql
stable
as $$
  select public.app_role() in ('admin', 'editor');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.app_role() = 'admin';
$$;

create or replace function public.is_member()
returns boolean
language sql
stable
as $$
  select public.app_role() in ('admin', 'editor', 'guest');
$$;

-- ---------------------------------------------------------------------------
-- members — everyone who may open the app (whitelist)
-- ---------------------------------------------------------------------------
create table public.members (
  telegram_id            bigint primary key,
  display_name           text not null,
  role                   text not null default 'guest'
                           check (role in ('admin', 'editor', 'guest')),
  notifications_enabled  boolean not null default true,
  timezone               text not null default 'Asia/Jerusalem',
  created_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- children — child profile (table form keeps the door open for siblings)
-- ---------------------------------------------------------------------------
create table public.children (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  birth_date  date not null,
  photo_path  text,                          -- path inside the 'media' bucket
  bio         text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- wellbeing_posts — parents' short updates for the public info page
-- ---------------------------------------------------------------------------
create table public.wellbeing_posts (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.children(id) on delete cascade,
  posted_at   timestamptz not null default now(),
  mood        text check (mood in ('great', 'good', 'ok', 'fussy', 'sick')),
  comment     text,
  created_by  bigint references public.members(telegram_id)
);

-- ---------------------------------------------------------------------------
-- feedings — mixed feeding: breast entries and bottle entries in one table
-- ---------------------------------------------------------------------------
create table public.feedings (
  id            uuid primary key default gen_random_uuid(),
  child_id      uuid not null references public.children(id) on delete cascade,
  fed_at        timestamptz not null default now(),
  method        text not null check (method in ('breast', 'bottle')),
  -- breast-specific
  breast_side   text check (breast_side in ('left', 'right', 'both')),
  duration_min  integer check (duration_min between 1 and 240),
  -- bottle-specific
  amount_ml     integer check (amount_ml between 1 and 500),
  milk_type     text check (milk_type in ('breast_milk', 'formula')),
  notes         text,
  created_by    bigint references public.members(telegram_id),
  created_at    timestamptz not null default now(),
  -- keep the two branches consistent
  constraint feeding_branch_check check (
    (method = 'breast' and amount_ml is null and milk_type is null)
    or
    (method = 'bottle' and breast_side is null and duration_min is null
       and amount_ml is not null and milk_type is not null)
  )
);

create index feedings_child_time_idx on public.feedings (child_id, fed_at desc);

-- ---------------------------------------------------------------------------
-- diapers
-- ---------------------------------------------------------------------------
create table public.diapers (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.children(id) on delete cascade,
  changed_at  timestamptz not null default now(),
  kind        text not null check (kind in ('wet', 'dirty', 'mixed')),
  notes       text,
  created_by  bigint references public.members(telegram_id)
);

create index diapers_child_time_idx on public.diapers (child_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- sleep_sessions — ended_at stays NULL while the child is asleep
-- ---------------------------------------------------------------------------
create table public.sleep_sessions (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.children(id) on delete cascade,
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,
  notes       text,
  created_by  bigint references public.members(telegram_id),
  constraint sleep_order_check check (ended_at is null or ended_at > started_at)
);

create index sleep_child_time_idx on public.sleep_sessions (child_id, started_at desc);

-- ---------------------------------------------------------------------------
-- measurements — weight/height/head; feeds the fun charts on the info page
-- ---------------------------------------------------------------------------
create table public.measurements (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references public.children(id) on delete cascade,
  measured_at  date not null default current_date,
  weight_g     integer check (weight_g between 300 and 30000),
  height_cm    numeric(5,1) check (height_cm between 20 and 150),
  head_cm      numeric(4,1) check (head_cm between 20 and 70),
  notes        text,
  created_by   bigint references public.members(telegram_id)
);

create index measurements_child_date_idx on public.measurements (child_id, measured_at desc);

-- ---------------------------------------------------------------------------
-- doctor_visits — calendar of appointments with a preparation checklist
-- ---------------------------------------------------------------------------
create table public.doctor_visits (
  id              uuid primary key default gen_random_uuid(),
  child_id        uuid not null references public.children(id) on delete cascade,
  title           text not null,
  doctor_name     text,
  location        text,
  visit_at        timestamptz not null,
  prep_checklist  jsonb not null default '[]'::jsonb,  -- [{"text": "...", "done": false}]
  notes           text,
  status          text not null default 'planned'
                    check (status in ('planned', 'done', 'cancelled')),
  created_by      bigint references public.members(telegram_id)
);

create index visits_child_time_idx on public.doctor_visits (child_id, visit_at);

-- ---------------------------------------------------------------------------
-- lab_results — files live in the 'files' storage bucket
-- ---------------------------------------------------------------------------
create table public.lab_results (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.children(id) on delete cascade,
  title       text not null,
  taken_at    date not null default current_date,
  file_paths  text[] not null default '{}',
  notes       text,
  created_by  bigint references public.members(telegram_id)
);

-- ---------------------------------------------------------------------------
-- documents — scans of official documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id          uuid primary key default gen_random_uuid(),
  child_id    uuid not null references public.children(id) on delete cascade,
  title       text not null,
  category    text not null default 'other'
                check (category in ('id', 'medical', 'insurance', 'other')),
  file_paths  text[] not null default '{}',
  notes       text,
  created_by  bigint references public.members(telegram_id)
);

-- ---------------------------------------------------------------------------
-- memories — photos, stories and notes to keep
-- ---------------------------------------------------------------------------
create table public.memories (
  id           uuid primary key default gen_random_uuid(),
  child_id     uuid not null references public.children(id) on delete cascade,
  title        text,
  story        text,
  media_paths  text[] not null default '{}',
  happened_at  date not null default current_date,
  created_by   bigint references public.members(telegram_id),
  created_at   timestamptz not null default now()
);

create index memories_child_date_idx on public.memories (child_id, happened_at desc);

-- ---------------------------------------------------------------------------
-- reminders — one-off reminders (visits, custom); delivered by cron + bot
-- ---------------------------------------------------------------------------
create table public.reminders (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('visit', 'custom')),
  ref_id      uuid,                       -- e.g. doctor_visits.id
  fire_at     timestamptz not null,
  message     text not null,
  recipients  bigint[] not null default '{}',  -- empty = all members with notifications on
  sent_at     timestamptz,
  created_by  bigint references public.members(telegram_id)
);

create index reminders_due_idx on public.reminders (fire_at) where sent_at is null;

-- ---------------------------------------------------------------------------
-- feeding_reminder_settings — "remind N minutes after the last feeding"
-- ---------------------------------------------------------------------------
create table public.feeding_reminder_settings (
  child_id          uuid primary key references public.children(id) on delete cascade,
  enabled           boolean not null default false,
  interval_minutes  integer not null default 180 check (interval_minutes between 30 and 720),
  -- quiet hours (local time of the family, e.g. don't ping at night)
  quiet_from        time,
  quiet_to          time,
  last_notified_at  timestamptz
);

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.members                   enable row level security;
alter table public.children                  enable row level security;
alter table public.wellbeing_posts           enable row level security;
alter table public.feedings                  enable row level security;
alter table public.diapers                   enable row level security;
alter table public.sleep_sessions            enable row level security;
alter table public.measurements              enable row level security;
alter table public.doctor_visits             enable row level security;
alter table public.lab_results               enable row level security;
alter table public.documents                 enable row level security;
alter table public.memories                  enable row level security;
alter table public.reminders                 enable row level security;
alter table public.feeding_reminder_settings enable row level security;

-- --- members: everyone sees the family list; only admin manages it ---------
create policy members_select on public.members
  for select using (public.is_member());

create policy members_admin_all on public.members
  for all using (public.is_admin()) with check (public.is_admin());

-- --- public info page: guests get read-only access -------------------------
create policy children_select on public.children
  for select using (public.is_member());

create policy wellbeing_select on public.wellbeing_posts
  for select using (public.is_member());

create policy measurements_select on public.measurements
  for select using (public.is_member());

-- editors write to the info-page tables
create policy children_editor_write on public.children
  for all using (public.is_editor()) with check (public.is_editor());

create policy wellbeing_editor_write on public.wellbeing_posts
  for all using (public.is_editor()) with check (public.is_editor());

create policy measurements_editor_write on public.measurements
  for all using (public.is_editor()) with check (public.is_editor());

-- --- private tables: editors/admins only, guests see nothing ---------------
create policy feedings_editor_all on public.feedings
  for all using (public.is_editor()) with check (public.is_editor());

create policy diapers_editor_all on public.diapers
  for all using (public.is_editor()) with check (public.is_editor());

create policy sleep_editor_all on public.sleep_sessions
  for all using (public.is_editor()) with check (public.is_editor());

create policy visits_editor_all on public.doctor_visits
  for all using (public.is_editor()) with check (public.is_editor());

create policy labs_editor_all on public.lab_results
  for all using (public.is_editor()) with check (public.is_editor());

create policy documents_editor_all on public.documents
  for all using (public.is_editor()) with check (public.is_editor());

create policy memories_editor_all on public.memories
  for all using (public.is_editor()) with check (public.is_editor());

create policy reminders_editor_all on public.reminders
  for all using (public.is_editor()) with check (public.is_editor());

create policy feed_reminder_editor_all on public.feeding_reminder_settings
  for all using (public.is_editor()) with check (public.is_editor());

-- ============================================================================
-- Grants (RLS is the gatekeeper; grants just open the door to the API roles)
-- ============================================================================
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- anon gets nothing: the Mini App always authenticates through the Edge Function
revoke all on all tables in schema public from anon;
