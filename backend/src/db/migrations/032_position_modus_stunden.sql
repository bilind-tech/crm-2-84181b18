-- Erweitert CHECK-Constraint für modus von angebot_position und rechnung_position
-- um den Wert 'stunden'. SQLite kann CHECK nicht per ALTER ändern → Tabelle neu aufbauen.

-- foreign_keys = OFF wirkt innerhalb einer Transaktion NICHT (SQLite-Limitation).
-- defer_foreign_keys verschiebt FK-Checks ans Transaktionsende und ist in
-- Transaktionen erlaubt — perfekt für Table-Rebuilds.
PRAGMA defer_foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- angebot_position
-- ---------------------------------------------------------------------------
CREATE TABLE angebot_position_new (
  id                    TEXT PRIMARY KEY,
  angebot_id            TEXT NOT NULL REFERENCES angebot(id) ON DELETE CASCADE,
  sort                  INTEGER NOT NULL,
  beschreibung          TEXT NOT NULL DEFAULT '',
  menge                 REAL NOT NULL DEFAULT 1,
  einheit               TEXT NOT NULL DEFAULT 'stk',
  einzelpreis_netto_ct  INTEGER NOT NULL DEFAULT 0,
  steuersatz            REAL NOT NULL DEFAULT 19,
  rabatt                REAL NOT NULL DEFAULT 0,
  modus                 TEXT NOT NULL DEFAULT 'einzel' CHECK (modus IN ('einzel','pauschal','stunden')),
  pauschalpreis_netto_ct INTEGER,
  ausfuehrung           TEXT
);

INSERT INTO angebot_position_new (
  id, angebot_id, sort, beschreibung, menge, einheit,
  einzelpreis_netto_ct, steuersatz, rabatt, modus,
  pauschalpreis_netto_ct, ausfuehrung
) SELECT
  id, angebot_id, sort, beschreibung, menge, einheit,
  einzelpreis_netto_ct, steuersatz, rabatt, modus,
  pauschalpreis_netto_ct, ausfuehrung
FROM angebot_position;

DROP TABLE angebot_position;
ALTER TABLE angebot_position_new RENAME TO angebot_position;

CREATE INDEX IF NOT EXISTS ix_angebot_pos_angebot ON angebot_position(angebot_id, sort);

-- ---------------------------------------------------------------------------
-- rechnung_position
-- ---------------------------------------------------------------------------
CREATE TABLE rechnung_position_new (
  id                    TEXT PRIMARY KEY,
  rechnung_id           TEXT NOT NULL REFERENCES rechnung(id) ON DELETE CASCADE,
  sort                  INTEGER NOT NULL,
  beschreibung          TEXT NOT NULL DEFAULT '',
  menge                 REAL NOT NULL DEFAULT 1,
  einheit               TEXT NOT NULL DEFAULT 'stk',
  einzelpreis_netto_ct  INTEGER NOT NULL DEFAULT 0,
  steuersatz            REAL NOT NULL DEFAULT 19,
  rabatt                REAL NOT NULL DEFAULT 0,
  modus                 TEXT NOT NULL DEFAULT 'einzel' CHECK (modus IN ('einzel','pauschal','stunden')),
  pauschalpreis_netto_ct INTEGER,
  ausfuehrung           TEXT
);

INSERT INTO rechnung_position_new (
  id, rechnung_id, sort, beschreibung, menge, einheit,
  einzelpreis_netto_ct, steuersatz, rabatt, modus,
  pauschalpreis_netto_ct, ausfuehrung
) SELECT
  id, rechnung_id, sort, beschreibung, menge, einheit,
  einzelpreis_netto_ct, steuersatz, rabatt, modus,
  pauschalpreis_netto_ct, ausfuehrung
FROM rechnung_position;

DROP TABLE rechnung_position;
ALTER TABLE rechnung_position_new RENAME TO rechnung_position;

CREATE INDEX IF NOT EXISTS ix_rechnung_pos_rechnung ON rechnung_position(rechnung_id, sort);

-- ---------------------------------------------------------------------------
-- FTS-/Touch-Trigger, die durch DROP TABLE mit verschwunden sind, neu anlegen
-- (Spiegel von Migration 008_fts_belege.sql, Abschnitt Positionen).
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS angebot_pos_ai AFTER INSERT ON angebot_position BEGIN
  UPDATE angebot SET geaendert_am = datetime('now') WHERE id = NEW.angebot_id;
END;
CREATE TRIGGER IF NOT EXISTS angebot_pos_ad AFTER DELETE ON angebot_position BEGIN
  UPDATE angebot SET geaendert_am = datetime('now') WHERE id = OLD.angebot_id;
END;
CREATE TRIGGER IF NOT EXISTS rechnung_pos_ai AFTER INSERT ON rechnung_position BEGIN
  UPDATE rechnung SET geaendert_am = datetime('now') WHERE id = NEW.rechnung_id;
END;
CREATE TRIGGER IF NOT EXISTS rechnung_pos_ad AFTER DELETE ON rechnung_position BEGIN
  UPDATE rechnung SET geaendert_am = datetime('now') WHERE id = OLD.rechnung_id;
END;