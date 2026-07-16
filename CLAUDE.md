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

| Role   | Info page (children, wellbeing_posts, measurements) | All other data | members table |
|--------|------------------------------------------------------|----------------|---------------|
| admin  | read/write | read/write | manage |
| editor | read/write | read/write | read only |
| guest  | read only  | no access  | no access |
| anon   | nothing — every request must carry the JWT |||

## Repository layout

```
supabase/migrations/001_init.sql   # schema + RLS + grants (DONE, tested)
test/rls_test.sql                  # local test harness: emulates Supabase
                                   # auth.jwt() + roles, 13 assertions
supabase/functions/                # (Phase 1+) auth-telegram, send-reminders
web/                               # (Phase 1+) Svelte Mini App
```

Run tests: `sudo -u postgres psql -v ON_ERROR_STOP=1 -f test/rls_test.sql`
(requires local PostgreSQL 15+; creates throwaway DB `babytest`).
Note: RLS silently filters rows on UPDATE/DELETE (0 rows affected, no error) —
tests assert row counts, not exceptions, for those cases.

## Schema notes

- Mixed feeding: single `feedings` table with two branches enforced by
  `feeding_branch_check` — breast (breast_side, duration_min) vs bottle
  (amount_ml, milk_type). UI: two big buttons on the home screen.
- `sleep_sessions.ended_at IS NULL` means "asleep right now".
- `doctor_visits.prep_checklist` is jsonb: `[{"text": "...", "done": false}]`.
- `children` is a table (not a single row) to allow siblings later.

## Roadmap

1. ✅ Phase 0 — DB schema + RLS + test suite
2. Phase 1 — `auth-telegram` Edge Function; Svelte app skeleton; home screen
   with two-tap feeding logging (one-handed 4 a.m. use is THE core scenario:
   big buttons, minimal typing, auto-filled timestamps)
3. Phase 2 — sleep, diapers, measurements; public info page with charts;
   guest mode
4. Phase 3 — doctor visits + reminders (`send-reminders`, pg_cron), interval
   feeding reminders with quiet hours
5. Phase 4 — files: lab results & documents (Storage, client-side image
   compression, signed URLs, storage policies)
6. Phase 5 — memories feed (photos, stories)

## UX principles

- Daily-driver ergonomics over feature count: the most frequent action must
  take ≤2 taps from app open.
- History under collapsible sections (spoilers); today's data first.
- Respect Telegram theme (light/dark) via WebApp SDK CSS variables.
- Design references are produced by the owner in Claude Design and will be
  provided as screenshots/HTML — extract the design system (colors, radii,
  typography) from them, adapt structure to real data.
