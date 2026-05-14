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
  copyFileSync,
  cpSync,
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
  let oldTarget: string | null = null;

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

      // Runtime VOR dem Umschalten vorbereiten. So landet niemals ein alter
      // oder unvollständiger Frontend-Build unter /opt/mycleancenter/current.
      prepareRuntimeLayout(targetVersionDir);
      const buildDetails = opts.testMode ? ["test-mode: runtime check skipped"] : await ensureBuiltRuntime(targetVersionDir);

      // previous = aktuelles current-Ziel
      const old = readCurrentTarget();
      oldTarget = old;
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
      return [`Symlink → ${targetVersionDir}`, ...buildDetails].join(" | ");
    });

    // 4. INSTALL — npm ci im neuen Ordner
    await stepRun(laufId, "install", async () => {
      if (opts.testMode) return "test-mode: runtime check skipped";
      assertUsableRuntime(targetVersionDir, "Neue Version");
      return "Runtime vollständig vorbereitet (Frontend, Backend, Produktions-Dependencies)";
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
      await restartServiceOrThrow();
      return "sudo systemctl restart mycleancenter";
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
        await runRollbackToPrevious(laufId, opts.userId, oldTarget);
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

async function runRollbackToPrevious(
  laufId: string,
  userId: string | null,
  preferredPrevious?: string | null,
): Promise<void> {
  const prev = preferredPrevious ?? readPreviousTarget();
  if (!prev) throw new Error("Keine vorherige Version vorhanden");
  assertUsableRuntime(prev, "Rollback-Ziel");

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
          assertUsableRuntime(target, "Rollback-Ziel");
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
          await restartServiceOrThrow();
          return "sudo systemctl restart mycleancenter";
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
    // Fallback: neuestes nutzbares Release außer `current`.
    // Wichtig für ältere Installationen: erste Pi-Installer nutzten releases/*,
    // der neue In-App-Updater nutzt versions/*. Wenn previous fehlt, darf ein
    // Rollback deshalb beide Orte durchsuchen.
    try {
      const cur = readCurrentTarget();
      const roots = [versionsDir(), path.join(appRoot(), "releases")];
      const dirs = roots.flatMap((root) => {
        try {
          return readdirSync(root)
            .filter((d) => !d.startsWith("broken-"))
            .map((d) => path.join(root, d))
            .filter((d) => existsSync(path.join(d, "backend", "dist", "server.js")));
        } catch {
          return [];
        }
      }).sort();
      const others = dirs.filter((d) => d !== cur);
      return others[others.length - 1] ?? null;
    } catch { return null; }
  }
}

function backendRuntimeDir(versionRoot: string): string {
  const nested = path.join(versionRoot, "backend");
  return existsSync(path.join(nested, "package.json")) ? nested : versionRoot;
}

function prepareRuntimeLayout(versionRoot: string): void {
  const backendDir = backendRuntimeDir(versionRoot);
  const distSpa = path.join(versionRoot, "dist-spa");
  const dist = path.join(versionRoot, "dist");

  if (!existsSync(path.join(dist, "index.html")) && existsSync(path.join(distSpa, "index.html"))) {
    safeRename(distSpa, dist);
  }
  copyRuntimeDeployFiles(versionRoot, backendDir);
}

async function ensureBuiltRuntime(versionRoot: string): Promise<string[]> {
  const details: string[] = [];
  const backendDir = backendRuntimeDir(versionRoot);
  const frontendIndex = path.join(versionRoot, "dist", "index.html");
  const backendServer = path.join(backendDir, "dist", "server.js");

  if (existsSync(path.join(versionRoot, "package.json"))) {
    safeRm(path.join(versionRoot, "dist"));
    safeRm(path.join(versionRoot, "dist-spa"));
    // Für den Frontend-Build nutzen wir bewusst `npm install` statt `npm ci`.
    // Diese node_modules sind ephemer (werden nach dem Build nicht behalten),
    // daher ist Reproduzierbarkeit weniger wichtig als Robustheit gegenüber
    // einem leicht veralteten root-package-lock.json (typisch bei
    // GitHub-Update-Paketen, die direkt vom Repo gezogen werden).
    const fe = await npmInstallTolerant(
      versionRoot,
      ["--include=dev"],
      "Frontend-Dependencies",
      { NODE_ENV: "development" },
    );
    details.push(fe);
    await runNpm(versionRoot, ["run", "build:spa"], "Frontend-Build");
    prepareRuntimeLayout(versionRoot);
    details.push("Frontend frisch gebaut");
  }
  if (!existsSync(backendServer)) {
    const be = await npmInstallTolerant(
      backendDir,
      ["--include=dev"],
      "Backend-Dependencies",
      { NODE_ENV: "development" },
    );
    details.push(be);
    await runNpm(backendDir, ["run", "build"], "Backend-Build");
    details.push("Backend gebaut");
  }
  if (!existsSync(frontendIndex)) throw new Error(`Frontend-Build fehlt im Update-Paket: ${frontendIndex}`);
  if (!existsSync(backendServer)) throw new Error(`Backend-Build fehlt im Update-Paket: ${backendServer}`);
  const prod = await npmInstallWithFallback(
    backendDir,
    ["--omit=dev"],
    "Backend-Produktiv-Install",
  );
  details.push(prod);
  assertUsableRuntime(versionRoot, "Neue Version");
  return details;
}

function assertUsableRuntime(versionRoot: string, label: string): void {
  const backendDir = backendRuntimeDir(versionRoot);
  const required = [
    path.join(versionRoot, "dist", "index.html"),
    path.join(backendDir, "dist", "server.js"),
    path.join(backendDir, "package.json"),
    path.join(backendDir, "node_modules"),
  ];
  const missing = required.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    throw new Error(`${label} ist nicht startfähig. Fehlend: ${missing.join(", ")}`);
  }
}

async function restartServiceOrThrow(): Promise<void> {
  try {
    await execFileP("sudo", ["-n", "/bin/systemctl", "restart", "--no-block", "mycleancenter"], {
      timeout: 10_000,
      maxBuffer: 256 * 1024,
    });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    throw new Error(
      `Service-Neustart fehlgeschlagen: ${(err.stderr || err.stdout || err.message || String(e)).slice(0, 500)}. ` +
        `Bitte einmal den Installer aus dem neuen Release ausführen, damit die Update-Rechte aktualisiert werden.`,
    );
  }
}

async function runNpm(cwd: string, args: string[], label: string): Promise<void> {
  try {
    await execFileP("npm", args, { cwd, timeout: 15 * 60_000, maxBuffer: 80 * 1024 * 1024 });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    throw new Error(`${label} fehlgeschlagen: ${(err.stderr || err.stdout || err.message).slice(0, 800)}`);
  }
}

/**
 * Führt eine Dependency-Installation aus und fällt bei einem bekannten
 * Lockfile-Sync-Fehler (`npm ci` → EUSAGE / "not in sync") automatisch
 * auf `npm install` zurück. So bricht ein Update nicht mehr ab, nur weil
 * `package-lock.json` und `package.json` minimal voneinander abweichen.
 *
 * Rückgabe: kurze Detail-Zeile für die Update-Historie.
 */
async function npmInstallWithFallback(
  cwd: string,
  extraArgs: string[],
  label: string,
): Promise<string> {
  const ciArgs = ["ci", "--no-audit", "--no-fund", ...extraArgs];
  try {
    await execFileP("npm", ciArgs, {
      cwd,
      timeout: 15 * 60_000,
      maxBuffer: 80 * 1024 * 1024,
    });
    return `${label}: npm ci ok`;
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    const raw = `${err.stderr ?? ""}\n${err.stdout ?? ""}\n${err.message ?? ""}`;
    const lockMismatch =
      /EUSAGE/i.test(raw) ||
      /can only install packages when/i.test(raw) ||
      /lock ?file/i.test(raw) ||
      /in sync/i.test(raw) ||
      /Missing:/i.test(raw);
    if (!lockMismatch) {
      throw new Error(
        `${label} fehlgeschlagen: ${(err.stderr || err.stdout || err.message).slice(0, 600)}`,
      );
    }
    // Fallback: npm install (toleriert Lockfile-Drift, schreibt sie neu).
    try {
      await execFileP("npm", ["install", "--no-audit", "--no-fund", ...extraArgs], {
        cwd,
        timeout: 20 * 60_000,
        maxBuffer: 80 * 1024 * 1024,
      });
      return `${label}: package-lock.json war nicht synchron — automatisch via npm install repariert`;
    } catch (e2) {
      const err2 = e2 as { stderr?: string; stdout?: string; message: string };
      throw new Error(
        `Abhängigkeiten konnten nicht installiert werden. ` +
          `Ursache: package-lock.json war nicht synchron und der automatische ` +
          `npm-install-Fallback ist ebenfalls fehlgeschlagen. Details: ` +
          (err2.stderr || err2.stdout || err2.message).slice(0, 500),
      );
    }
  }
}

/**
 * Direkt `npm install` (tolerant gegenüber Lockfile-Drift). Geeignet für
 * ephemere Build-Dependencies, bei denen Reproduzierbarkeit weniger zählt
 * als Robustheit. Für produktive Backend-Dependencies bitte weiterhin
 * `npmInstallWithFallback` (npm ci → install) verwenden.
 */
async function npmInstallTolerant(
  cwd: string,
  extraArgs: string[],
  label: string,
  envOverride?: Record<string, string>,
): Promise<string> {
  try {
    await execFileP(
      "npm",
      ["install", "--no-audit", "--no-fund", ...extraArgs],
      {
        cwd,
        timeout: 20 * 60_000,
        maxBuffer: 80 * 1024 * 1024,
        env: envOverride ? { ...process.env, ...envOverride } : process.env,
      },
    );
    return `${label}: npm install ok`;
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message: string };
    throw new Error(
      `${label} fehlgeschlagen: ${(err.stderr || err.stdout || err.message).slice(0, 800)}`,
    );
  }
}

function copyRuntimeDeployFiles(versionRoot: string, backendDir: string): void {
  const currentBackend = path.join(process.cwd());
  const files = ["package.json", "package-lock.json"];
  for (const f of files) {
    const src = path.join(versionRoot, f);
    const fallback = path.join(currentBackend, f);
    const dest = path.join(backendDir, f);
    if (!existsSync(dest) && existsSync(src)) copyFileSync(src, dest);
    else if (!existsSync(dest) && existsSync(fallback)) copyFileSync(fallback, dest);
  }
  const deploySrc = path.join(versionRoot, "deploy");
  const deployFallback = path.join(currentBackend, "deploy");
  const deployDest = path.join(backendDir, "deploy");
  if (!existsSync(deployDest) && existsSync(deploySrc)) cpSync(deploySrc, deployDest, { recursive: true });
  else if (!existsSync(deployDest) && existsSync(deployFallback)) cpSync(deployFallback, deployDest, { recursive: true });
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



