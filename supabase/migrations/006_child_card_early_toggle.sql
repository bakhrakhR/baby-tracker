-- ============================================================================
-- 006 — child "визитка" fields + early-reminder toggle
--
-- children: birth time and national ID number (teudat zehut) for the profile
-- card; the photo uses the existing photo_path (media bucket, member-readable
-- since 005).
--
-- feeding_reminder_settings: early_reminder toggles the 30-minute heads-up
-- (stage 1/2); the 5-minute final call always fires while reminders are on.
-- ============================================================================

alter table public.children
  add column if not exists birth_time time,
  add column if not exists id_number text;

alter table public.feeding_reminder_settings
  add column if not exists early_reminder boolean not null default true;
