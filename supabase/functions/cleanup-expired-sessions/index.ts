// @ts-nocheck -- Deno runtime: JSR imports and Deno globals are not resolvable by the Node TS server.
/**
 * Edge Function: cleanup-expired-sessions
 *
 * Deletes rows from archivist_sessions where expires_at < now().
 * Sessions are created with a 24-hour TTL (see migration 20260001000003).
 *
 * Security: Callers must supply the SUPABASE_SERVICE_ROLE_KEY as a Bearer token
 * in the Authorization header. The pg_cron schedule below does this automatically.
 * The function is deployed with --no-verify-jwt so Supabase does not check the
 * standard user JWT — we do our own key check instead.
 *
 * Invocation:
 *   curl -X POST https://<project-ref>.supabase.co/functions/v1/cleanup-expired-sessions \
 *        -H "Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>"
 *
 * Scheduling: see supabase/migrations/20260001000009_pg_cron_cleanup.sql
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async (req: Request): Promise<Response> => {
  // ── Auth guard ──────────────────────────────────────────────────────────────
  // Only accept requests that carry the service role key.
  // The pg_cron job supplies this via the Authorization header.
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const incomingKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!serviceRoleKey || incomingKey !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Supabase client (service role — bypasses RLS for maintenance) ──────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceRoleKey,
    { auth: { persistSession: false } },
  );

  // ── Delete expired sessions ─────────────────────────────────────────────────
  // The index on expires_at (from migration 20260001000003) makes this fast.
  const { error, count } = await supabase
    .from('archivist_sessions')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString());

  if (error) {
    console.error('[cleanup-expired-sessions] delete error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const deleted = count ?? 0;
  console.log(`[cleanup-expired-sessions] deleted ${deleted} expired session(s)`);

  return new Response(
    JSON.stringify({ success: true, deleted }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});
