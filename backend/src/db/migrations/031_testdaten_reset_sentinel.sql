-- Sentinel-Tabelle für den einmaligen Testdaten-Reset.
-- Sobald testdaten_reset_genutzt_am gesetzt ist, ist die Funktion dauerhaft gesperrt.
CREATE TABLE IF NOT EXISTS reset_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  testdaten_reset_genutzt_am TEXT NULL,
  testdaten_reset_von_user_id TEXT NULL
);
INSERT OR IGNORE INTO reset_state (id) VALUES (1);
