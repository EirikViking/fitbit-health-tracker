-- Migration number: 0001 	 2026-01-26T00:00:00.000Z
CREATE TABLE IF NOT EXISTS daily_metrics (
    date TEXT PRIMARY KEY,
    steps INTEGER DEFAULT 0,
    calories_out INTEGER DEFAULT 0,
    distance_km REAL DEFAULT 0,
    floors INTEGER DEFAULT 0,
    azm INTEGER DEFAULT 0,
    resting_hr INTEGER DEFAULT 0,
    avg_hr INTEGER DEFAULT 0,
    max_hr INTEGER DEFAULT 0,
    hrv_rmssd REAL DEFAULT 0,
    hrv_coverage REAL DEFAULT 0,
    sleep_minutes INTEGER DEFAULT 0,
    sleep_time_in_bed INTEGER DEFAULT 0,
    sleep_efficiency INTEGER DEFAULT 0,
    sleep_deep INTEGER DEFAULT 0,
    sleep_light INTEGER DEFAULT 0,
    sleep_rem INTEGER DEFAULT 0,
    sleep_wake INTEGER DEFAULT 0,
    updated_at TEXT
);
