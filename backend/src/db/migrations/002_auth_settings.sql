-- Step 1: Auth, Sessions, Lockout, Settings-Store, Audit-Log

CREATE TABLE IF NOT EXISTS app_user (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS auth_session (
  token         TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  hard_expires_at TEXT NOT NULL,
  user_agent    TEXT,
  ip            TEXT
);
CREATE INDEX IF NOT EXISTS idx_auth_session_user ON auth_session(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_session_expires ON auth_session(expires_at);

CREATE TABLE IF NOT EXISTS auth_lockout (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ip          TEXT NOT NULL,
  username    TEXT NOT NULL COLLATE NOCASE,
  fail_count  INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(ip, username)
);

CREATE TABLE IF NOT EXISTS setting (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  encrypted   INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL DEFAULT (datetime('now')),
  user_id    TEXT,
  action     TEXT NOT NULL,
  detail     TEXT,
  ip         TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
