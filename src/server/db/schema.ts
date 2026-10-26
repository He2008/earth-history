export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS research_tasks (
  id            TEXT PRIMARY KEY,
  status        TEXT NOT NULL,
  place_name    TEXT NOT NULL,
  place_json    TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL,
  direction     TEXT NOT NULL,
  extra_instruction TEXT,
  plan_json     TEXT,
  timeline_json TEXT NOT NULL DEFAULT '[]',
  report_md     TEXT DEFAULT '',
  share_token   TEXT UNIQUE,
  error_code TEXT, error_msg TEXT,
  cost_json     TEXT,
  timings_json  TEXT,
  feedback      INTEGER,
  created_at INTEGER, updated_at INTEGER, finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON research_tasks(status, updated_at);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL REFERENCES research_tasks(id),
  idx   INTEGER,
  stage TEXT NOT NULL,
  title TEXT, url TEXT, url_norm TEXT,
  snippet TEXT, published_at TEXT,
  engine TEXT,
  score REAL, fetched_chars INTEGER, quote TEXT
);
CREATE INDEX IF NOT EXISTS idx_sources_task ON sources(task_id, stage);

CREATE TABLE IF NOT EXISTS research_cache (
  cache_key TEXT PRIMARY KEY,
  task_id   TEXT NOT NULL,
  created_at INTEGER, expires_at INTEGER
);
`;
