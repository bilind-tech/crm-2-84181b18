// =============================================================================
// Restore-Flow
// =============================================================================
// ABSOLUTE REGEL: Daten werden NIEMALS außerhalb dieses kontrollierten Flows
// verändert. Vor jedem Restore wird automatisch ein Sicherheits-Backup erstellt.
// Bei jedem Fehler ab dem ersten Swap → vollständiger Rollback aus old/.
//
// Schritte:
//   1. Sicherheits-Backup (pre-restore)
//   2. Wartungsmodus an
//   3. tar.gz nach tmp/restore-<id>/ entpacken
//   4. Manifest validieren (kein Schema-Downgrade) + db-Datei via SHA256 prüfen
//   5. DB sauber schließen
//   6. Atomarer Swap von db/, uploads/ und (optional) keys/ — alte Stände nach old/
//   7. DB neu öffnen → Migrationen
//   8. Wartungsmodus aus
// =============================================================================

import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as tar from "tar";
import { config } from "../config.js";
import {
  closeDatabase,
  getSchemaVersion,
  openDatabase,
} from "../db/index.js";
import { audit } from "../auth/audit.js";
import { parseManifest } from "./manifest.js";
import { createBackup } from "./create.js";
import {
  enterMaintenance,
  leaveMaintenance,
} from "./maintenance.js";
import {
  finishRestoreProgress,
  setRestorePhase,
  startRestoreProgress,
} from "./progress.js";

const RESTORE_TMP_PREFIX = "restore-";

async function sha256OfFile(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = createReadStream(file);
    s.on("data", (c) => h.update(c));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

function filesEqual(a: string, b: string): boolean {
  try {
    const ba = readFileSync(a);
    const bb = readFileSync(b);
    return ba.length === bb.length && ba.equals(bb);
  } catch {
    return false;
  }
}


function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 });
}

function safeRm(p: string): void {
  try {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

/** Atomarer Verzeichnis-Swap: aktueller Stand → old, neuer Stand → live. */
function swapDir(live: string, fresh: string, oldBackup: string): void {
  if (existsSync(live)) {
    renameSync(live, oldBackup);
  }
  renameSync(fresh, live);
}

function rollbackSwap(live: string, oldBackup: string): void {
  try {
    safeRm(live);
    if (existsSync(oldBackup)) renameSync(oldBackup, live);
  } catch (e) {
    audit({ action: "restore.rollback.fail", detail: { live, error: String(e) } });
  }
}

export interface RestoreOptions {
  archivePath: string;
  triggeredBy?: string | null;
}

export async function restoreFromArchive(opts: RestoreOptions): Promise<{ ok: true } | { ok: false; error: string }> {
  const restoreId = `${Date.now()}`;
  startRestoreProgress(restoreId);

  // --- 1. Sicherheits-Backup ---
  setRestorePhase("safety-backup", 5, "Sicherheits-Backup wird erstellt");
  try {
    await createBackup({ category: "pre-restore", trigger: "pre-restore" });
  } catch (e) {
    const msg = "Sicherheits-Backup fehlgeschlagen: " + (e instanceof Error ? e.message : String(e));
    finishRestoreProgress(false, msg, msg);
    audit({ action: "restore.abort", detail: { stage: "safety-backup", error: msg } });
    return { ok: false, error: msg };
  }

  // --- 2. Wartungsmodus ---
  enterMaintenance("Restore läuft");

  const workDir = path.join(config.backupsTmpDir, RESTORE_TMP_PREFIX + restoreId);
  const oldDir = path.join(workDir, "old");
  ensureDir(workDir);
  ensureDir(oldDir);

  let didDbClose = false;
  let dbSwapped = false;
  let uploadsSwapped = false;
  let keysSwapped = false;

  try {
    // --- 3. Entpacken ---
    setRestorePhase("extract", 20, "Archiv entpacken");
    if (!existsSync(opts.archivePath) || statSync(opts.archivePath).size === 0) {
      throw new Error("Backup-Datei nicht gefunden oder leer");
    }
    await tar.extract({ file: opts.archivePath, cwd: workDir });

    // --- 4. Manifest validieren + DB-SHA prüfen ---
    setRestorePhase("validate", 35, "Manifest prüfen");
    const manifestPath = path.join(workDir, "manifest.json");
    if (!existsSync(manifestPath)) throw new Error("Manifest fehlt im Backup");
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    const parsed = parseManifest(raw);
    if (!parsed.ok) throw new Error("Manifest ungültig: " + parsed.error);

    const currentSchema = getSchemaVersion();
    if (parsed.manifest.schemaVersion > currentSchema) {
      throw new Error(
        `Backup hat neueres Schema (${parsed.manifest.schemaVersion}) als das laufende System (${currentSchema}). Downgrade nicht erlaubt.`,
      );
    }

    // App-Version-Mismatch ist nur Warnung, kein Hard-Block
    if (parsed.manifest.appVersion !== config.version) {
      audit({
        action: "restore.version-mismatch.warn",
        detail: {
          backupVersion: parsed.manifest.appVersion,
          systemVersion: config.version,
        },
      });
    }

    const freshDb = path.join(workDir, "db");
    const freshDbFile = path.join(freshDb, "mycleancenter.db");
    const freshUploads = path.join(workDir, "uploads");
    const freshKeys = path.join(workDir, "keys");
    const freshKeyFile = path.join(freshKeys, "master.key");
    if (!existsSync(freshDb)) throw new Error("db/ fehlt im Backup");
    if (!existsSync(freshDbFile)) throw new Error("db/mycleancenter.db fehlt im Backup");

    // SHA256 der entpackten DB gegen Manifest verifizieren — VOR jedem Swap
    const actualDbSha = await sha256OfFile(freshDbFile);
    if (actualDbSha !== parsed.manifest.dbSha256) {
      throw new Error(
        `DB-Datei beschädigt: SHA256 stimmt nicht mit Manifest überein (erwartet ${parsed.manifest.dbSha256.slice(0, 12)}…, erhalten ${actualDbSha.slice(0, 12)}…)`,
      );
    }

    // Master-Key nur swappen wenn das Backup einen mitbringt UND er sich
    // unterscheidet. Identische Keys werden nicht angefasst.
    const shouldSwapKey =
      existsSync(freshKeyFile) &&
      !filesEqual(freshKeyFile, config.keyPath);

    // --- 5. DB schließen ---
    setRestorePhase("swap", 50, "Datenbank schließen");
    closeDatabase();
    didDbClose = true;

    // --- 6. Atomar swappen ---
    setRestorePhase("swap", 60, "Daten ersetzen");
    swapDir(config.dbDir, freshDb, path.join(oldDir, "db"));
    dbSwapped = true;

    if (existsSync(freshUploads)) {
      swapDir(config.uploadsDir, freshUploads, path.join(oldDir, "uploads"));
      uploadsSwapped = true;
    }

    if (shouldSwapKey) {
      swapDir(config.keysDir, freshKeys, path.join(oldDir, "keys"));
      keysSwapped = true;
      audit({ action: "restore.key.swapped" });
    }

    // --- 7. Migrationen ---
    setRestorePhase("migrate", 80, "Migrationen anwenden");
    openDatabase(config.dbPath);

    setRestorePhase("reopen", 95, "Backend neu initialisieren");

    // --- 8. Wartungsmodus aus ---
    leaveMaintenance();
    finishRestoreProgress(true, "Wiederherstellung abgeschlossen");
    audit({
      userId: opts.triggeredBy ?? null,
      action: "restore.success",
      detail: {
        archivePath: path.basename(opts.archivePath),
        manifest: { app: parsed.manifest.appVersion, schema: parsed.manifest.schemaVersion },
        keySwapped: keysSwapped,
      },
    });

    // tmp aufräumen — old wird 24h behalten (manueller Restore-Rollback im Notfall).
    // Persistente Aufräumung übernimmt cleanupOrphanRestoreTmp() beim nächsten Boot
    // sowie der tägliche Reconcile-Cron — der setTimeout hier überlebt einen Restart nicht
    // und ist nur ein Best-Effort-Sofort-Cleanup.
    setTimeout(() => safeRm(workDir), 24 * 60 * 60_000).unref?.();

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    // ROLLBACK: swap rückgängig
    try {
      if (keysSwapped) rollbackSwap(config.keysDir, path.join(oldDir, "keys"));
      if (uploadsSwapped) rollbackSwap(config.uploadsDir, path.join(oldDir, "uploads"));
      if (dbSwapped) rollbackSwap(config.dbDir, path.join(oldDir, "db"));
      if (didDbClose) {
        try {
          openDatabase(config.dbPath);
        } catch (e) {
          audit({ action: "restore.reopen.fail", detail: String(e) });
        }
      }
      finishRestoreProgress(false, "Wiederherstellung fehlgeschlagen — Daten unverändert", msg);
      audit({ action: "restore.fail", detail: { error: msg } });
    } finally {
      leaveMaintenance();
    }

    safeRm(workDir);
    return { ok: false, error: msg };
  }
}
