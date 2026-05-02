import Fastify from "fastify";
import cors from "@fastify/cors";
import { existsSync, mkdirSync } from "node:fs";
import { config } from "./config.js";
import { openDatabase, closeDatabase, getSchemaVersion } from "./db/index.js";
import { ensureMasterKey } from "./crypto/masterkey.js";
import { healthRoutes } from "./routes/health.js";

async function main(): Promise<void> {
  // 1) Daten-Verzeichnisse anlegen (nur fehlende — niemals existierende anfassen)
  for (const dir of [
    config.dataDir,
    `${config.dataDir}/db`,
    `${config.dataDir}/keys`,
    config.uploadsDir,
    config.backupsDir,
    config.logsDir,
  ]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  // 2) Master-Key sicherstellen (NIEMALS loggen)
  const keyStatus = ensureMasterKey(config.keyPath);

  // 3) DB öffnen + Migrationen laufen
  openDatabase(config.dbPath);

  // 4) Fastify
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
  });

  await app.register(cors, {
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    credentials: true,
  });

  // Globaler Error-Handler — niemals Stacktrace an Client
  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, "Request failed");
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    reply.status(status).send({
      error: status >= 500 ? "Internal Server Error" : err.message,
      statusCode: status,
    });
  });

  await app.register(healthRoutes);

  // 5) Start
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    {
      port: config.port,
      dataDir: config.dataDir,
      schemaVersion: getSchemaVersion(),
      masterKeyCreated: keyStatus.created,
    },
    "MyCleanCenter backend ready",
  );

  // 6) Graceful Shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "Shutting down");
    try {
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
