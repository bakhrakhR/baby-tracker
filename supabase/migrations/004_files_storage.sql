-- ============================================================================
-- 004 — private `files` bucket for lab results and document scans (Phase 4)
--
-- Access mirrors the app's role model: editors (admin/editor) get full
-- access, guests and anon get nothing — matching the table policies on
-- lab_results/documents. Files are served to the client via short-lived
-- signed URLs created by an authenticated editor session.
--
-- The `media` bucket (photos/memories) comes with Phase 5, where guest
-- exposure gets decided.
--
-- Note: not covered by test/rls_test.sql — the local harness has no storage
-- schema. The policies reuse public.is_editor(), which the suite does test.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'files',
  'files',
  false,
  10485760, -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- storage.objects already has RLS enabled by Supabase.
create policy "files_editor_all" on storage.objects
  for all
  using (bucket_id = 'files' and public.is_editor())
  with check (bucket_id = 'files' and public.is_editor());
