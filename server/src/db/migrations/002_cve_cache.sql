-- ArcX Schema v002 — CVE cache & CISA KEV tables
-- Applied by migrate.js.

CREATE TABLE IF NOT EXISTS cve_cache (
  cve_id               TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  category             TEXT NOT NULL,
  severity             TEXT NOT NULL,
  cvss                 REAL NOT NULL,
  description          TEXT NOT NULL,
  remediation          TEXT NOT NULL,
  mitre_attack         TEXT DEFAULT '[]',
  ioc_indicators       TEXT DEFAULT '[]',
  source               TEXT NOT NULL,
  is_actively_exploited INTEGER NOT NULL DEFAULT 0,
  raw_data             TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cve_cache_severity   ON cve_cache(severity);
CREATE INDEX IF NOT EXISTS idx_cve_cache_cvss       ON cve_cache(cvss);
CREATE INDEX IF NOT EXISTS idx_cve_cache_updated    ON cve_cache(updated_at);
CREATE INDEX IF NOT EXISTS idx_cve_cache_exploited  ON cve_cache(is_actively_exploited);

CREATE TABLE IF NOT EXISTS cisa_kev (
  cve_id               TEXT PRIMARY KEY,
  vendor_project       TEXT,
  product              TEXT,
  vulnerability_name   TEXT,
  date_added           TEXT,
  short_description    TEXT,
  required_action      TEXT,
  due_date             TEXT,
  notes                TEXT,
  synced_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cisa_kev_cve        ON cisa_kev(cve_id);
CREATE INDEX IF NOT EXISTS idx_cisa_kev_date       ON cisa_kev(date_added);
