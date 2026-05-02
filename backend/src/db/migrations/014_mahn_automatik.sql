-- Step 13: Mahn-Automatik (Cron-Läufe + Lauf-Einträge).
-- Mahn-Einstellungen selbst leben weiter im settings-Store (Key 'mahnung'),
-- erweitert um modus / cronZeit / nurAnWerktagen.

CREATE TABLE IF NOT EXISTS mahn_laeufe (
  id                TEXT PRIMARY KEY,
  gestartet_am      TEXT NOT NULL DEFAULT (datetime('now')),
  beendet_am        TEXT,
  ausgeloest_durch  TEXT NOT NULL CHECK (ausgeloest_durch IN ('cron','manuell')),
  modus             TEXT NOT NULL CHECK (modus IN ('aus','vorschlag','auto')),
  geprueft          INTEGER NOT NULL DEFAULT 0,
  vorschlaege       INTEGER NOT NULL DEFAULT 0,
  versendet         INTEGER NOT NULL DEFAULT 0,
  uebersprungen     INTEGER NOT NULL DEFAULT 0,
  fehler            INTEGER NOT NULL DEFAULT 0,
  notiz             TEXT
);
CREATE INDEX IF NOT EXISTS ix_mahn_laeufe_gestartet ON mahn_laeufe(gestartet_am DESC);

CREATE TABLE IF NOT EXISTS mahn_lauf_eintraege (
  id              TEXT PRIMARY KEY,
  lauf_id         TEXT NOT NULL REFERENCES mahn_laeufe(id) ON DELETE CASCADE,
  rechnung_id     TEXT NOT NULL,
  rechnung_nr     TEXT,
  stufe           INTEGER NOT NULL,
  aktion          TEXT NOT NULL CHECK (aktion IN ('vorschlag','versendet','uebersprungen','fehler')),
  grund           TEXT,
  email_versand_id TEXT,
  erstellt_am     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_mahnlauf_eintrag_lauf ON mahn_lauf_eintraege(lauf_id);
CREATE INDEX IF NOT EXISTS ix_mahnlauf_eintrag_rechnung ON mahn_lauf_eintraege(rechnung_id);
