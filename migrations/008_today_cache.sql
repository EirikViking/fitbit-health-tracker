CREATE TABLE IF NOT EXISTS today_cache (
    key TEXT PRIMARY KEY,
    json TEXT NOT NULL,
    updatedAt TEXT NOT NULL
);
