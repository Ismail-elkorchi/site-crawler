export const RESULT_STORE_SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
PRAGMA secure_delete = ON;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
CREATE TABLE IF NOT EXISTS crawl_metadata (
  key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS crawl_records (
  kind TEXT NOT NULL,
  record_id TEXT NOT NULL,
  request_id TEXT,
  url TEXT,
  status_code INTEGER,
  from_url TEXT,
  to_url TEXT,
  created_at TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY (kind, record_id)
) STRICT;
CREATE INDEX IF NOT EXISTS crawl_record_kind_idx
  ON crawl_records(kind, created_at);
CREATE INDEX IF NOT EXISTS crawl_record_request_idx
  ON crawl_records(request_id, kind);
CREATE INDEX IF NOT EXISTS crawl_record_url_idx
  ON crawl_records(url, kind);
CREATE INDEX IF NOT EXISTS crawl_record_status_idx
  ON crawl_records(status_code, kind);
CREATE INDEX IF NOT EXISTS crawl_record_from_idx
  ON crawl_records(from_url, kind);
CREATE INDEX IF NOT EXISTS crawl_record_to_idx
  ON crawl_records(to_url, kind);
`;
