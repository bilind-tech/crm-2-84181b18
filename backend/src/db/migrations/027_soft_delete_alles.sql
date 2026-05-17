-- Step 27: Einheitliches Soft-Delete-Pattern für alle Hauptobjekte.
-- Spalte `geloescht_am` (ISO datetime, NULL = aktiv). Dateien auf der
-- Festplatte bleiben erhalten — endgültiges Löschen + Datei-Cleanup nur
-- über die separate /datenbank/:tabelle/:id/hart-loeschen Route mit
-- Passwort-Bestätigung.
--
-- HINWEIS: `dokumente.geloescht_am` existiert bereits seit Step 13.

ALTER TABLE kunde                   ADD COLUMN geloescht_am TEXT;
ALTER TABLE objekt                  ADD COLUMN geloescht_am TEXT;
ALTER TABLE ansprechpartner         ADD COLUMN geloescht_am TEXT;
ALTER TABLE notiz                   ADD COLUMN geloescht_am TEXT;
ALTER TABLE angebot                 ADD COLUMN geloescht_am TEXT;
ALTER TABLE rechnung                ADD COLUMN geloescht_am TEXT;
ALTER TABLE protokolle              ADD COLUMN geloescht_am TEXT;
ALTER TABLE steuer_manueller_posten ADD COLUMN geloescht_am TEXT;

CREATE INDEX IF NOT EXISTS ix_kunde_geloescht           ON kunde(geloescht_am);
CREATE INDEX IF NOT EXISTS ix_objekt_geloescht          ON objekt(geloescht_am);
CREATE INDEX IF NOT EXISTS ix_ansprechpartner_geloescht ON ansprechpartner(geloescht_am);
CREATE INDEX IF NOT EXISTS ix_notiz_geloescht           ON notiz(geloescht_am);
CREATE INDEX IF NOT EXISTS ix_angebot_geloescht         ON angebot(geloescht_am);
CREATE INDEX IF NOT EXISTS ix_rechnung_geloescht        ON rechnung(geloescht_am);
CREATE INDEX IF NOT EXISTS ix_protokolle_geloescht      ON protokolle(geloescht_am);
CREATE INDEX IF NOT EXISTS ix_steuer_posten_geloescht   ON steuer_manueller_posten(geloescht_am);