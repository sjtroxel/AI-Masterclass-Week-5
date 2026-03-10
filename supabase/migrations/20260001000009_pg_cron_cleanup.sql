-- Migration: schedule nightly session cleanup via pg_cron
-- Phase 10.4 — deletes expired archivist_sessions rows at midnight UTC daily.
--
-- PREREQUISITE: pg_cron and pg_net must be enabled.
-- Enable them in your Supabase dashboard:
--   Database → Extensions → pg_cron  → Enable
--   Database → Extensions → pg_net   → Enable
--
-- ── Option A — call the Edge Function (HTTP) ────────────────────────────────
-- Replace <project-ref> with your Supabase project ref (subdomain of SUPABASE_URL).
-- The service_role_key is stored in a database setting — set it once with the
-- command below, then reference it via current_setting() in the cron body.
--
-- Step 1 (run once in SQL Editor):
--   ALTER DATABASE postgres SET app.service_role_key = '<your-service-role-key>';
--
-- Step 2 (this migration):
SELECT cron.schedule(
  'cleanup-expired-sessions',           -- unique job name
  '0 0 * * *',                          -- every day at 00:00 UTC
  $$
  SELECT net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/cleanup-expired-sessions',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- ── Option B — run the DELETE directly in pg_cron (simpler, no HTTP) ─────────
-- If you prefer not to deploy the Edge Function, comment out Option A above
-- and uncomment the block below. This runs the SQL directly as a cron job.
-- (pg_net is NOT required for this option — only pg_cron.)
--
-- SELECT cron.schedule(
--   'cleanup-expired-sessions',
--   '0 0 * * *',
--   $$DELETE FROM archivist_sessions WHERE expires_at < now()$$
-- );
