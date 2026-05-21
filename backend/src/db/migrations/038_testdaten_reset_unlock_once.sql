-- EINMALIGE Freischaltung des Testdaten-Resets auf Anforderung des Nutzers.
-- Eindeutige Versionsnummer (vorherige Datei hatte Konflikt mit 032).
-- Läuft genau einmal. Die Regel „Updates dürfen reset_state nicht
-- zurücksetzen" bleibt für künftige Migrationen verbindlich.
UPDATE reset_state
   SET testdaten_reset_genutzt_am = NULL,
       testdaten_reset_von_user_id = NULL
 WHERE id = 1;