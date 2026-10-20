CREATE TABLE IF NOT EXISTS time_saving_settings (
 site_id TEXT PRIMARY KEY REFERENCES sites(id),
 configs TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL
);
