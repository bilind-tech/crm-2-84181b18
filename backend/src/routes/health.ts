import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { getDatabase, getSchemaVersion, isWalActive } from "../db/index.js";
import { existsSync, statfsSync } from "node:fs";
import { requireAuth } from "../auth/middleware.js";

const startTime = Date.now();

function diskFreeBytes(dir: string): number | null {
  try {
    const s = statfsSync(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    const db = getDatabase();
    let dbOk = false;
    try {
      const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
      dbOk = row?.ok === 1;
    } catch {
      dbOk = false;
    }

    return {
      status: dbOk ? "ok" : "degraded",
      version: config.version,
      schemaVersion: getSchemaVersion(),
      db: { ok: dbOk, wal: isWalActive(db), path: config.dbPath },
      masterKey: { present: existsSync(config.keyPath) },
      uptimeSec: Math.floor((Date.now() - startTime) / 1000),
    };
  });

  app.get("/version", async () => ({
    version: config.version,
    schemaVersion: getSchemaVersion(),
  }));

  // Detail nur eingeloggt
  app.get("/health/detail", { preHandler: requireAuth }, async () => {
    const db = getDatabase();
    const userCnt = (db.prepare(`SELECT COUNT(*) AS c FROM app_user`).get() as { c: number }).c;
    const sessCnt = (db.prepare(`SELECT COUNT(*) AS c FROM auth_session`).get() as { c: number }).c;
    const auditCnt = (db.prepare(`SELECT COUNT(*) AS c FROM audit_log`).get() as { c: number }).c;
    const free = diskFreeBytes(config.dataDir);
    return {
      version: config.version,
      schemaVersion: getSchemaVersion(),
      uptimeSec: Math.floor((Date.now() - startTime) / 1000),
      counts: { user: userCnt, session: sessCnt, audit: auditCnt },
      disk: { dataDir: config.dataDir, freeBytes: free },
      memory: process.memoryUsage(),
    };
  });
}
