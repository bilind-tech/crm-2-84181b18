// Snapshot bauen: SQLite Online-Backup → uploads kopieren → master.key kopieren
// → manifest schreiben → tar.gz packen → atomar verschieben.
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as tar from "tar";
import { getDatabase, getSchemaVersion } from "../db/index.js";
import { config } from "../config.js";
import { audit } from "../auth/audit.js";
import { buildManifest } from "./manifest.js";
import {
  insertStarted,
  markFailed,
  markSuccess,
  newBackupId,
} from "./repo.js";
import { buildFilename, categoryDir, targetPath, tmpArchivePath, tmpDir } from "./paths.js";
import {
  finishBackupProgress,
  setBackupPhase,
  startBackupProgress,
} from "./progress.js";
import { rotate } from "./rotation.js";
import type { BackupCategory, BackupTrigger } from "./types.js";

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 });
}

function ensureBackupDirs(): void {
  ensureDir(config.backupsDir);
  ensureDir(config.backupsDailyDir);
  ensureDir(config.backupsWeeklyDir);
  ensureDir(config.backupsMonthlyDir);
  ensureDir(config.backupsSafetyDir);
  ensureDir(config.backupsTmpDir);
}

function dirSize(p: string): number {
  if (!existsSync(p)) return 0;
  let total = 0;
  for (const entry of readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else if (entry.isFile()) total += statSync(full).size;
  }
  return total;
}

function copyDir(src: string, dest: string): void {
  if (!existsSync(src)) return;
  ensureDir(dest);
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else if (entry.isFile()) copyFileSync(s, d);
  }
}

async function sha256OfFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = createReadStream(file);
    s.on("data", (chunk) => h.update(chunk));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

export interface CreateBackupResult {
  id: string;
  filename: string;
  fullPath: string;
  sizeBytes: number;
  sha256: string;
  category: BackupCategory;
}

/** Erstellt einen vollständigen Snapshot. Die Funktion wirft bei Fehlern,
 *  aktualisiert aber IMMER backup_history (success/failed) und progress. */
export async function createBackup(opts: {
  category: BackupCategory;
  trigger: BackupTrigger;
}): Promise<CreateBackupResult> {
  ensureBackupDirs();

  const id = newBackupId();
  const filename = buildFilename(opts.category, id);
  const workDir = tmpDir(id);
  const archivePath = tmpArchivePath(id);

  startBackupProgress(id);
  insertStarted({
    id,
    filename,
    category: opts.category,
    trigger: opts.trigger,
    appVersion: config.version,
    schemaVersion: getSchemaVersion(),
  });

  try {
    // --- 1. Arbeits-Verzeichnis vorbereiten ---
    if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    ensureDir(workDir);
    ensureDir(path.join(workDir, "db"));
    ensureDir(path.join(workDir, "keys"));

    // --- 2. SQLite Online-Backup ---
    setBackupPhase(id, "snapshot-db", 10, "DB-Snapshot");
    const dbDest = path.join(workDir, "db", "mycleancenter.db");
    await getDatabase().backup(dbDest);
    const dbBytes = statSync(dbDest).size;
    const dbSha = await sha256OfFile(dbDest);

    // --- 3. uploads kopieren ---
    setBackupPhase(id, "copy-uploads", 35, "Uploads kopieren");
    const uploadsDest = path.join(workDir, "uploads");
    copyDir(config.uploadsDir, uploadsDest);
    const uploadsBytes = dirSize(uploadsDest);

    // --- 4. master.key kopieren ---
    setBackupPhase(id, "copy-keys", 55, "Master-Key kopieren");
    if (existsSync(config.keyPath)) {
      copyFileSync(config.keyPath, path.join(workDir, "keys", "master.key"));
    }

    // --- 5. Manifest schreiben ---
    setBackupPhase(id, "manifest", 65, "Manifest");
    const manifest = buildManifest({
      appVersion: config.version,
      schemaVersion: getSchemaVersion(),
      type: opts.category,
      trigger: opts.trigger,
      dbSha256: dbSha,
      dbBytes,
      uploadsBytes,
    });
    writeFileSync(path.join(workDir, "manifest.json"), JSON.stringify(manifest, null, 2));

    // --- 6. tar.gz packen ---
    setBackupPhase(id, "archive", 75, "Archiv packen");
    await tar.create(
      {
        gzip: { level: 6 },
        file: archivePath,
        cwd: workDir,
        portable: true,
      },
      ["manifest.json", "db", "uploads", "keys"],
    );

    const archiveSize = statSync(archivePath).size;
    const archiveSha = await sha256OfFile(archivePath);

    // --- 7. Atomar in Ziel verschieben ---
    setBackupPhase(id, "rotate", 90, "Verschieben & Rotation");
    ensureDir(categoryDir(opts.category));
    const finalPath = targetPath(opts.category, filename);
    renameSync(archivePath, finalPath);

    // --- 8. Aufräumen ---
    rmSync(workDir, { recursive: true, force: true });

    // --- 9. DB markieren ---
    markSuccess(id, archiveSize, archiveSha);
    audit({
      action: "backup.create",
      detail: { id, category: opts.category, trigger: opts.trigger, sizeBytes: archiveSize },
    });

    // --- 10. Rotation (nur für scheduled & promotions) ---
    if (opts.category === "daily") {
      try {
        rotate();
      } catch (e) {
        // Rotation-Fehler darf das Backup-Ergebnis nicht killen
        audit({ action: "backup.rotate.fail", detail: String(e) });
      }
    }

    setBackupPhase(id, "rotate", 100, "Fertig");
    finishBackupProgress(id, true);

    // Drive-Mirror (fire-and-forget — Drive-Fehler darf das Backup nicht killen)
    void import("./drive-mirror.js").then((m) => m.mirrorBackupToDrive(id, opts.category)).catch(() => {
      /* Status steht in backup_history.drive_status */
    });

    return {
      id,
      filename,
      fullPath: finalPath,
      sizeBytes: archiveSize,
      sha256: archiveSha,
      category: opts.category,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markFailed(id, msg);
    finishBackupProgress(id, false, msg);
    audit({ action: "backup.fail", detail: { id, error: msg } });
    try {
      if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
      if (existsSync(archivePath)) rmSync(archivePath, { force: true });
    } catch {
      /* best effort */
    }
    throw err;
  }
}
