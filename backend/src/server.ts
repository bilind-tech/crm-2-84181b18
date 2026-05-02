import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { existsSync, mkdirSync } from "node:fs";
import { config } from "./config.js";
import { openDatabase, closeDatabase, getSchemaVersion } from "./db/index.js";
import { ensureMasterKey } from "./crypto/masterkey.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { einstellungenRoutes } from "./routes/einstellungen.js";
import { purgeExpiredSessions } from "./auth/sessions.js";

async function main(): Promise<void> {
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

  const keyStatus = ensureMasterKey(config.keyPath);
  openDatabase(config.dbPath);

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

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cookie);
  await app.register(cors, {
    origin: config.corsOrigins.includes("*") ? true : config.corsOrigins,
    credentials: true,
  });
  await app.register(rateLimit, {
    max: 200,
    timeWindow: "1 minute",
  });

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

  // Hintergrund: abgelaufene Sessions wegräumen (alle 10 Min)
  const sweepId = setInterval(() => {
    try {
      const n = purgeExpiredSessions();
      if (n > 0) app.log.info({ purged: n }, "expired sessions purged");
    } catch (e) {
      app.log.warn({ err: e }, "session purge failed");
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
