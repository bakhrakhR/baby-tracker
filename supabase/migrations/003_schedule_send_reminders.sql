-- ============================================================================
-- 003 — schedule the send-reminders Edge Function every 5 minutes
--
-- pg_cron fires a pg_net HTTP POST at the function. The function authenticates
-- the caller via the x-cron-secret header; the secret itself lives in Supabase
-- Vault (NOT in this file), so the migration is safe to commit.
--
-- One-time prerequisite (SQL editor, once per project):
--   select vault.create_secret('<the CRON_SECRET value>', 'cron_secret');
-- The same value must be set as the function secret CRON_SECRET.
--
-- Note: not part of test/rls_test.sql — the local harness has no pg_cron/
-- pg_net/vault; this migration is infrastructure, not schema/RLS.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- idempotent re-schedule
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-reminders-every-5min') then
    perform cron.unschedule('send-reminders-every-5min');
  end if;
end $$;

select cron.schedule(
  'send-reminders-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://cggxyzkcwkhqsxyfqttb.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
