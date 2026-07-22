export const WORKER_COORDINATION_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
PRAGMA secure_delete = ON;
PRAGMA busy_timeout = 5000;
PRAGMA trusted_schema = OFF;
CREATE TABLE IF NOT EXISTS crawler_workers (
  worker_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  host TEXT NOT NULL,
  pid INTEGER NOT NULL,
  protocol_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  status TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS crawler_workers_run_idx
  ON crawler_workers(run_id, status, heartbeat_at);
CREATE TABLE IF NOT EXISTS origin_state (
  origin TEXT PRIMARY KEY,
  next_allowed_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS origin_permits (
  permit_id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  FOREIGN KEY(worker_id) REFERENCES crawler_workers(worker_id)
) STRICT;
CREATE INDEX IF NOT EXISTS origin_permits_origin_idx
  ON origin_permits(origin, expires_at);
CREATE INDEX IF NOT EXISTS origin_permits_worker_idx
  ON origin_permits(worker_id, expires_at);
`;
