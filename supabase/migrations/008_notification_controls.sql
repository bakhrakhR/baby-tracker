-- ============================================================================
-- 008 — flexible notification controls
--
-- 1. `photo` reminder kind: editors adding a memory with photos enqueue a
--    reminder that send-reminders delivers to GUESTS (grandparents) with
--    notifications enabled — the one notification guests do receive.
-- 2. set_my_notifications(): every member may flip their OWN
--    notifications_enabled flag. A plain self-UPDATE policy would let an
--    editor rewrite any column of their row (including role), so the flag is
--    exposed through a SECURITY DEFINER function that touches nothing else.
--    Semantics per role: parents — feeding/visit reminders; guests — new
--    photo notifications.
-- 3. members_self_select: everyone may read their own row (needed to render
--    the toggle; guests lost roster access in 007 and kept nothing).
-- ============================================================================

alter table public.reminders drop constraint reminders_kind_check;
alter table public.reminders
  add constraint reminders_kind_check check (kind in ('visit', 'custom', 'photo'));

create or replace function public.set_my_notifications(enabled boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.members
  set notifications_enabled = enabled
  where telegram_id = public.tg_id();
$$;

revoke all on function public.set_my_notifications(boolean) from public;
grant execute on function public.set_my_notifications(boolean) to authenticated;

create policy members_self_select on public.members
  for select using (telegram_id = public.tg_id());
