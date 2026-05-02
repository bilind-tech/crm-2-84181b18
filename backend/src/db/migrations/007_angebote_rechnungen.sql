-- Step 4: Angebote, Rechnungen, Positionen, Zahlungen.
-- Geld wird intern als INTEGER (Cent) gespeichert → keine Float-Drift.
-- FK-Strategie:
--   kunde_id   → ON DELETE RESTRICT (Soft-Delete-Pfad in Step 3 erkennt das via EXISTS)
--   objekt_id  → ON DELETE SET NULL
--   ansprechpartner_id → ON DELETE SET NULL
--   quell_angebot_id → ON DELETE SET NULL
-- Positionen + Zahlungen → ON DELETE CASCADE.

-- =============================================================================
-- ANGEBOT
-- =============================================================================
CREATE TABLE IF NOT EXISTS angebot (
  id                   TEXT PRIMARY KEY,
  nummer               TEXT NOT NULL UNIQUE,
  kunde_id             TEXT NOT NULL REFERENCES kunde(id) ON DELETE RESTRICT,
  objekt_id            TEXT REFERENCES objekt(id) ON DELETE SET NULL,
  ansprechpartner_id   TEXT REFERENCES ansprechpartner(id) ON DELETE SET NULL,
  titel                TEXT NOT NULL DEFAULT '',
  intro_text           TEXT,
  outro_text           TEXT,
  rabatt_gesamt        REAL NOT NULL DEFAULT 0,        -- %
  steuersatz           REAL NOT NULL DEFAULT 19,       -- %
  gueltig_bis          TEXT,                           -- ISODate
  notizen              TEXT,
  status               TEXT NOT NULL DEFAULT 'entwurf'
                       CHECK (status IN ('entwurf','versendet','angenommen','abgelehnt','abgelaufen')),
  versendet_am         TEXT,
  archiviert           INTEGER NOT NULL DEFAULT 0 CHECK (archiviert IN (0,1)),
  optionen             TEXT,                           -- JSON
  drive                TEXT,                           -- JSON
  erstellt_am          TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_angebot_kunde      ON angebot(kunde_id);
CREATE INDEX IF NOT EXISTS ix_angebot_objekt     ON angebot(objekt_id);
CREATE INDEX IF NOT EXISTS ix_angebot_status     ON angebot(status);
CREATE INDEX IF NOT EXISTS ix_angebot_archiviert ON angebot(archiviert);

CREATE TRIGGER IF NOT EXISTS angebot_touch
AFTER UPDATE ON angebot
FOR EACH ROW
BEGIN
  UPDATE angebot SET geaendert_am = datetime('now') WHERE id = NEW.id;
END;

-- =============================================================================
-- ANGEBOT_POSITION
-- =============================================================================
CREATE TABLE IF NOT EXISTS angebot_position (
  id                    TEXT PRIMARY KEY,
  angebot_id            TEXT NOT NULL REFERENCES angebot(id) ON DELETE CASCADE,
  sort                  INTEGER NOT NULL,
  beschreibung          TEXT NOT NULL DEFAULT '',
  menge                 REAL NOT NULL DEFAULT 1,
  einheit               TEXT NOT NULL DEFAULT 'stk',
  einzelpreis_netto_ct  INTEGER NOT NULL DEFAULT 0,    -- Cent
  steuersatz            REAL NOT NULL DEFAULT 19,
  rabatt                REAL NOT NULL DEFAULT 0,
  modus                 TEXT NOT NULL DEFAULT 'einzel' CHECK (modus IN ('einzel','pauschal')),
  pauschalpreis_netto_ct INTEGER,
  ausfuehrung           TEXT
);

CREATE INDEX IF NOT EXISTS ix_angebot_pos_angebot ON angebot_position(angebot_id, sort);

-- =============================================================================
-- RECHNUNG
-- =============================================================================
CREATE TABLE IF NOT EXISTS rechnung (
  id                   TEXT PRIMARY KEY,
  nummer               TEXT NOT NULL UNIQUE,
  kunde_id             TEXT NOT NULL REFERENCES kunde(id) ON DELETE RESTRICT,
  objekt_id            TEXT REFERENCES objekt(id) ON DELETE SET NULL,
  ansprechpartner_id   TEXT REFERENCES ansprechpartner(id) ON DELETE SET NULL,
  quell_angebot_id     TEXT REFERENCES angebot(id) ON DELETE SET NULL,
  titel                TEXT NOT NULL DEFAULT '',
  intro_text           TEXT,
  outro_text           TEXT,
  rabatt_gesamt        REAL NOT NULL DEFAULT 0,
  steuersatz           REAL NOT NULL DEFAULT 19,
  rechnungsdatum       TEXT NOT NULL,                  -- ISODate
  faelligkeitsdatum    TEXT NOT NULL,                  -- ISODate
  notizen              TEXT,
  status               TEXT NOT NULL DEFAULT 'entwurf'
                       CHECK (status IN ('entwurf','versendet','teilbezahlt','bezahlt','ueberfaellig','storniert')),
  versendet_am         TEXT,
  archiviert           INTEGER NOT NULL DEFAULT 0 CHECK (archiviert IN (0,1)),
  optionen             TEXT,
  drive                TEXT,
  mahnungen            TEXT NOT NULL DEFAULT '[]',     -- JSON-Array
  mahn_pausiert_bis    TEXT,
  inkasso_markiert     INTEGER NOT NULL DEFAULT 0 CHECK (inkasso_markiert IN (0,1)),
  dauerauftrag_id      TEXT,
  erstellt_am          TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_rechnung_kunde      ON rechnung(kunde_id);
CREATE INDEX IF NOT EXISTS ix_rechnung_objekt     ON rechnung(objekt_id);
CREATE INDEX IF NOT EXISTS ix_rechnung_status     ON rechnung(status);
CREATE INDEX IF NOT EXISTS ix_rechnung_archiviert ON rechnung(archiviert);
CREATE INDEX IF NOT EXISTS ix_rechnung_faellig    ON rechnung(faelligkeitsdatum);

CREATE TRIGGER IF NOT EXISTS rechnung_touch
AFTER UPDATE ON rechnung
FOR EACH ROW
BEGIN
  UPDATE rechnung SET geaendert_am = datetime('now') WHERE id = NEW.id;
END;

-- =============================================================================
-- RECHNUNG_POSITION
-- =============================================================================
CREATE TABLE IF NOT EXISTS rechnung_position (
  id                    TEXT PRIMARY KEY,
  rechnung_id           TEXT NOT NULL REFERENCES rechnung(id) ON DELETE CASCADE,
  sort                  INTEGER NOT NULL,
  beschreibung          TEXT NOT NULL DEFAULT '',
  menge                 REAL NOT NULL DEFAULT 1,
  einheit               TEXT NOT NULL DEFAULT 'stk',
  einzelpreis_netto_ct  INTEGER NOT NULL DEFAULT 0,
  steuersatz            REAL NOT NULL DEFAULT 19,
  rabatt                REAL NOT NULL DEFAULT 0,
  modus                 TEXT NOT NULL DEFAULT 'einzel' CHECK (modus IN ('einzel','pauschal')),
  pauschalpreis_netto_ct INTEGER,
  ausfuehrung           TEXT
);

CREATE INDEX IF NOT EXISTS ix_rechnung_pos_rechnung ON rechnung_position(rechnung_id, sort);

-- =============================================================================
-- ZAHLUNG
-- =============================================================================
CREATE TABLE IF NOT EXISTS zahlung (
  id           TEXT PRIMARY KEY,
  rechnung_id  TEXT NOT NULL REFERENCES rechnung(id) ON DELETE CASCADE,
  datum        TEXT NOT NULL,
  betrag_ct    INTEGER NOT NULL CHECK (betrag_ct > 0),
  methode      TEXT NOT NULL DEFAULT 'ueberweisung'
               CHECK (methode IN ('ueberweisung','bar','karte','paypal','sepa','sonstiges')),
  referenz     TEXT,
  notiz        TEXT,
  erstellt_am  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_zahlung_rechnung ON zahlung(rechnung_id);
