// Repo für das Mapping CRM-Ordner ↔ Drive-Ordner.
// Behält Einträge auch nach Soft-Delete (für Restore + Drift-Check).
import { getDatabase } from "../db/index.js";

export interface OrdnerDriveMap {
  ordnerId: string;
  driveFolderId: string;
  drivePfad: string;
  zuletztGeprueftAm: string | null;
  fehlerText: string | null;
  geloeschtAm: string | null;
}

interface Row {
  ordner_id: string;
  drive_folder_id: string;
  drive_pfad: string;
  zuletzt_geprueft_am: string | null;
  fehler_text: string | null;
  geloescht_am: string | null;
}
const map = (r: Row): OrdnerDriveMap => ({
  ordnerId: r.ordner_id,
  driveFolderId: r.drive_folder_id,
  drivePfad: r.drive_pfad,
  zuletztGeprueftAm: r.zuletzt_geprueft_am,
  fehlerText: r.fehler_text,
  geloeschtAm: r.geloescht_am,
});

export function getMap(ordnerId: string): OrdnerDriveMap | null {
  const r = getDatabase()
    .prepare(`SELECT * FROM dokument_ordner_drive_map WHERE ordner_id = ?`)
    .get(ordnerId) as Row | undefined;
  return r ? map(r) : null;
}

export function setMap(input: {
  ordnerId: string;
  driveFolderId: string;
  drivePfad: string;
}): void {
  getDatabase().prepare(
    `INSERT INTO dokument_ordner_drive_map (ordner_id, drive_folder_id, drive_pfad, zuletzt_geprueft_am, fehler_text, geloescht_am)
       VALUES (?,?,?, datetime('now'), NULL, NULL)
     ON CONFLICT(ordner_id) DO UPDATE SET
       drive_folder_id = excluded.drive_folder_id,
       drive_pfad      = excluded.drive_pfad,
       zuletzt_geprueft_am = datetime('now'),
       fehler_text     = NULL,
       geloescht_am    = NULL,
       geaendert_am    = datetime('now')`,
  ).run(input.ordnerId, input.driveFolderId, input.drivePfad);
}

export function setMapFehler(ordnerId: string, fehler: string | null): void {
  getDatabase().prepare(
    `UPDATE dokument_ordner_drive_map
        SET fehler_text = ?, zuletzt_geprueft_am = datetime('now'), geaendert_am = datetime('now')
      WHERE ordner_id = ?`,
  ).run(fehler, ordnerId);
}

export function markMapGeloescht(ordnerId: string): void {
  getDatabase().prepare(
    `UPDATE dokument_ordner_drive_map
        SET geloescht_am = datetime('now'), geaendert_am = datetime('now')
      WHERE ordner_id = ?`,
  ).run(ordnerId);
}

export function listMaps(includeGeloescht = false): OrdnerDriveMap[] {
  const sql = includeGeloescht
    ? `SELECT * FROM dokument_ordner_drive_map`
    : `SELECT * FROM dokument_ordner_drive_map WHERE geloescht_am IS NULL`;
  return (getDatabase().prepare(sql).all() as Row[]).map(map);
}