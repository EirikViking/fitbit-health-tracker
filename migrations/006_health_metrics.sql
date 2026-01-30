-- Daily health metrics (capability-driven)
CREATE TABLE IF NOT EXISTS health_metrics_daily (
    date TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL,
    unit TEXT,
    json TEXT,
    updatedAt TEXT,
    PRIMARY KEY (date, metric)
);

CREATE INDEX IF NOT EXISTS idx_health_metrics_metric ON health_metrics_daily(metric);
