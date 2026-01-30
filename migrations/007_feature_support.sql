-- Feature capability cache
CREATE TABLE IF NOT EXISTS feature_support (
    feature TEXT PRIMARY KEY,
    supported INTEGER NOT NULL,
    lastStatus INTEGER,
    lastChecked TEXT,
    note TEXT
);
