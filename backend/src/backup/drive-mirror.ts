// =============================================================================
// Drive-Mirror für Backups
// =============================================================================
// Wird nach jedem erfolgreichen Backup von create.ts aufgerufen (fire-and-forget).
// Lädt das fertige tar.gz-Archiv per Stream nach
//   mycleancenter.cm/Backups/{YYYY}/{MM}/<dateiname>
// hoch und aktualisiert backup_history.drive_status.
//
// Drive-Fehler markieren das lokale Backup NIEMALS als failed.
// =============================================================================
import { createReadStream, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import * as tar from "tar";
import { getDatabase } from "../db/index.js";
import { audit } from "../auth/audit.js";
import { categoryDir } from "./paths.js";
import { getById } from "./repo.js";
import { ensureFolderPath, uploadStream } from "../drive/folders.js";
import { loadDriveSettings } from "../drive/oauth.js";
import { getSetting } from "../settings/store.js";
import { BackupPlanSchema } from "../settings/schemas.js";
import { config } from "../config.js";
import type { BackupCategory } from "./types.js";

function setDriveStatus(
  id: string,
  status: "skip" | "pending" | "synced" | "error",
  fileId: string | null = null,
  error: string | null = null,
): void {
  getDatabase()
    .prepare(
      `UPDATE backup_history
         SET drive_status = ?,
             drive_file_id = COALESCE(?, drive_file_id),
             drive_error = ?,
             drive_synced_at = CASE WHEN ? = 'synced' THEN datetime('now') ELSE drive_synced_at END
       WHERE id = ?`,
    )
    .run(status, fileId, error?.slice(0, 500) ?? null, status, id);
}

function isMirrorEnabled(): boolean {
  try {
    const cfg = BackupPlanSchema.parse(getSetting("backup") ?? {});
    return cfg.driveUploadEnabled;
  } catch {
    return false;
  }
}

function isDriveConnected(): boolean {
  try {
    const s = loadDriveSettings();
    return !!s.refreshTokenIsSet && !!s.clientSecretIsSet;
  } catch {
    return false;
  }
}

function backupTargetFolder(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `Backups/${yyyy}/${mm}`;
}

/**
 * Erzeugt eine schlüssel-freie Kopie des Backups für den Drive-Upload.
 * Master-Key bleibt NUR auf dem Pi. Wer aus Drive restored, muss SMTP-Passwort
 * und Google-Drive-Token einmalig neu eingeben — Restore-UI erklärt das.
 */
async function buildKeyfreeArchive(srcArchive: string, backupId: string): Promise<string> {
  const tmpDir = path.join(config.backupsTmpDir, `drive-${backupId}`);
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
  await tar.extract({ file: srcArchive, cwd: tmpDir });
  // Master-Key entfernen
  const keysDir = path.join(tmpDir, "keys");
  if (existsSync(keysDir)) rmSync(keysDir, { recursive: true, force: true });
  const out = path.join(config.backupsTmpDir, `drive-${backupId}.tar.gz`);
  await tar.create(
    { gzip: { level: 6 }, file: out, cwd: tmpDir, portable: true },
    ["manifest.json", "db", "uploads"].filter((p) => existsSync(path.join(tmpDir, p))),
  );
  rmSync(tmpDir, { recursive: true, force: true });
  return out;
}

/** Stößt einen Drive-Mirror an (async, ohne await im Aufrufer). */
export async function mirrorBackupToDrive(
  backupId: string,
  category: BackupCategory,
): Promise<void> {
  if (!isMirrorEnabled()) {
    setDriveStatus(backupId, "skip");
    return;
  }
  if (!isDriveConnected()) {
    setDriveStatus(backupId, "error", null, "Drive nicht verbunden");
    return;
  }

  setDriveStatus(backupId, "pending");

  const row = getById(backupId);
  if (!row) return;
  const file = path.join(categoryDir(category), row.filename);
  if (!existsSync(file)) {
    setDriveStatus(backupId, "error", null, "Datei nicht gefunden");
    return;
  }

  let driveArchive: string | null = null;
  try {
    // Master-Key NIE in die Cloud — Schlüssel-freie Kopie bauen
    driveArchive = await buildKeyfreeArchive(file, backupId);

    const folderId = await ensureFolderPath(
      backupTargetFolder(new Date(row.completedAt ?? row.startedAt)),
    );
    const out = await uploadStream({
      parentFolderId: folderId,
      name: row.filename,
      stream: createReadStream(driveArchive),
      mimeType: "application/gzip",
    });
    setDriveStatus(backupId, "synced", out.id);
    audit({
      action: "backup.drive.mirror.ok",
      detail: { id: backupId, fileId: out.id, keysExcluded: true },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setDriveStatus(backupId, "error", null, msg);
    audit({
      action: "backup.drive.mirror.fail",
      detail: { id: backupId, error: msg },
    });
  } finally {
    if (driveArchive && existsSync(driveArchive)) {
      try { rmSync(driveArchive, { force: true }); } catch { /* ignore */ }
    }
  }
}

/** Manueller Retry für ein Backup, dessen Drive-Mirror fehlgeschlagen ist. */
export async function retryDriveMirror(backupId: string): Promise<boolean> {
  const row = getById(backupId);
  if (!row) return false;
  await mirrorBackupToDrive(backupId, row.category);
  return true;
}
