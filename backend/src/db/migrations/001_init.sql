-- Step 0: nur die Migrations-Buchhaltung selbst.
-- Jeder weitere Step legt eine eigene 00X_*.sql an.

CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT    NOT NULL DEFAULT (datetime('now')),
  name       TEXT    NOT NULL
);
