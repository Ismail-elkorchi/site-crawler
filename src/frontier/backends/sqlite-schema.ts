export const FRONTIER_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
PRAGMA secure_delete = ON;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
CREATE TABLE IF NOT EXISTS frontier_requests (
  id TEXT PRIMARY KEY,
  unique_key TEXT NOT NULL UNIQUE,
  request_json TEXT NOT NULL,
  state TEXT NOT NULL,
  priority INTEGER NOT NULL,
  depth INTEGER NOT NULL,
  origin TEXT NOT NULL,
  seed_url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  available_at INTEGER NOT NULL DEFAULT 0,
  lease_id TEXT,
  lease_expires_at INTEGER,
  reason TEXT
) STRICT;
CREATE INDEX IF NOT EXISTS frontier_ready_idx
  ON frontier_requests(state, available_at, priority DESC, depth ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS frontier_origin_ready_idx
  ON frontier_requests(origin, state, available_at, priority DESC, depth ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS frontier_seed_idx
  ON frontier_requests(seed_url);
CREATE INDEX IF NOT EXISTS frontier_lease_idx
  ON frontier_requests(state, lease_expires_at);
`;
