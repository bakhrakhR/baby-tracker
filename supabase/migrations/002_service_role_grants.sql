-- ============================================================================
-- 002 — grant table privileges to service_role
--
-- New Supabase projects no longer auto-grant Data API privileges on existing
-- tables to the built-in roles (the "auto-expose new tables" default is off).
-- Migration 001 explicitly granted `authenticated`, but not `service_role`.
--
-- Edge Functions (e.g. auth-telegram) use the service_role key to look users
-- up in the `members` whitelist, bypassing RLS. service_role has BYPASSRLS,
-- but still needs table-level GRANTs — hence this migration.
--
-- The service_role key lives only server-side (Edge Functions); it is never
-- shipped to the client, so broad access here matches Supabase's intended
-- "admin backend key" model.
-- ============================================================================

grant usage on schema public to service_role;
grant select, insert, update, delete
  on all tables in schema public
  to service_role;
