import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { openDatabase, closeDatabase, getSchemaVersion } from "./db/index.js";
import { ensureMasterKey } from "./crypto/masterkey.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { einstellungenRoutes } from "./routes/einstellungen.js";
import { backupRoutes } from "./routes/backup.js";
import { stammdatenRoutes } from "./routes/stammdaten.js";
import { belegeRoutes } from "./routes/belege.js";
import { belegePdfRoutes } from "./routes/belege-pdf.js";
import { aktivitaetRoutes } from "./routes/aktivitaet.js";
import { benachrichtigungRoutes } from "./routes/benachrichtigung.js";
import { auditRoutes } from "./routes/audit.js";
import { eventsRoutes } from "./routes/events.js";
import { systemRoutes } from "./routes/system.js";
import { systemGithubRoutes } from "./routes/system-github.js";
import { steuernRoutes } from "./routes/steuern.js";
import { dokumenteRoutes } from "./routes/dokumente.js";
import { protokolleRoutes } from "./routes/protokolle.js";
import { startFristenScheduler } from "./dokumente/fristen-cron.js";
import { mahnungRoutes } from "./routes/mahnung.js";
import { startMahnScheduler } from "./mahnung/cron.js";
import { driveRoutes } from "./routes/drive.js";
import { emailRoutes } from "./routes/email.js";
import { startDriveWorker } from "./drive/upload-worker.js";
import { wireDriveAutoEnqueue } from "./drive/auto-enqueue.js";
import { wireDokumenteDriveAutoEnqueue } from "./dokumente/drive-wireup.js";
import { purgeExpiredSessions as purgeExpiredUploadSessions } from "./dokumente/repo.js";
import { reapStaleLock, cleanupStaleStaging } from "./system/runner.js";
import { purgeExpiredPakete, markStaleLaeufeAlsFehler } from "./system/repo.js";
import { assertCodeAndDataSeparated } from "./system/data-guard.js";
import { cleanupOrphanRestoreTmp } from "./backup/cleanup.js";
import { startBackupReconcileCron } from "./backup/cleanup.js";
import { startBelegeScheduler } from "./belege/scheduler.js";
import { wirePdfCacheInvalidation } from "./pdf/wireup.js";
import { wireAktivitaet } from "./aktivitaet/wireup.js";
import { purgeOldAktivitaeten } from "./aktivitaet/repo.js";
import { purgeOldWegwischte } from "./benachrichtigung/repo.js";
import { purgeExpiredSessions, warmTouchCacheFromDb } from "./auth/sessions.js";
import { purgeOldAuditEntries } from "./auth/audit.js";
import { purgeOldLockouts } from "./auth/lockout.js";
import { reapZombies } from "./backup/repo.js";
import { reconcileDiskState } from "./backup/rotation.js";
import { startScheduler } from "./backup/scheduler.js";
import {
  loadMaintenanceFlagFromDisk,
  maintenanceGuard,
} from "./backup/maintenance.js";

async function main(): Promise<void> {
  for (const dir of [
    config.dataDir,
    config.dbDir,
    config.keysDir,
    config.uploadsDir,
    config.backupsDir,
    config.backupsDailyDir,
    config.backupsWeeklyDir,
    config.backupsMonthlyDir,
    config.backupsSafetyDir,
    config.backupsTmpDir,
    config.logsDir,
  ]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // DATEN-SCHUTZ-WALL: erste Aktion nach Verzeichnis-Setup.
  // Bricht den Boot ab, wenn Code- und Daten-Verzeichnis sich überschneiden.
  assertCodeAndDataSeparated();

  const keyStatus = ensureMasterKey(config.keyPath);
  openDatabase(config.dbPath);

  // DB-Integritäts-Check direkt nach Open. Wenn die Datei korrupt ist,
  // bricht der Boot ab — der User soll lieber das letzte Backup zurückspielen
  // als auf eine kaputte DB schreiben.
  try {
    const { getDatabase } = await import("./db/index.js");
    const integ = getDatabase()
      .prepare("PRAGMA integrity_check")
      .get() as { integrity_check: string } | undefined;
    if (!integ || integ.integrity_check !== "ok") {
      console.error("FATAL: SQLite integrity_check fehlgeschlagen:", integ);
      console.error("Bitte das letzte Backup unter /var/lib/mycleancenter/backups/daily/ wiederherstellen.");
      process.exit(3);
    }
  } catch (e) {
    console.error("FATAL: integrity_check konnte nicht ausgeführt werden:", e);
    process.exit(3);
  }

  // Wartungsmodus von der Platte laden (z. B. nach abgebrochenem Restore)
  loadMaintenanceFlagFromDisk();

  // Backup-Geister beerdigen + Disk/DB synchronisieren + verwaiste Restore-tmp aufräumen
  const zombies = reapZombies();
  const orphans = reconcileDiskState();
  const restoreTmpRemoved = cleanupOrphanRestoreTmp();

  // CORS-Härtung: in Production darf "*" nicht stehen, sonst Bootabbruch.
  if (config.nodeEnv === "production") {
    if (config.corsOrigins.includes("*") || config.corsOrigins.length === 0) {
      console.error(
        "FATAL: In Production muss CORS_ORIGINS explizit gesetzt sein (kommagetrennte Liste). '*' ist mit Cookie-Auth nicht erlaubt.",
      );
      process.exit(2);
    }
  }

  const app = Fastify({
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug",
      transport:
        config.nodeEnv === "production"
          ? undefined
          : { target: "pino/file", options: { destination: 1 } },
    },
    disableRequestLogging: false,
    trustProxy: true,
    bodyLimit: 10 * 1024 * 1024, // normale Routes; Backup-Upload nutzt Multipart-Stream
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "script-src": ["'self'"],
        "font-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        "object-src": ["'none'"],
        "base-uri": ["'self'"],
      },
    },
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    credentials: true,
    exposedHeaders: ["X-Maintenance", "ETag", "X-Pdf-Cache", "Content-Disposition"],
  });
  if (config.nodeEnv !== "production" && config.corsOrigins.includes("*")) {
    app.log.warn("CORS = '*' (DEV-Modus). In Production explizit setzen.");
  }
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });
  await app.register(multipart, {
    limits: {
      fileSize: 2 * 1024 * 1024 * 1024, // 2 GB Backup-Upload
      files: 1,
    },
  });

  // Wartungsmodus-Hook: muss VOR allen Routen sitzen
  app.addHook("preHandler", maintenanceGuard);

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, "Request failed");
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply.status(status).send({
      error: status >= 500 ? "Internal Server Error" : err.message,
      statusCode: status,
    });
  });

  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(einstellungenRoutes);
  await app.register(backupRoutes);
  await app.register(stammdatenRoutes);
  await app.register(belegeRoutes);
  await app.register(belegePdfRoutes);
  await app.register(aktivitaetRoutes);
  await app.register(benachrichtigungRoutes);
  await app.register(auditRoutes);
  await app.register(eventsRoutes);
  await app.register(systemRoutes);
  await app.register(systemGithubRoutes);
  await app.register(steuernRoutes);
  await app.register(dokumenteRoutes);
  await app.register(protokolleRoutes);
  await app.register(mahnungRoutes);
  await app.register(driveRoutes);
  await app.register(emailRoutes);

  // Frontend-Statics — nur wenn FRONTEND_DIR existiert (Prod / Pi-Bundle).
  // Im Dev läuft das Frontend separat über Vite, daher hier kein Fehler.
  if (existsSync(config.frontendDir)) {
    const fastifyStatic = (await import("@fastify/static")).default;
    await app.register(fastifyStatic, {
      root: config.frontendDir,
      prefix: "/",
      decorateReply: true,
      wildcard: false,
      index: ["index.html"],
    });
    // Pi-Auslieferung: Das Backend liefert die gebaute App als statische SPA aus.
    // Kein SSR auf dem Raspberry Pi — so vermeiden wir TanStack-SSR-Runtime-Drift.
    const spaIndex = path.resolve(config.frontendDir, "index.html");
    const hasSpaIndex = existsSync(spaIndex);
    if (!hasSpaIndex) {
      app.log.warn({ spaIndex }, "SPA index.html fehlt — Frontend nicht erreichbar");
    }

    const isBackendApi = (url: string): boolean =>
      url.startsWith("/auth") ||
      url.startsWith("/health") ||
      url.startsWith("/einstellungen") ||
      url.startsWith("/backup") ||
      url.startsWith("/stammdaten") ||
      url.startsWith("/kunden") ||
      url.startsWith("/angebote") ||
      url.startsWith("/rechnungen") ||
      url.startsWith("/aktivitaet") ||
      url.startsWith("/benachrichtigungen") ||
      url.startsWith("/audit") ||
      url.startsWith("/events") ||
      url.startsWith("/system") ||
      url.startsWith("/steuern") ||
      url.startsWith("/dokumente") ||
      url.startsWith("/protokolle") ||
      url.startsWith("/mahnung");

    app.setNotFoundHandler(async (req, reply) => {
      const url = req.raw.url ?? "/";
      const acceptsHtml = String(req.headers.accept ?? "").includes("text/html");
      if (isBackendApi(url) && !acceptsHtml) {
        return reply.status(404).send({ error: "Not found", statusCode: 404 });
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        return reply.status(404).send({ error: "Not found", statusCode: 404 });
      }
      if (!acceptsHtml) {
        return reply.status(404).send({ error: "Not found", statusCode: 404 });
      }
      if (!hasSpaIndex) {
        return reply.status(503).send({ error: "Frontend nicht verfügbar", statusCode: 503 });
      }
      return reply.type("text/html; charset=utf-8").sendFile("index.html");
    });
    app.log.info({ frontendDir: config.frontendDir }, "Frontend-Statics aktiv");
  } else {
    app.log.warn(
      { frontendDir: config.frontendDir },
      "FRONTEND_DIR existiert nicht — Frontend wird vom Backend NICHT ausgeliefert (Dev-Modus ok)",
    );
  }

  // PDF-Cache an Belege-Mutationen koppeln
  wirePdfCacheInvalidation();
  // Aktivitäts/Benachrichtigungs-Übersetzung der Bus-Events
  wireAktivitaet();
  // Drive-Auto-Enqueue (Belege + Dokumente)
  wireDriveAutoEnqueue();
  wireDokumenteDriveAutoEnqueue();

  // Touch-Throttle aus DB warmladen → kein Update-Sturm nach Restart
  const warmed = warmTouchCacheFromDb();

  // Stale Lock-File aus abgebrochenem Update aufräumen
  const staleLock = reapStaleLock();
  if (staleLock) app.log.warn("Stale System-Update Lock aufgeräumt");
  // Hängende Update-Läufe (status='laeuft') als Fehler markieren — Backend
  // ist neu gestartet, also kann kein Update mehr aktiv sein.
  const reapedLaeufe = markStaleLaeufeAlsFehler();
  if (reapedLaeufe > 0) app.log.warn({ reapedLaeufe }, "Hängende Update-Läufe als 'fehler' markiert");
  // Staging-Reste älter 1 h aufräumen
  const stagingRm = cleanupStaleStaging();
  if (stagingRm > 0) app.log.info({ stagingRm }, "Update-Staging Reste entfernt");

  // Belegnummer-Zähler aus realen Belegen nachziehen (idempotent).
  try {
    const { importScanZaehler } = await import("./belege/belegnummer.js");
    const scan = importScanZaehler();
    app.log.info({ scan }, "Belegnummer-Zähler synchronisiert");
  } catch (e) {
    app.log.error({ err: e }, "Belegnummer-Importscan fehlgeschlagen");
  }

  // Backup-Scheduler starten (täglicher Snapshot)
  startScheduler();
  // Täglicher Reconcile-Cron (DB ↔ Disk-Konsistenz)
  startBackupReconcileCron();
  // Belege-Scheduler (überfällig-Markierung) starten
  startBelegeScheduler();
  // Drive-Upload Worker (Cron-basiert, jede Minute)
  startDriveWorker();
  // Dokumente-Frist-Cron (täglich nach 07:00 Pi-Zeit)
  startFristenScheduler();
  // Mahn-Automatik (Cron) STILLGELEGT — niemals automatischer Mail-Versand.
  // Mahnungen werden nur manuell durch den User im Mahnwesen-Tab ausgelöst.
  // startMahnScheduler();
  void startMahnScheduler; // typecheck-Anker

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      port: config.port,
      dataDir: config.dataDir,
      schemaVersion: getSchemaVersion(),
      masterKeyCreated: keyStatus.created,
      sessionsWarmed: warmed,
      backupZombiesReaped: zombies,
      backupOrphansRemoved: orphans,
      restoreTmpRemoved,
    },
    "MyCleanCenter backend ready",
  );

  // Hintergrund-Sweeps
  const sweepId = setInterval(() => {
    try {
      const sess = purgeExpiredSessions();
      const audit = purgeOldAuditEntries();
      const lock = purgeOldLockouts();
      const akt = purgeOldAktivitaeten();
      const ben = purgeOldWegwischte();
      const pak = purgeExpiredPakete();
      const ups = purgeExpiredUploadSessions();
      const stg = cleanupStaleStaging();
      if (sess + audit + lock + akt + ben + pak + ups + stg > 0) {
        app.log.info({ sess, audit, lock, akt, ben, pak, ups, stg }, "background sweep");
      }
    } catch (e) {
      app.log.warn({ err: e }, "sweep failed");
    }
  }, 10 * 60_000);
  sweepId.unref?.();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down");
    try {
      clearInterval(sweepId);
      await app.close();
    } finally {
      closeDatabase();
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
