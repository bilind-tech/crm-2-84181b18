import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { existsSync, mkdirSync } from "node:fs";
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
import { steuernRoutes } from "./routes/steuern.js";
import { dokumenteRoutes } from "./routes/dokumente.js";
import { startFristenScheduler } from "./dokumente/fristen-cron.js";
import { purgeExpiredSessions as purgeExpiredUploadSessions } from "./dokumente/repo.js";
import { reapStaleLock } from "./system/runner.js";
import { purgeExpiredPakete } from "./system/repo.js";
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

  const keyStatus = ensureMasterKey(config.keyPath);
  openDatabase(config.dbPath);

  // Wartungsmodus von der Platte laden (z. B. nach abgebrochenem Restore)
  loadMaintenanceFlagFromDisk();

  // Backup-Geister beerdigen + Disk/DB synchronisieren
  const zombies = reapZombies();
  const orphans = reconcileDiskState();

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

  await app.register(helmet, { contentSecurityPolicy: false });
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
  await app.register(steuernRoutes);
  await app.register(dokumenteRoutes);

  // PDF-Cache an Belege-Mutationen koppeln
  wirePdfCacheInvalidation();
  // Aktivitäts/Benachrichtigungs-Übersetzung der Bus-Events
  wireAktivitaet();

  // Touch-Throttle aus DB warmladen → kein Update-Sturm nach Restart
  const warmed = warmTouchCacheFromDb();

  // Stale Lock-File aus abgebrochenem Update aufräumen
  const staleLock = reapStaleLock();
  if (staleLock) app.log.warn("Stale System-Update Lock aufgeräumt");

  // Backup-Scheduler starten
  startScheduler();
  // Belege-Scheduler (überfällig-Markierung) starten
  startBelegeScheduler();
  // Dokumente-Frist-Cron (täglich nach 07:00 Pi-Zeit)
  startFristenScheduler();

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
      if (sess + audit + lock + akt + ben + pak + ups > 0) {
        app.log.info({ sess, audit, lock, akt, ben, pak, ups }, "background sweep");
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
