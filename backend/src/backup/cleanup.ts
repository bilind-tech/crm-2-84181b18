// =============================================================================
// Boot-Cleanup + Reconcile-Cron für Backups
// =============================================================================
// - cleanupOrphanRestoreTmp(): löscht alte restore-* Ordner in backupsTmpDir.
//   Ersetzt das verlorene `setTimeout(24h)` aus restore.ts (überlebt Restart).
// - cleanupOldUploads(): löscht alte upload-*.tar.gz aus dem tmp/-Ordner.
// - startBackupReconcileCron(): tägliches reconcileDiskState() um 03:30.
// =============================================================================
import { existsSync, readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import cron, { type ScheduledTask } from "node-cron";
import { config } from "../config.js";
import { audit } from "../auth/audit.js";
import { reconcileDiskState } from "./rotation.js";

const RESTORE_PREFIX = "restore-";
const UPLOAD_PREFIX = "upload-";

const ONE_DAY_MS = 24 * 60 * 60_000;

function ageMs(p: string): number {
  try {
    return Date.now() - statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** Löscht restore-* Ordner älter als 24h aus backups/tmp/. */
export function cleanupOrphanRestoreTmp(): number {
  if (!existsSync(config.backupsTmpDir)) return 0;
  let removed = 0;
  for (const name of readdirSync(config.backupsTmpDir)) {
    if (!name.startsWith(RESTORE_PREFIX)) continue;
    const full = path.join(config.backupsTmpDir, name);
    if (ageMs(full) < ONE_DAY_MS) continue;
    try {
      rmSync(full, { recursive: true, force: true });
      removed++;
    } catch (e) {
      audit({
        action: "backup.cleanup.restore-tmp.fail",
        detail: { path: full, error: String(e) },
      });
    }
  }
  return removed;
}

/** Löscht hängende upload-*.tar.gz älter als 24h. */
export function cleanupOldUploads(): number {
  if (!existsSync(config.backupsTmpDir)) return 0;
  let removed = 0;
  for (const name of readdirSync(config.backupsTmpDir)) {
    if (!name.startsWith(UPLOAD_PREFIX)) continue;
    const full = path.join(config.backupsTmpDir, name);
    if (ageMs(full) < ONE_DAY_MS) continue;
    try {
      unlinkSync(full);
      removed++;
    } catch {
      /* best effort */
    }
  }
  return removed;
}

let reconcileTask: ScheduledTask | null = null;

/** Startet den täglichen Reconcile-Cron um 03:30 Europe/Berlin. */
export function startBackupReconcileCron(): void {
  if (reconcileTask) return;
  reconcileTask = cron.schedule(
    "30 3 * * *",
    () => {
      try {
        const removed = reconcileDiskState();
        const restoreTmp = cleanupOrphanRestoreTmp();
        const uploads = cleanupOldUploads();
        if (removed + restoreTmp + uploads > 0) {
          audit({
            action: "backup.reconcile.cron",
            detail: { removed, restoreTmp, uploads },
          });
        }
      } catch (e) {
        audit({ action: "backup.reconcile.fail", detail: String(e) });
      }
    },
    { timezone: process.env.TZ || "Europe/Berlin" },
  );
}
