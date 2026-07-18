-- ============================================================================
-- 005 — memories feed: `media` bucket + guest read access (Phase 5)
--
-- Decision (per CLAUDE.md's open question): memories ARE exposed to guests —
-- the photo feed is the main value of the app for grandparents. So:
--   - guests may read `memories` rows (photos metadata, stories);
--   - the private `media` bucket lets every member read (signed URLs),
--     while only editors write.
-- Everything else stays editor-only.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  10485760, -- 10 MB per file
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "media_member_select" on storage.objects
  for select using (bucket_id = 'media' and public.is_member());

create policy "media_editor_insert" on storage.objects
  for insert with check (bucket_id = 'media' and public.is_editor());

create policy "media_editor_update" on storage.objects
  for update
  using (bucket_id = 'media' and public.is_editor())
  with check (bucket_id = 'media' and public.is_editor());

create policy "media_editor_delete" on storage.objects
  for delete using (bucket_id = 'media' and public.is_editor());

-- guests can read the memories feed (editors already have full access via
-- memories_editor_all; policies are OR-ed)
create policy memories_select on public.memories
  for select using (public.is_member());
