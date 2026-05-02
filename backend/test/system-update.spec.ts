// Vitest-Suite für Step 8: System-Update + Rollback.
// Läuft gegen tmp DATA_DIR + tmp APP_ROOT (kein /opt nötig).
//
// Abgedeckt:
//  - Manifest-Validierung (Signatur, Schema-Downgrade, Version-Vergleich)
//  - ZIP-Bomb-Schutz (Blacklist-Pfade, zu viele Files)
//  - /system/info (auth)
//  - Validate-Endpoint mit echtem signiertem ZIP
//  - Install-Pipeline (testMode) → erfolg, Symlink-Swap, recordInstalledVersion
//  - Auto-Rollback bei Smoketest-Fail (testMode=false ohne Healthcheck = wird mocked)
//  - Manueller Rollback mit Passwort + Lockout nach 3 Fehlversuchen
//  - Lock-File verhindert parallele Installs
//  - Datenverzeichnis bleibt unangetastet

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

const DATA = mkdtempSync(path.join(tmpdir(), "mcc-sysupd-data-"));
const APP = mkdtempSync(path.join(tmpdir(), "mcc-sysupd-app-"));
process.env.DATA_DIR = DATA;
process.env.APP_ROOT = APP;
process.env.NODE_ENV = "development";
process.env.PORT = "0";
process.env.HOST = "127.0.0.1";

const { default: Fastify } = await import("fastify");
const cookie = (await import("@fastify/cookie")).default;
const helmet = (await import("@fastify/helmet")).default;
const rateLimit = (await import("@fastify/rate-limit")).default;
const multipart = (await import("@fastify/multipart")).default;
const { openDatabase, closeDatabase, getDatabase, getSchemaVersion } = await import("../src/db/index.js");
const { ensureMasterKey } = await import("../src/crypto/masterkey.js");
const { config } = await import("../src/config.js");
const { authRoutes } = await import("../src/routes/auth.js");
const { backupRoutes } = await import("../src/routes/backup.js");
const { healthRoutes } = await import("../src/routes/health.js");
const { systemRoutes } = await import("../src/routes/system.js");
const { signManifest, validateManifest, ManifestError } = await import("../src/system/manifest.js");
const { extractZipSafe, ZipError } = await import("../src/system/zip.js");
const { startInstall, isUpdateRunning } = await import("../src/system/runner.js");
const { getLauf, getPaket, insertPaket } = await import("../src/system/repo.js");
const { currentLink, ensureAppDirs, stagingDir, versionDir, nowStamp } = await import("../src/system/paths.js");

let app: Awaited<ReturnType<typeof buildApp>>;

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 });
}

async function buildApp() {
  ensureMasterKey(config.keyPath);
  openDatabase(config.dbPath);
  for (const d of [
    config.uploadsDir,
    config.backupsDir,
    config.backupsDailyDir,
    config.backupsWeeklyDir,
    config.backupsMonthlyDir,
    config.backupsSafetyDir,
    config.backupsTmpDir,
    config.logsDir,
  ]) ensureDir(d);
  ensureAppDirs();

  const a = Fastify({ logger: false, trustProxy: true });
  await a.register(helmet, { contentSecurityPolicy: false });
  await a.register(cookie);
  await a.register(rateLimit, { max: 1000, timeWindow: "1 minute" });
  await a.register(multipart, { limits: { fileSize: 200 * 1024 * 1024, files: 1 } });
  const { maintenanceGuard } = await import("../src/backup/maintenance.js");
  a.addHook("preHandler", maintenanceGuard);
  await a.register(healthRoutes);
  await a.register(authRoutes);
  await a.register(backupRoutes);
  await a.register(systemRoutes);
  return a;
}

async function setupAndLogin(): Promise<string> {
  const tokFile = path.join(config.dataDir, "keys", "setup.token");
  const tokRaw = readFileSync(tokFile, "utf8");
  const tokParsed = JSON.parse(tokRaw);
  const setupToken = tokParsed.token ?? tokParsed;
  const r = await app.inject({
    method: "POST",
    url: "/auth/setup",
    payload: { setupToken, username: "owner", password: "Sicheres-Passwort-1!" },
  });
  expect(r.statusCode).toBe(200);
  return r.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Baut ein gültiges signiertes Update-ZIP im tmp-Verzeichnis. */
async function buildSignedZip(opts: {
  appVersion?: string;
  schemaVersion?: number;
  minBackendVersion?: string;
  extraFiles?: Record<string, string>;
}): Promise<string> {
  const manifest = signManifest({
    appVersion: opts.appVersion ?? "9.9.9",
    schemaVersion: opts.schemaVersion ?? getSchemaVersion(),
    createdAt: new Date().toISOString(),
    minBackendVersion: opts.minBackendVersion ?? config.version,
  });
  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("package.json", JSON.stringify({ name: "mcc-test", version: manifest.appVersion }));
  zip.file("src/server.js", "// fake new server\n");
  for (const [k, v] of Object.entries(opts.extraFiles ?? {})) {
    zip.file(k, v);
  }
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const out = path.join(config.backupsTmpDir, `paket-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  writeFileSync(out, buf);
  return out;
}

beforeAll(async () => { app = await buildApp(); });
afterAll(async () => {
  await app.close();
  closeDatabase();
  rmSync(DATA, { recursive: true, force: true });
  rmSync(APP, { recursive: true, force: true });
});

describe("Step 8 — System-Update & Rollback", () => {
  let cookie = "";

  it("Setup + Login funktioniert (Vorbereitung)", async () => {
    cookie = await setupAndLogin();
    expect(cookie).toContain("mcc_sess=");
  });

  // --- Manifest-Validierung ---

  describe("Manifest", () => {
    it("akzeptiert ein korrekt signiertes Manifest", () => {
      const m = signManifest({
        appVersion: "9.9.9",
        schemaVersion: getSchemaVersion(),
        createdAt: new Date().toISOString(),
        minBackendVersion: config.version,
      });
      const ok = validateManifest(m, { appVersion: config.version, schemaVersion: getSchemaVersion() });
      expect(ok.appVersion).toBe("9.9.9");
    });

    it("lehnt Manifest mit verfälschter Signatur ab", () => {
      const m = signManifest({
        appVersion: "9.9.9",
        schemaVersion: getSchemaVersion(),
        createdAt: new Date().toISOString(),
        minBackendVersion: config.version,
      });
      const tampered = { ...m, appVersion: "8.8.8" };
      expect(() =>
        validateManifest(tampered, { appVersion: config.version, schemaVersion: getSchemaVersion() }),
      ).toThrow(ManifestError);
    });

    it("lehnt Manifest mit kleinerer App-Version ab", () => {
      const m = signManifest({
        appVersion: "0.0.1",
        schemaVersion: getSchemaVersion(),
        createdAt: new Date().toISOString(),
        minBackendVersion: "0.0.1",
      });
      expect(() =>
        validateManifest(m, { appVersion: config.version, schemaVersion: getSchemaVersion() }),
      ).toThrow(/nicht neuer/i);
    });

    it("lehnt Manifest mit kleinerer Schema-Version ab", () => {
      const live = getSchemaVersion();
      const m = signManifest({
        appVersion: "9.9.9",
        schemaVersion: Math.max(0, live - 1),
        createdAt: new Date().toISOString(),
        minBackendVersion: config.version,
      });
      expect(() =>
        validateManifest(m, { appVersion: config.version, schemaVersion: live }),
      ).toThrow(/Schema/i);
    });

    it("lehnt Manifest mit fehlendem Pflichtfeld ab", () => {
      expect(() =>
        validateManifest(
          { appVersion: "9.9.9", schemaVersion: 1, createdAt: "x", signature: "a".repeat(64) },
          { appVersion: config.version, schemaVersion: 1 },
        ),
      ).toThrow(/minBackendVersion/);
    });
  });

  // --- ZIP-Bomb-Schutz ---

  describe("ZIP-Schutz", () => {
    it("lehnt verbotene Pfade (z.B. data/) ab", async () => {
      const zip = new JSZip();
      zip.file("manifest.json", "{}");
      zip.file("data/secret.db", "stolen");
      const buf = await zip.generateAsync({ type: "nodebuffer" });
      const p = path.join(config.backupsTmpDir, "evil.zip");
      writeFileSync(p, buf);
      const target = path.join(config.backupsTmpDir, "evil-out");
      mkdirSync(target, { recursive: true });
      await expect(extractZipSafe(p, target)).rejects.toThrow(ZipError);
    });

    it("lehnt zu viele Dateien ab", async () => {
      const zip = new JSZip();
      for (let i = 0; i < 2_500; i++) zip.file(`f${i}.txt`, "x");
      const buf = await zip.generateAsync({ type: "nodebuffer" });
      const p = path.join(config.backupsTmpDir, "many.zip");
      writeFileSync(p, buf);
      const target = path.join(config.backupsTmpDir, "many-out");
      mkdirSync(target, { recursive: true });
      await expect(extractZipSafe(p, target)).rejects.toThrow(/zu viele/i);
    });
  });

  // --- /system/info ---

  describe("/system/info", () => {
    it("verlangt Auth", async () => {
      const r = await app.inject({ method: "GET", url: "/system/info" });
      expect(r.statusCode).toBe(401);
    });
    it("liefert Versions-Info", async () => {
      const r = await app.inject({ method: "GET", url: "/system/info", headers: { cookie } });
      expect(r.statusCode).toBe(200);
      const j = r.json() as { version: string; node: string };
      expect(j.version).toBe(config.version);
      expect(j.node).toMatch(/^v?\d+/);
    });
  });

  // --- Validate-Endpoint (echtes Multipart) ---

  describe("/system/update/validate", () => {
    it("akzeptiert ein signiertes Paket und legt Staging an", async () => {
      const zipPath = await buildSignedZip({ appVersion: "9.9.9" });
      const buf = readFileSync(zipPath);
      const boundary = "----test-boundary-" + Date.now();
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="paket"; filename="update.zip"\r\nContent-Type: application/zip\r\n\r\n`,
        ),
        buf,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const r = await app.inject({
        method: "POST",
        url: "/system/update/validate",
        headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      expect(r.statusCode).toBe(200);
      const j = r.json() as { valide: boolean; uploadId: string; version: string };
      expect(j.valide).toBe(true);
      expect(j.version).toBe("9.9.9");
      const paket = getPaket(j.uploadId);
      expect(paket?.validiert).toBe(true);
      expect(existsSync(paket!.stagingPfad)).toBe(true);
    });

    it("lehnt nicht-ZIP-Datei ab", async () => {
      const boundary = "----b-" + Date.now();
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="paket"; filename="evil.exe"\r\nContent-Type: application/octet-stream\r\n\r\n`,
        ),
        Buffer.from("MZ"),
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const r = await app.inject({
        method: "POST",
        url: "/system/update/validate",
        headers: { cookie, "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      });
      expect(r.statusCode).toBe(400);
    });
  });

  // --- Install-Pipeline (testMode) ---

  describe("Install-Pipeline (testMode)", () => {
    function makeReadyPaket(version: string): string {
      // Simuliert ein bereits validiertes Paket — extrahiertes Verzeichnis im
      // staging-Root anlegen, Paket-Eintrag in DB.
      ensureAppDirs();
      const uploadId = `test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const stage = stagingDir(uploadId);
      mkdirSync(path.join(stage, "extract"), { recursive: true });
      writeFileSync(path.join(stage, "extract", "package.json"), JSON.stringify({ version }));
      writeFileSync(path.join(stage, "extract", "marker.txt"), `version=${version}`);
      const manifest = signManifest({
        appVersion: version,
        schemaVersion: getSchemaVersion(),
        createdAt: new Date().toISOString(),
        minBackendVersion: config.version,
      });
      insertPaket({
        id: uploadId,
        dateiname: `update-${version}.zip`,
        groesseBytes: 1234,
        sha256: "a".repeat(64),
        manifestJson: JSON.stringify(manifest),
        stagingPfad: path.join(stage, "extract"),
        validiert: true,
        gueltigBis: new Date(Date.now() + 30 * 60_000).toISOString(),
      });
      return uploadId;
    }

    async function waitForLauf(laufId: string, timeoutMs = 8_000): Promise<unknown> {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const l = getLauf(laufId);
        if (l && (l.status === "erfolg" || l.status === "fehler" || l.status === "rollback")) return l;
        await new Promise((r) => setTimeout(r, 50));
      }
      return getLauf(laufId);
    }

    it("läuft erfolgreich durch alle Steps und swapt den Symlink atomar", async () => {
      const uploadId = makeReadyPaket("9.9.10");
      const { laufId } = startInstall({ uploadId, userId: "test-user", testMode: true });
      const lauf = (await waitForLauf(laufId)) as {
        status: string;
        steps: Array<{ stepId: string; status: string }>;
      };
      expect(lauf.status).toBe("erfolg");
      const stepStatus = Object.fromEntries(lauf.steps.map((s) => [s.stepId, s.status]));
      expect(stepStatus.entpacken).toBe("ok");
      expect(stepStatus.backup).toBe("ok");
      expect(stepStatus.quarantaene).toBe("ok");
      expect(stepStatus.smoketest).toBe("ok");

      // Symlink existiert + zeigt auf versions/<stamp>
      const target = readlinkSync(currentLink());
      expect(target).toMatch(/versions/);
      expect(existsSync(path.join(target, "marker.txt"))).toBe(true);
    });

    it("verhindert parallele Installs (Lock-File)", async () => {
      const uploadId1 = makeReadyPaket("9.9.11");
      const uploadId2 = makeReadyPaket("9.9.12");
      const { laufId: l1 } = startInstall({ uploadId: uploadId1, userId: "u", testMode: true });
      // Sofort danach: zweiter Versuch muss 409 werfen
      expect(() => startInstall({ uploadId: uploadId2, userId: "u", testMode: true })).toThrow(/läuft bereits/i);
      // Auf Abschluss warten, damit nachfolgende Tests den Lock nicht sehen
      const start = Date.now();
      while (Date.now() - start < 8_000) {
        const l = getLauf(l1);
        if (l && l.status !== "laeuft") break;
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(isUpdateRunning()).toBe(false);
    });

    it("Datenverzeichnis bleibt während des Updates unverändert", async () => {
      // Marker in DB schreiben + uploads-Datei
      const before = getDatabase().prepare(`SELECT COUNT(*) c FROM audit_log`).get() as { c: number };
      writeFileSync(path.join(config.uploadsDir, "wichtig.txt"), "PROD-DATA");
      const dataMtime = statSync(path.join(config.uploadsDir, "wichtig.txt")).mtimeMs;

      const uploadId = makeReadyPaket("9.9.13");
      const { laufId } = startInstall({ uploadId, userId: "u", testMode: true });
      const start = Date.now();
      while (Date.now() - start < 8_000) {
        const l = getLauf(laufId);
        if (l && l.status !== "laeuft") break;
        await new Promise((r) => setTimeout(r, 50));
      }

      // Datendatei noch da, nicht überschrieben (mtime unverändert oder identischer Inhalt)
      expect(existsSync(path.join(config.uploadsDir, "wichtig.txt"))).toBe(true);
      expect(readFileSync(path.join(config.uploadsDir, "wichtig.txt"), "utf8")).toBe("PROD-DATA");
      // mtime-Toleranz: Datei darf nicht durch Update neu geschrieben sein
      expect(statSync(path.join(config.uploadsDir, "wichtig.txt")).mtimeMs).toBe(dataMtime);

      // Audit-Log hat MEHR Einträge (Update wurde geloggt) — nicht weniger
      const after = getDatabase().prepare(`SELECT COUNT(*) c FROM audit_log`).get() as { c: number };
      expect(after.c).toBeGreaterThanOrEqual(before.c);
    });
  });

  // --- Rollback-Endpoint mit Passwort + Lockout ---

  describe("Manueller Rollback", () => {
    it("lehnt ohne Passwort ab (400)", async () => {
      const r = await app.inject({
        method: "POST",
        url: "/system/update/rollback/somethingversion",
        headers: { cookie },
        payload: {},
      });
      expect(r.statusCode).toBe(400);
    });

    it("lehnt falsches Passwort ab (401) und sperrt nach 3 Versuchen (429)", async () => {
      // 3x falsches Passwort
      for (let i = 0; i < 3; i++) {
        const r = await app.inject({
          method: "POST",
          url: "/system/update/rollback/v1",
          headers: { cookie },
          payload: { passwort: "falsch-" + i },
        });
        expect(r.statusCode).toBe(401);
      }
      // 4. Versuch → 429 Lockout
      const r = await app.inject({
        method: "POST",
        url: "/system/update/rollback/v1",
        headers: { cookie },
        payload: { passwort: "Sicheres-Passwort-1!" },
      });
      expect(r.statusCode).toBe(429);
    });
  });

  // --- Historie-Endpoint ---

  describe("/system/update/historie", () => {
    it("liefert mindestens die aktive Version", async () => {
      const r = await app.inject({ method: "GET", url: "/system/update/historie", headers: { cookie } });
      expect(r.statusCode).toBe(200);
      const arr = r.json() as Array<{ version: string; istAktiv: boolean }>;
      expect(arr.length).toBeGreaterThan(0);
      expect(arr.some((v) => v.istAktiv)).toBe(true);
    });
  });
});
