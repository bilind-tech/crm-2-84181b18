-- Step 6: E-Mail (SMTP) + Google-Drive-Upload-Queue.
-- Alles geht durch den Settings-Encrypt-Pfad (siehe settings/store.ts) — keine Plaintext-Tokens hier.

-- =============================================================================
-- E-MAIL VORLAGEN
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_vorlage (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  betreff       TEXT NOT NULL DEFAULT '',
  body_html     TEXT NOT NULL DEFAULT '',
  kontext       TEXT NOT NULL DEFAULT 'allgemein'
                CHECK (kontext IN ('rechnung','angebot','mahnung','allgemein')),
  ist_standard  INTEGER NOT NULL DEFAULT 0 CHECK (ist_standard IN (0,1)),
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_email_vorlage_kontext ON email_vorlage(kontext);

-- =============================================================================
-- E-MAIL SIGNATUREN
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_signatur (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  html          TEXT NOT NULL DEFAULT '',
  ist_standard  INTEGER NOT NULL DEFAULT 0 CHECK (ist_standard IN (0,1)),
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- E-MAIL VERSAND-QUEUE
-- =============================================================================
CREATE TABLE IF NOT EXISTS email_versand (
  id                   TEXT PRIMARY KEY,
  empfaenger_to        TEXT NOT NULL,
  empfaenger_cc        TEXT,
  empfaenger_bcc       TEXT,
  betreff              TEXT NOT NULL DEFAULT '',
  body_html            TEXT NOT NULL DEFAULT '',
  beleg_art            TEXT CHECK (beleg_art IN ('angebot','rechnung')),
  beleg_id             TEXT,
  vorlage_id           TEXT,
  signatur_id          TEXT,
  idempotenz_key       TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','sending','gesendet','fehler','manuell')),
  versuche             INTEGER NOT NULL DEFAULT 0,
  naechster_versuch_at TEXT,
  versendet_am         TEXT,
  fehler_text          TEXT,
  message_id           TEXT,
  erstellt_am          TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_email_versand_status ON email_versand(status, naechster_versuch_at);
CREATE INDEX IF NOT EXISTS ix_email_versand_beleg  ON email_versand(beleg_art, beleg_id);

-- =============================================================================
-- DRIVE-UPLOAD QUEUE
-- =============================================================================
CREATE TABLE IF NOT EXISTS drive_upload_queue (
  id                   TEXT PRIMARY KEY,
  beleg_art            TEXT NOT NULL CHECK (beleg_art IN ('angebot','rechnung')),
  beleg_id             TEXT NOT NULL,
  datei_name           TEXT NOT NULL,
  pdf_sha256           TEXT NOT NULL,
  idempotenz_key       TEXT NOT NULL UNIQUE,
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','running','erfolg','fehler','manuell')),
  versuche             INTEGER NOT NULL DEFAULT 0,
  naechster_versuch_at TEXT,
  drive_file_id        TEXT,
  drive_web_link       TEXT,
  fehler_text          TEXT,
  abgeschlossen_am     TEXT,
  erstellt_am          TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_drive_queue_status ON drive_upload_queue(status, naechster_versuch_at);
CREATE INDEX IF NOT EXISTS ix_drive_queue_beleg  ON drive_upload_queue(beleg_art, beleg_id);
