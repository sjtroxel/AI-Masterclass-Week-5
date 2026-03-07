-- Rollback: remove RLS policies and disable RLS on all tables

-- archivist_sessions
DROP POLICY IF EXISTS "Only service role can access archivist sessions" ON archivist_sessions;
ALTER TABLE archivist_sessions DISABLE ROW LEVEL SECURITY;

-- poster_search_events
DROP POLICY IF EXISTS "Only service role can access search events" ON poster_search_events;
ALTER TABLE poster_search_events DISABLE ROW LEVEL SECURITY;

-- posters
DROP POLICY IF EXISTS "Only service role can insert/update posters" ON posters;
DROP POLICY IF EXISTS "Public posters are readable by everyone" ON posters;
ALTER TABLE posters DISABLE ROW LEVEL SECURITY;

-- series
DROP POLICY IF EXISTS "Only service role can modify series" ON series;
DROP POLICY IF EXISTS "Public series are readable by everyone" ON series;
ALTER TABLE series DISABLE ROW LEVEL SECURITY;
