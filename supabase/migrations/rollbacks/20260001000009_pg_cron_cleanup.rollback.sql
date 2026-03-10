-- Rollback: remove the pg_cron cleanup schedule
SELECT cron.unschedule('cleanup-expired-sessions');
