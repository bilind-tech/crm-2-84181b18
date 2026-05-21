-- 037_beleg_einsatztermin.sql
-- Optionaler Einsatztermin / -zeitraum für Angebote und Rechnungen.
-- Wird nur genutzt, wenn der Beleg KEIN Dauerauftrag ist (Frontend-Regel).
-- Beide Spalten im Format YYYY-MM-DD, beide nullable.
-- einsatz_bis ist optional (leer = Ein-Tages-Einsatz).

ALTER TABLE angebot ADD COLUMN einsatz_von TEXT NULL;
ALTER TABLE angebot ADD COLUMN einsatz_bis TEXT NULL;
ALTER TABLE rechnung ADD COLUMN einsatz_von TEXT NULL;
ALTER TABLE rechnung ADD COLUMN einsatz_bis TEXT NULL;