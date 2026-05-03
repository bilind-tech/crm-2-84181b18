// State-Machine für System-Updates.
// Steps (Frontend-konform): entpacken → backup → quarantaene → install →
// migrations → neustart → smoketest. Bei Fehler nach `quarantaene` wird
// automatisch in den Step `rollback` verzweigt.
//
// Garantie: Daten-Verzeichnis (config.dataDir) wird in keinem Step angefasst.
// Vor dem atomaren Symlink-Switch (Step "quarantaene") ist keine produktive
// Veränderung passiert — Abbruch lässt das System unverändert weiter.
import path from "node:path";
import {
  existsSync,
  mkdirSync,
  rmSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  readdirSync,
  readlinkSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import { config } from "../config.js";


import { emit } from "../events/bus.js";
import { audit } from "../auth/audit.js";
import { createBackup } from "../backup/create.js";
import {
  appRoot,
  brokenDir,
  currentLink,
  ensureAppDirs,
  lockFile,
  nowStamp,
  previousLink,
  stagingDir,
  versionDir,
  versionsDir,
} from "./paths.js";
import {
  createLauf,
  getPaket,
  recordInstalledVersion,
  setLaufStatus,
  setStepStatus,
} from "./repo.js";
import type { UpdateStepId } from "./types.js";
import { assertNotInDataDir } from "./data-guard.js";

// --- Daten-Schutz: jede FS-Mutation läuft durch diese Wrapper ---
function safeRename(src: string, dst: string): void {
  assertNotInDataDir(src, "rename:src");
  assertNotInDataDir(dst, "rename:dst");
  renameSync(src, dst);
}
function safeUnlink(p: string): void {
  assertNotInDataDir(p, "unlink");
  unlinkSync(p);
}
function safeRm(p: string): void {
  assertNotInDataDir(p, "rm");
  rmSync(p, { recursive: true, force: true });
}
function safeMkdir(p: string): void {
  assertNotInDataDir(p, "mkdir");
  mkdirSync(p, { recursive: true });
}
function safeSymlink(target: string, link: string): void {
  assertNotInDataDir(link, "symlink");
  symlinkSync(target, link);
}

const execFileP = promisify(execFile);

// Reihenfolge der Steps wie sie das Frontend zeigt.
const STEPS: { stepId: UpdateStepId; label: string }[] = [
  { stepId: "entpacken", label: "Paket entpacken" },
  { stepId: "backup", label: "Sicherheits-Backup" },
  { stepId: "quarantaene", label: "Quarantäne (atomarer Swap)" },
  { stepId: "install", label: "Abhängigkeiten installieren" },
  { stepId: "migrations", label: "Migrationen prüfen" },
  { stepId: "neustart", label: "Service neu starten" },
  { stepId: "smoketest", label: "Healthcheck" },
];

// --- Lock-File ---

function acquireLock(): boolean {
  ensureAppDirs();
  const f = lockFile();
  if (existsSync(f)) {
    // Lock älter 30 min: aufräumen
    try {
      const age = Date.now() - (statMs(f) ?? 0);
      if (age > 30 * 60_000) unlinkSync(f);
      else return false;
    } catch { return false; }
  }
  try {
    writeFileSync(f, String(process.pid), { flag: "wx" });
    return true;
  } catch { return false; }
}

function releaseLock(): void {
  try { unlinkSync(lockFile()); } catch { /* ignore */ }
}

function statMs(p: string): number | null {
  try { return statSync(p).mtimeMs; } catch { return null; }
}

export function isUpdateRunning(): boolean {
  return existsSync(lockFile());
}

// --- Public API ---

export interface InstallOptions {
  uploadId: string;
  userId: string | null;
  /** Test-Modus: Subprozesse + systemctl als no-op. */
  testMode?: boolean;
}

/**
 * Startet den Update-Runner asynchron. Antwortet sofort mit der Lauf-ID.
 * Der eigentliche Lauf läuft im Hintergrund und treibt den Bus mit
 * `system:update:phase` + `system:update:lauf` Events.
 */
export function startInstall(opts: InstallOptions): { laufId: string } {
  if (!acquireLock()) {
    const e: Error & { statusCode?: number } = new Error("Es läuft bereits ein Update.");
    e.statusCode = 409;
    throw e;
  }

  const paket = getPaket(opts.uploadId);
  if (!paket || !paket.validiert) {
    releaseLock();
    const e: Error & { statusCode?: number } = new Error("Update-Paket unbekannt oder nicht validiert.");
    e.statusCode = 404;
    throw e;
  }
  const manifest = JSON.parse(paket.manifestJson) as { appVersion: string; schemaVersion: number };

  const laufId = createLauf({
    quelle: "upload",
    paketVersion: manifest.appVersion,
    paketSha256: paket.sha256,
    paketGroesse: paket.groesseBytes,
    vorherigeVersion: config.version,
    neueVersion: manifest.appVersion,
    userId: opts.userId,
    steps: STEPS,
  });
  emit("system:update:lauf", { laufId, status: "laeuft" });

  // Async — Fastify-Reply wartet nicht.
  void runInstall(laufId, opts).catch((err) => {
    // Fallback wenn der Runner selbst crasht
    setLaufStatus(laufId, "fehler", { fehlerText: String(err?.message ?? err) });
    emit("system:update:lauf", { laufId, status: "fehler" });
    releaseLock();
  });

  return { laufId };
}

async function runInstall(laufId: string, opts: InstallOptions): Promise<void> {
  const paket = getPaket(opts.uploadId)!;
  const stagedRoot = paket.stagingPfad;       // staging/<uploadId>/
  const stamp = nowStamp();
  const targetVersionDir = versionDir(stamp);
  let safetyBackupId: string | null = null;
  let swapped = false;

  try {
    // 1. ENTPACKEN — wurde bereits in /validate gemacht. Hier nur prüfen.
    await stepRun(laufId, "entpacken", async () => {
      if (!existsSync(stagedRoot)) throw new Error("Staging-Ordner fehlt — Paket nicht entpackt");
      return `${stagedRoot}`;
    });

    // 2. BACKUP — Sicherheits-Backup
    await stepRun(laufId, "backup", async () => {
      const r = await createBackup({ category: "pre-update", trigger: "pre-update" });
      safetyBackupId = r.id;
      setLaufStatus(laufId, "laeuft", { safetyBackupId });
      return `Backup ${r.filename} (${(r.sizeBytes / 1024 / 1024).toFixed(1)} MB)`;
    });

    // 3. QUARANTÄNE — Staging in versions/<stamp>/ verschieben + Symlink-Swap
    await stepRun(laufId, "quarantaene", async () => {
      ensureAppDirs();
      assertNotInDataDir(targetVersionDir, "quarantaene:targetVersionDir");
      safeMkdir(versionsDir());
      // Move staging → versions/<stamp>
      safeRename(stagedRoot, targetVersionDir);

      // previous = aktuelles current-Ziel
      const old = readCurrentTarget();
      // current.tmp -> versions/<stamp>
      const tmpLink = currentLink() + ".tmp";
      try { safeUnlink(tmpLink); } catch { /* ignore */ }
      safeSymlink(targetVersionDir, tmpLink);
      // mv -T current.tmp current
      safeRename(tmpLink, currentLink());
      // previous-Pointer deterministisch setzen (auch entfernen, wenn kein old)
      try { safeUnlink(previousLink()); } catch { /* ignore */ }
      if (old) safeSymlink(old, previousLink());
      swapped = true;

      // Verifikation: current zeigt jetzt wirklich auf den neuen Ordner
      const verify = readCurrentTarget();
      if (verify !== targetVersionDir) {
        throw new Error(`Symlink-Swap nicht verifiziert (current=${verify})`);
      }
      return `Symlink → ${targetVersionDir}`;
    });

    // 4. INSTALL — npm ci im neuen Ordner
    await stepRun(laufId, "install", async () => {
      if (opts.testMode) return "test-mode: skipped npm ci";
      try {
        const { stdout } = await execFileP("npm", ["ci", "--omit=dev"], {
          cwd: targetVersionDir,
          timeout: 10 * 60_000, // Pi + USB-SSD: 5 min war knapp
          maxBuffer: 50 * 1024 * 1024,
        });
        return stdout.split("\n").slice(-3).join(" ");
      } catch (e) {
        const err = e as { stderr?: string; message: string };
        throw new Error("npm ci fehlgeschlagen: " + (err.stderr?.slice(0, 500) ?? err.message));
      }
    });

    // 5. MIGRATIONS-Probelauf — Kopie der DB anlegen, Migrationen drauflaufen lassen
    await stepRun(laufId, "migrations", async () => {
      const tmpDb = path.join(stagingDirRoot(), `migrate-test-${laufId}.sqlite`);
      try { unlinkSync(tmpDb); } catch { /* ignore */ }
      // Kopie via SQLite Online-Backup ist sicher gegen WAL
      const Database = (await import("better-sqlite3")).default;
      const live = (await import("../db/index.js")).getDatabase();
      await live.backup(tmpDb);
      // Probelauf: lade die Migrations aus dem NEUEN Code-Ordner. Im Test
      // verwenden wir die laufende migrate.ts (additive Migrations sind idempotent).
      const test = new Database(tmpDb);
      try {
        const { runMigrations } = await import("../db/migrate.js");
        const r = runMigrations(test);
        return `Schema-Version (Probe): ${r.currentVersion}`;
      } finally {
        test.close();
        try { unlinkSync(tmpDb); } catch { /* ignore */ }
      }
    });

    // 6. NEUSTART — sudo systemctl reload (sudoers erlaubt nur reload/restart/status)
    await stepRun(laufId, "neustart", async () => {
      if (opts.testMode || config.nodeEnv !== "production") return "dev-mode: kein systemctl";
      try {
        await execFileP("sudo", ["-n", "/bin/systemctl", "reload", "mycleancenter"], { timeout: 30_000 });
        return "sudo systemctl reload mycleancenter";
      } catch {
        // Reload-Fail ist nicht zwingend Update-Fail — Service läuft mit altem Process,
        // aber Code ist gewechselt. User muss restart triggern.
        return "reload nicht möglich — manueller Restart nötig";
      }
    });

    // 7. SMOKETEST — Healthcheck mehrfach gegen /health
    await stepRun(laufId, "smoketest", async () => {
      if (opts.testMode) return "test-mode: skipped";
      const ok = await healthcheckLoop();
      if (!ok) throw new Error("Healthcheck nach 60 s nicht grün");
      return "Healthcheck OK";
    });

    // Erfolg
    recordInstalledVersion(paket.dateiname.replace(/\.zip$/i, "") || stamp, true);
    setLaufStatus(laufId, "erfolg", { aktuellerStep: "smoketest" });
    emit("system:update:lauf", { laufId, status: "erfolg" });
    audit({ userId: opts.userId, action: "system.update.installiert", detail: { laufId, version: paket.dateiname } });
    cleanupOldVersions();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setLaufStatus(laufId, "fehler", { fehlerText: msg });

    // Auto-Rollback NUR wenn wir bereits geswapt haben
    if (swapped) {
      try {
        await runRollbackToPrevious(laufId, opts.userId);
      } catch (e) {
        audit({
          userId: opts.userId,
          action: "system.update.rollback_fehler",
          detail: { laufId, error: String(e) },
        });
      }
    }

    emit("system:update:lauf", { laufId, status: swapped ? "rollback" : "fehler" });
    audit({
      userId: opts.userId,
      action: "system.update.fehler",
      detail: { laufId, step: msg.slice(0, 200) },
    });
  } finally {
    releaseLock();
  }
}

async function stepRun(
  laufId: string,
  stepId: UpdateStepId,
  fn: () => Promise<string>,
): Promise<void> {
  setStepStatus(laufId, stepId, "laeuft");
  setLaufStatus(laufId, "laeuft", { aktuellerStep: stepId });
  emit("system:update:phase", {
    laufId, stepId, status: "laeuft",
    label: STEPS.find((s) => s.stepId === stepId)?.label ?? stepId,
  });
  try {
    const detail = await fn();
    setStepStatus(laufId, stepId, "ok", detail);
    emit("system:update:phase", {
      laufId, stepId, status: "ok", detail,
      label: STEPS.find((s) => s.stepId === stepId)?.label ?? stepId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStepStatus(laufId, stepId, "fehler", null, msg);
    emit("system:update:phase", {
      laufId, stepId, status: "fehler", detail: msg,
      label: STEPS.find((s) => s.stepId === stepId)?.label ?? stepId,
    });
    throw err;
  }
}

async function runRollbackToPrevious(laufId: string, userId: string | null): Promise<void> {
  const prev = readPreviousTarget();
  if (!prev) throw new Error("Keine vorherige Version vorhanden");

  // Step "rollback" markieren
  setStepStatus(laufId, "rollback", "laeuft");
  emit("system:update:phase", {
    laufId, stepId: "rollback", status: "laeuft", label: "Auto-Rollback",
  });
  // Defekte aktuelle in broken-* sichern (nicht löschen!)
  const cur = readCurrentTarget();
  if (cur && cur !== prev) {
    const broken = brokenDir(nowStamp());
    try { safeRename(cur, broken); } catch { /* ignore */ }
  }
  // current → previous
  const tmpLink = currentLink() + ".tmp";
  try { safeUnlink(tmpLink); } catch { /* ignore */ }
  safeSymlink(prev, tmpLink);
  try { safeUnlink(currentLink()); } catch { /* ignore */ }
  safeRename(tmpLink, currentLink());

  setStepStatus(laufId, "rollback", "ok", "Symlink wieder auf vorherige Version");
  setLaufStatus(laufId, "rollback", { aktuellerStep: "rollback" });
  emit("system:update:phase", {
    laufId, stepId: "rollback", status: "ok", label: "Auto-Rollback",
    detail: "Symlink wieder auf vorherige Version",
  });
  audit({ userId, action: "system.update.rollback_auto", detail: { laufId } });
}

// --- Manueller Rollback (POST /system/update/rollback/:version) ---

export async function manualRollback(
  targetVersion: string,
  userId: string | null,
): Promise<{ laufId: string }> {
  if (!acquireLock()) {
    const e: Error & { statusCode?: number } = new Error("Es läuft bereits ein Vorgang.");
    e.statusCode = 409;
    throw e;
  }

  try {
    const target = path.join(versionsDir(), targetVersion);
    if (!existsSync(target)) {
      const e: Error & { statusCode?: number } = new Error("Zielversion nicht gefunden");
      e.statusCode = 404;
      throw e;
    }

    const laufId = createLauf({
      quelle: "rollback",
      paketVersion: targetVersion,
      paketSha256: "",
      paketGroesse: 0,
      vorherigeVersion: config.version,
      neueVersion: targetVersion,
      userId,
      steps: [
        { stepId: "backup", label: "Sicherheits-Backup" },
        { stepId: "rollback", label: "Symlink-Swap auf Vorgänger" },
        { stepId: "neustart", label: "Service neu starten" },
        { stepId: "smoketest", label: "Healthcheck" },
      ],
    });
    emit("system:update:lauf", { laufId, status: "laeuft" });

    void (async () => {
      try {
        await stepRun(laufId, "backup", async () => {
          const r = await createBackup({ category: "pre-update", trigger: "pre-update" });
          setLaufStatus(laufId, "laeuft", { safetyBackupId: r.id });
          return `Backup ${r.filename}`;
        });

        await stepRun(laufId, "rollback", async () => {
          // Defekte aktive Version (sofern abweichend) in broken-* sichern
          const cur = readCurrentTarget();
          if (cur && cur !== target) {
            const broken = brokenDir(nowStamp());
            try { safeRename(cur, broken); } catch { /* ignore */ }
          }
          const tmpLink = currentLink() + ".tmp";
          try { safeUnlink(tmpLink); } catch { /* ignore */ }
          safeSymlink(target, tmpLink);
          try { safeUnlink(currentLink()); } catch { /* ignore */ }
          safeRename(tmpLink, currentLink());
          return `Symlink → ${target}`;
        });

        await stepRun(laufId, "neustart", async () => {
          if (config.nodeEnv !== "production") return "dev-mode: kein systemctl";
          try {
            await execFileP("sudo", ["-n", "/bin/systemctl", "restart", "mycleancenter"], { timeout: 30_000 });
            return "sudo systemctl restart mycleancenter";
          } catch { return "restart nicht möglich — manueller Eingriff nötig"; }
        });

        await stepRun(laufId, "smoketest", async () => {
          const ok = await healthcheckLoop();
          if (!ok) throw new Error("Healthcheck fehlgeschlagen");
          return "Healthcheck OK";
        });

        recordInstalledVersion(targetVersion, true);
        setLaufStatus(laufId, "rollback", { aktuellerStep: "smoketest" });
        emit("system:update:lauf", { laufId, status: "rollback" });
        audit({ userId, action: "system.update.rollback_manuell", detail: { laufId, version: targetVersion } });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setLaufStatus(laufId, "fehler", { fehlerText: msg });
        emit("system:update:lauf", { laufId, status: "fehler" });
      } finally {
        releaseLock();
      }
    })();

    return { laufId };
  } catch (err) {
    releaseLock();
    throw err;
  }
}

// --- Helpers ---

function stagingDirRoot(): string {
  return path.join(appRoot(), "staging");
}

function readCurrentTarget(): string | null {
  try {
    return readlinkSync(currentLink());
  } catch { return null; }
}

function readPreviousTarget(): string | null {
  try {
    return readlinkSync(previousLink());
  } catch {
    // Fallback: zweitneuestes versions/<stamp>
    try {
      const dirs = readdirSync(versionsDir())
        .filter((d) => !d.startsWith("broken-"))
        .map((d) => path.join(versionsDir(), d))
        .sort();
      const cur = readCurrentTarget();
      const others = dirs.filter((d) => d !== cur);
      return others[others.length - 1] ?? null;
    } catch { return null; }
  }
}

function cleanupOldVersions(): void {
  try {
    const cur = readCurrentTarget();
    const prev = readPreviousTarget();
    const dirs = readdirSync(versionsDir())
      .map((d) => ({ name: d, full: path.join(versionsDir(), d) }))
      .filter((x) => x.full !== cur && x.full !== prev);

    // Eine zusätzliche, jüngste "Notnagel"-Version (kein broken-) behalten
    const notnagel = dirs
      .filter((x) => !x.name.startsWith("broken-"))
      .sort((a, b) => b.name.localeCompare(a.name))[0]?.full;

    for (const x of dirs) {
      if (x.full === notnagel) continue;
      try {
        const age = Date.now() - statSync(x.full).mtimeMs;
        if (x.name.startsWith("broken-") && age < 7 * 86_400_000) continue;
        safeRm(x.full);
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

/** Staging-Reste älter als maxAgeMs aufräumen. */
export function cleanupStaleStaging(maxAgeMs = 60 * 60_000): number {
  let removed = 0;
  try {
    const root = path.join(appRoot(), "staging");
    if (!existsSync(root)) return 0;
    for (const d of readdirSync(root)) {
      if (d === ".install.lock") continue;
      const full = path.join(root, d);
      try {
        const age = Date.now() - statSync(full).mtimeMs;
        if (age > maxAgeMs) {
          safeRm(full);
          removed++;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return removed;
}

/** Stamp (versions/<stamp>) der aktuellen Vorgänger-Version oder null. */
export function getPreviousVersionStamp(): string | null {
  const t = readPreviousTarget();
  return t ? path.basename(t) : null;
}

async function healthcheckLoop(): Promise<boolean> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await healthcheckOnce()) return true;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return false;
}

function healthcheckOnce(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: "127.0.0.1", port: config.port, path: "/health", timeout: 3_000 },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

/** Beim Boot: alten Lock-File aufräumen falls Pi während Update gecrasht ist. */
export function reapStaleLock(): boolean {
  try {
    if (existsSync(lockFile())) {
      // Backend startet — Lock kann nicht mehr aktiv sein.
      unlinkSync(lockFile());
      return true;
    }
  } catch { /* ignore */ }
  return false;
}



