-- Body metrics table
CREATE TABLE IF NOT EXISTS body_metrics (
    date TEXT PRIMARY KEY,
    weightKg REAL,
    fatPct REAL,
    bmi REAL,
    updatedAt TEXT,
    raw TEXT
);

CREATE INDEX IF NOT EXISTS idx_body_metrics_date ON body_metrics(date);
