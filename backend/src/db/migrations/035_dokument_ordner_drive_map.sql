-- Step 35: Mapping CRM-Ordner ↔ Drive-Ordner.
-- Hält die Drive-FileId pro CRM-Ordner. Bleibt auch nach Soft-Delete bestehen
-- (Mapping-Zeile wird beim Löschen nicht entfernt — für späteres Restore).

CREATE TABLE IF NOT EXISTS dokument_ordner_drive_map (
  ordner_id            TEXT PRIMARY KEY REFERENCES dokument_ordner(id) ON DELETE CASCADE,
  drive_folder_id      TEXT NOT NULL,
  drive_pfad           TEXT NOT NULL,
  zuletzt_geprueft_am  TEXT,
  fehler_text          TEXT,
  geloescht_am         TEXT,
  erstellt_am          TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS ix_ordner_drive_folder ON dokument_ordner_drive_map(drive_folder_id);