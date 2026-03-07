-- Rollback: drop archivist_sessions table (cascades to all its indexes)

DROP TABLE IF EXISTS archivist_sessions;
