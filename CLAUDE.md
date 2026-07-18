# Baby Tracker — Telegram Mini App

Family app for tracking a newborn: feedings, sleep, diapers, growth, doctor
visits, lab results, documents, and keepsake memories. Used daily by two
parents (editors), with read-only guest access for grandparents.

## Project rules

- You are the lead and sole developer. Make architectural decisions,
  recommend improvements proactively, ask when requirements are ambiguous.
- Never deliver untested code. Run the SQL test suite after any schema
  change; add tests for new features.
- Follow current industry standards and conventions.
- UI language: Russian. Code, comments, commit messages: English.
- This is family data — treat RLS policies and auth as security-critical.
  Any new table MUST have RLS enabled and policies matching the access model.

## Architecture (decided, do not revisit without reason)

- **Frontend:** Svelte + Vite SPA, deployed as static files to GitHub Pages,
  opened as a Telegram Mini App. Bundle size matters — instant open in Telegram.
  Use Telegram WebApp SDK: theme colors, haptic feedback, BackButton.
- **Backend:** Supabase — Postgres + RLS, Storage, Edge Functions, pg_cron.
  Separate project from any other bots (data isolation, own free-tier quota).
- **Auth:** Mini App sends Telegram `initData` to Edge Function
  `auth-telegram`, which validates the HMAC signature, looks the user up in
  the `members` whitelist table, and issues a Supabase-compatible JWT with
  claims `{ role: "authenticated", app_role: "admin"|"editor"|"guest",
  tg_id: <telegram id> }`. All RLS policies read these claims via helper
  functions `app_role()`, `tg_id()`, `is_editor()`, `is_admin()`, `is_member()`.
- **Notifications:** Edge Function `send-reminders` on pg_cron (every 5 min)
  sends Telegram bot messages (DM to each member with notifications enabled).
  Two kinds: one-off rows in `reminders` (visits, custom) and interval-based
  feeding reminders ("N minutes after the last feeding") configured in
  `feeding_reminder_settings`, honoring quiet hours.
- **Files:** Supabase Storage, two buckets: `media` (photos/memories) and
  `files` (lab results, document scans). Compress images client-side before
  upload (free tier = 1 GB). Access via signed URLs; bucket policies must
  mirror the table access model (guests: only child profile photo & memories
  media if exposed on the info page — decide when implementing Phase 4).

## Access model

| Role   | Info page (children, wellbeing_posts, measurements, memories + media bucket) | All other data | members table |
|--------|------------------------------------------------------|----------------|---------------|
| admin  | read/write | read/write | manage |
| editor | read/write | read/write | read only |
| guest  | read only  | no access  | no access |
| anon   | nothing — every request must carry the JWT |||

## Repository layout

```
supabase/migrations/               # 001 schema+RLS … 006 child card fields
supabase/functions/auth-telegram/  # initData → JWT (initdata.ts is unit-tested)
supabase/functions/send-reminders/ # cron delivery (logic.ts is unit-tested)
web/                               # Svelte 5 + Vite Mini App (own package.json)
scripts/                           # auth smoke test, dev initData, data backup
test/rls_test.sql                  # SQL harness: emulates Supabase auth + roles
test/*_test.ts                     # node --test suites for function logic
backups/                           # local data dumps (git-ignored, repo is public)
```

Run tests:
- `npm run test:functions` (repo root; node --test, no infra needed)
- `sudo -u postgres psql -v ON_ERROR_STOP=1 -f test/rls_test.sql` (needs local
  PostgreSQL 15+; creates throwaway DB `babytest`). RLS silently filters rows
  on UPDATE/DELETE (0 rows, no error) — those tests assert row counts.

Deploy: push to `main` → GitHub Actions builds `web/` to GitHub Pages at
https://bakhrakhr.github.io/baby-tracker/. Edge Functions deploy via
`npx supabase functions deploy <name>`; migrations via `npx supabase db push`.

## Schema notes

- Mixed feeding: single `feedings` table with two branches enforced by
  `feeding_branch_check` — breast (breast_side, duration_min) vs bottle
  (amount_ml, milk_type). UI: two big buttons on the home screen.
- `sleep_sessions.ended_at IS NULL` means "asleep right now".
- `doctor_visits.prep_checklist` is jsonb: `[{"text": "...", "done": false}]`.
- `children` is a table (not a single row) to allow siblings later.

## Roadmap — ALL PHASES SHIPPED (as of 2026-07-18)

1. ✅ Phase 0 — DB schema + RLS + test suite
2. ✅ Phase 1 — `auth-telegram`; Svelte app; two-tap feeding logging with
   editing, undo, history; silent re-auth on 401
3. ✅ Phase 2 — sleep (live toggle), diapers, measurements, mood posts;
   guest info page; in-app family management (admin)
4. ✅ Phase 3 — doctor visits with checklists; `send-reminders` on pg_cron
   (5 min): visit reminders + two-stage feeding reminders (30/5 min leads,
   early stage toggleable) with quiet hours
5. ✅ Phase 4 — lab results & documents (`files` bucket, client-side image
   compression, signed URLs)
6. ✅ Phase 5 — memories feed (`media` bucket); DECIDED: memories and media
   are guest-readable (grandparent feed); child profile card (photo, birth
   date/time, teudat zehut) via tap on the name

Post-roadmap notes: tab data uses a session-lifetime stale-while-revalidate
cache (project region ap-southeast-1 → ~350ms RTT; a Frankfurt migration is
prepared for — see scripts/backup-data.mjs — but not performed).

## UX principles

- Daily-driver ergonomics over feature count: the most frequent action must
  take ≤2 taps from app open.
- History under collapsible sections (spoilers); today's data first.
- Respect Telegram theme (light/dark) via WebApp SDK CSS variables.
- Design references are produced by the owner in Claude Design and will be
  provided as screenshots/HTML — extract the design system (colors, radii,
  typography) from them, adapt structure to real data.
