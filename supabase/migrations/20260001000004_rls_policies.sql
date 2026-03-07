-- Migration: Row Level Security policies for all tables
-- Phase 1.6
--
-- posters:              anon can SELECT; only service_role can INSERT/UPDATE/DELETE
-- series:               anon can SELECT (same pattern as posters)
-- poster_search_events: service_role only (contains PII-adjacent query data)
-- archivist_sessions:   service_role only (contains conversation history)

-- ── series ────────────────────────────────────────────────────────────────────
ALTER TABLE series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public series are readable by everyone"
  ON series FOR SELECT USING (true);

CREATE POLICY "Only service role can modify series"
  ON series FOR ALL USING (auth.role() = 'service_role');

-- ── posters ───────────────────────────────────────────────────────────────────
ALTER TABLE posters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public posters are readable by everyone"
  ON posters FOR SELECT USING (true);

CREATE POLICY "Only service role can insert/update posters"
  ON posters FOR ALL USING (auth.role() = 'service_role');

-- ── poster_search_events ──────────────────────────────────────────────────────
ALTER TABLE poster_search_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can access search events"
  ON poster_search_events FOR ALL USING (auth.role() = 'service_role');

-- ── archivist_sessions ────────────────────────────────────────────────────────
ALTER TABLE archivist_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can access archivist sessions"
  ON archivist_sessions FOR ALL USING (auth.role() = 'service_role');
