-- Step 12: Dokumente + Upload-Sessions.
-- Dateien werden auf der USB-SSD unter $DATA_DIR/uploads/dokumente/ gespeichert.
-- DB hält nur Metadaten + Pfad. Dedup über sha256 (UNIQUE-Konflikt → vorhandene Datei wiederverwenden).

CREATE TABLE IF NOT EXISTS upload_sessions (
  id            TEXT PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  kunde_id      TEXT REFERENCES kunden(id) ON DELETE SET NULL,
  objekt_id     TEXT REFERENCES objekte(id) ON DELETE SET NULL,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  ablauf_am     TEXT NOT NULL,
  beendet       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_upsess_token ON upload_sessions(token);
CREATE INDEX IF NOT EXISTS ix_upsess_ablauf ON upload_sessions(ablauf_am);

CREATE TABLE IF NOT EXISTS dokumente (
  id                       TEXT PRIMARY KEY,
  titel                    TEXT NOT NULL,
  beschreibung             TEXT,
  typ                      TEXT NOT NULL CHECK (typ IN ('beleg','vertrag','angebot','rechnung','protokoll','bild','sonstiges')),
  kunde_id                 TEXT REFERENCES kunden(id) ON DELETE SET NULL,
  objekt_id                TEXT REFERENCES objekte(id) ON DELETE SET NULL,
  upload_session_id        TEXT REFERENCES upload_sessions(id) ON DELETE SET NULL,
  dateiname                TEXT NOT NULL,
  mime_type                TEXT NOT NULL,
  groesse_bytes            INTEGER NOT NULL,
  sha256                   TEXT NOT NULL,
  storage_path             TEXT NOT NULL,
  dokumentdatum            TEXT,
  betrag                   REAL,
  steuerrelevant           INTEGER NOT NULL DEFAULT 0,
  ust_satz                 REAL,
  faellig_am               TEXT,
  erledigt_am              TEXT,
  quelle                   TEXT NOT NULL DEFAULT 'upload'
                           CHECK (quelle IN ('upload','drag-drop','handy-scan')),
  drive_status             TEXT,
  drive_file_id            TEXT,
  drive_url                TEXT,
  drive_letzter_versuch    TEXT,
  drive_fehler             TEXT,
  hochgeladen_am           TEXT NOT NULL DEFAULT (datetime('now')),
  geloescht_am             TEXT
);
CREATE INDEX IF NOT EXISTS ix_dok_kunde    ON dokumente(kunde_id) WHERE geloescht_am IS NULL;
CREATE INDEX IF NOT EXISTS ix_dok_objekt   ON dokumente(objekt_id) WHERE geloescht_am IS NULL;
CREATE INDEX IF NOT EXISTS ix_dok_faellig  ON dokumente(faellig_am)
  WHERE erledigt_am IS NULL AND geloescht_am IS NULL;
CREATE INDEX IF NOT EXISTS ix_dok_sha      ON dokumente(sha256);
CREATE INDEX IF NOT EXISTS ix_dok_session  ON dokumente(upload_session_id);

-- Deduplikation der angelegten Frist-Benachrichtigungen pro Tag.
CREATE TABLE IF NOT EXISTS dokumente_frist_benachrichtigung_log (
  dokument_id   TEXT NOT NULL,
  tag           TEXT NOT NULL,    -- YYYY-MM-DD
  status        TEXT NOT NULL,    -- 'bald' | 'heute' | 'ueberfaellig'
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (dokument_id, tag, status)
);
