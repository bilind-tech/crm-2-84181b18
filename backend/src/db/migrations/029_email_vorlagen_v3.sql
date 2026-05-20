-- Migration 029: Neuaufbau der Default-E-Mail-Vorlagen (v3).
--
-- Hintergrund: Die bisherigen Default-Vorlagen (.v1/.v2) klangen sehr nach
-- Textbaustein-Generator (Gedankenstriche, „freundliche Erinnerung" im
-- Betreff, zu viele Varianten). Sie werden hier einmalig entfernt, danach
-- spielt der Boot-Seed (siehe seedOrUpdateDefaultVorlagen) die schlankeren
-- v3-Defaults ein.
--
-- WICHTIG: User-eigene Vorlagen haben seed_key IS NULL und werden NIEMALS
-- gelöscht. Einzige Ausnahme: die historisch vom Dashboard angelegte
-- Vorlage „Zahlungserinnerung (freundlich) v2", die wir per exaktem Namen
-- treffen und entfernen (wird durch die neue Standard-Erinnerung ersetzt).

-- 1) Alte Default-Vorlagen entfernen.
DELETE FROM email_vorlage WHERE seed_key LIKE '%.v1' OR seed_key LIKE '%.v2';

-- 2) Dashboard-Seed-Vorlage (kein seed_key) entfernen, falls vorhanden.
DELETE FROM email_vorlage
 WHERE seed_key IS NULL
   AND name = 'Zahlungserinnerung (freundlich) v2';

-- 3) Kontext-CHECK um 'protokoll' erweitern (SQLite: Tabelle neu aufbauen).
CREATE TABLE email_vorlage_new (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  betreff       TEXT NOT NULL DEFAULT '',
  body_html     TEXT NOT NULL DEFAULT '',
  kontext       TEXT NOT NULL DEFAULT 'allgemein'
                CHECK (kontext IN ('rechnung','angebot','mahnung','allgemein','protokoll')),
  ist_standard  INTEGER NOT NULL DEFAULT 0 CHECK (ist_standard IN (0,1)),
  seed_key      TEXT,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO email_vorlage_new (id, name, betreff, body_html, kontext, ist_standard, seed_key, erstellt_am, geaendert_am)
SELECT id, name, betreff, body_html, kontext, ist_standard, seed_key, erstellt_am, geaendert_am
  FROM email_vorlage;

DROP TABLE email_vorlage;
ALTER TABLE email_vorlage_new RENAME TO email_vorlage;

CREATE INDEX IF NOT EXISTS ix_email_vorlage_kontext ON email_vorlage(kontext);
CREATE UNIQUE INDEX IF NOT EXISTS ux_email_vorlage_seedkey
  ON email_vorlage(seed_key) WHERE seed_key IS NOT NULL;