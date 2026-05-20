-- Erweitert CHECK-Constraint für modus von angebot_position und rechnung_position
-- um den Wert 'stunden'. SQLite kann CHECK nicht per ALTER ändern → Tabelle neu aufbauen.

-- foreign_keys = OFF wirkt innerhalb einer Transaktion NICHT (SQLite-Limitation).
-- defer_foreign_keys verschiebt FK-Checks ans Transaktionsende und ist in
-- Transaktionen erlaubt — perfekt für Table-Rebuilds.
PRAGMA defer_foreign_keys = ON;

-- Bestehende FTS-/Touch-Trigger referenzieren die Positions-Tabellen. Während
-- DROP/RENAME wären sie kurz ungültig und SQLite bricht die Migration ab
-- ("error in trigger ... no such table"). Deshalb vor dem Rebuild entfernen
-- und am Ende vollständig neu anlegen.
DROP TRIGGER IF EXISTS angebot_au;
DROP TRIGGER IF EXISTS angebot_pos_ai;
DROP TRIGGER IF EXISTS angebot_pos_ad;
DROP TRIGGER IF EXISTS rechnung_au;
DROP TRIGGER IF EXISTS rechnung_pos_ai;
DROP TRIGGER IF EXISTS rechnung_pos_ad;

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
-- FTS-/Touch-Trigger neu anlegen
-- (Spiegel von Migration 008_fts_belege.sql, Abschnitt Positionen).
-- ---------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS angebot_au AFTER UPDATE ON angebot BEGIN
  DELETE FROM suche_idx WHERE entity_typ='angebot' AND entity_id=OLD.id;
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  VALUES (
    'angebot',
    NEW.id,
    NEW.nummer || ' · ' || COALESCE(NEW.titel,''),
    COALESCE((SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),''),
    COALESCE(NEW.titel,'') || ' ' || COALESCE(NEW.intro_text,'') || ' ' || COALESCE(NEW.outro_text,'') || ' ' || COALESCE(NEW.notizen,'') || ' ' ||
      COALESCE((SELECT GROUP_CONCAT(beschreibung, ' ') FROM angebot_position WHERE angebot_id = NEW.id),''),
    '/angebote/$id',
    NEW.id
  );
END;
CREATE TRIGGER IF NOT EXISTS angebot_pos_ai AFTER INSERT ON angebot_position BEGIN
  UPDATE angebot SET geaendert_am = datetime('now') WHERE id = NEW.angebot_id;
END;
CREATE TRIGGER IF NOT EXISTS angebot_pos_ad AFTER DELETE ON angebot_position BEGIN
  UPDATE angebot SET geaendert_am = datetime('now') WHERE id = OLD.angebot_id;
END;
CREATE TRIGGER IF NOT EXISTS rechnung_au AFTER UPDATE ON rechnung BEGIN
  DELETE FROM suche_idx WHERE entity_typ='rechnung' AND entity_id=OLD.id;
  INSERT INTO suche_idx(entity_typ, entity_id, titel, untertitel, body, link_route, link_param_id)
  VALUES (
    'rechnung',
    NEW.id,
    NEW.nummer || ' · ' || COALESCE(NEW.titel,''),
    COALESCE((SELECT COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) FROM kunde WHERE id = NEW.kunde_id),''),
    COALESCE(NEW.titel,'') || ' ' || COALESCE(NEW.intro_text,'') || ' ' || COALESCE(NEW.outro_text,'') || ' ' || COALESCE(NEW.notizen,'') || ' ' ||
      COALESCE((SELECT GROUP_CONCAT(beschreibung, ' ') FROM rechnung_position WHERE rechnung_id = NEW.id),''),
    '/rechnungen/$id',
    NEW.id
  );
END;
CREATE TRIGGER IF NOT EXISTS rechnung_pos_ai AFTER INSERT ON rechnung_position BEGIN
  UPDATE rechnung SET geaendert_am = datetime('now') WHERE id = NEW.rechnung_id;
END;
CREATE TRIGGER IF NOT EXISTS rechnung_pos_ad AFTER DELETE ON rechnung_position BEGIN
  UPDATE rechnung SET geaendert_am = datetime('now') WHERE id = OLD.rechnung_id;
END;