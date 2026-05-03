// DB-Zugriff für backup_history.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import type {
  BackupCategory,
  BackupRow,
  BackupStatus,
  BackupTrigger,
} from "./types.js";

interface Raw {
  id: string;
  filename: string;
  category: string;
  trigger: string;
  size_bytes: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  sha256: string | null;
  schema_version: number | null;
  app_version: string | null;
  error: string | null;
  drive_status: string | null;
  drive_file_id: string | null;
  drive_error: string | null;
  drive_synced_at: string | null;
}

function map(r: Raw): BackupRow {
  return {
    id: r.id,
    filename: r.filename,
    category: r.category as BackupCategory,
    trigger: r.trigger as BackupTrigger,
    sizeBytes: r.size_bytes,
    status: r.status as BackupStatus,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    sha256: r.sha256,
    schemaVersion: r.schema_version,
    appVersion: r.app_version,
    error: r.error,
    driveStatus: ((r.drive_status as BackupRow["driveStatus"]) ?? "skip") as BackupRow["driveStatus"],
    driveFileId: r.drive_file_id,
    driveError: r.drive_error,
    driveSyncedAt: r.drive_synced_at,
  };
}

export function newBackupId(): string {
  return crypto.randomUUID();
}

export function insertStarted(opts: {
  id: string;
  filename: string;
  category: BackupCategory;
  trigger: BackupTrigger;
  appVersion: string;
  schemaVersion: number;
}): void {
  getDatabase()
    .prepare(
      `INSERT INTO backup_history (id, filename, category, trigger, size_bytes, status, started_at, app_version, schema_version)
       VALUES (?, ?, ?, ?, 0, 'in_progress', datetime('now'), ?, ?)`,
    )
    .run(opts.id, opts.filename, opts.category, opts.trigger, opts.appVersion, opts.schemaVersion);
}

export function markSuccess(id: string, sizeBytes: number, sha256: string): void {
  getDatabase()
    .prepare(
      `UPDATE backup_history
         SET status = 'success', completed_at = datetime('now'), size_bytes = ?, sha256 = ?
       WHERE id = ?`,
    )
    .run(sizeBytes, sha256, id);
}

export function markFailed(id: string, error: string): void {
  getDatabase()
    .prepare(
      `UPDATE backup_history
         SET status = 'failed', completed_at = datetime('now'), error = ?
       WHERE id = ?`,
    )
    .run(error.slice(0, 1000), id);
}

export function listVisible(): BackupRow[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM backup_history
        WHERE status = 'success' AND completed_at IS NOT NULL
        ORDER BY started_at DESC`,
    )
    .all() as Raw[];
  return rows.map(map);
}

export function listInProgress(): BackupRow[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM backup_history WHERE status = 'in_progress' ORDER BY started_at DESC`,
    )
    .all() as Raw[];
  return rows.map(map);
}

export function getById(id: string): BackupRow | undefined {
  const r = getDatabase()
    .prepare(`SELECT * FROM backup_history WHERE id = ?`)
    .get(id) as Raw | undefined;
  return r ? map(r) : undefined;
}

export function listByCategory(cat: BackupCategory): BackupRow[] {
  const rows = getDatabase()
    .prepare(
      `SELECT * FROM backup_history
        WHERE category = ? AND status = 'success' AND completed_at IS NOT NULL
        ORDER BY started_at DESC`,
    )
    .all(cat) as Raw[];
  return rows.map(map);
}

export function deleteRow(id: string): void {
  getDatabase().prepare(`DELETE FROM backup_history WHERE id = ?`).run(id);
}

/** Beim Boot: Einträge die noch "in_progress" stehen sind Geister
 *  (Pi wurde während eines Backups hart neu gestartet). Auf "failed" setzen. */
export function reapZombies(): number {
  return getDatabase()
    .prepare(
      `UPDATE backup_history
         SET status = 'failed',
             completed_at = datetime('now'),
             error = 'Backup wurde durch Neustart abgebrochen'
       WHERE status = 'in_progress'`,
    )
    .run().changes;
}
