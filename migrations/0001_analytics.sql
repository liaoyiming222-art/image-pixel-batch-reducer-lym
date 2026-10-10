CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tool TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  received_at INTEGER NOT NULL,
  day TEXT NOT NULL,
  version TEXT NOT NULL,
  props TEXT NOT NULL,
  effective INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_day ON events(day);
CREATE INDEX IF NOT EXISTS events_user ON events(user_id, received_at);
CREATE INDEX IF NOT EXISTS events_session ON events(session_id);
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, first_effective INTEGER);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS daily_metrics (day TEXT NOT NULL, tool TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(day, tool, metric));
CREATE TABLE IF NOT EXISTS cloudflare_daily (day TEXT NOT NULL, source TEXT NOT NULL, metric TEXT NOT NULL, value REAL NOT NULL, fetched_at INTEGER NOT NULL, PRIMARY KEY(day, source, metric));
CREATE TABLE IF NOT EXISTS archive_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, started_at INTEGER NOT NULL, finished_at INTEGER, status TEXT NOT NULL, message TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, window INTEGER NOT NULL, count INTEGER NOT NULL);
