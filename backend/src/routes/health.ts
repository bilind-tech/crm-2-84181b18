import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { getDatabase, getSchemaVersion, isWalActive } from "../db/index.js";
import { existsSync } from "node:fs";

const startTime = Date.now();

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
      db: {
        ok: dbOk,
        wal: isWalActive(db),
        path: config.dbPath,
      },
      masterKey: {
        present: existsSync(config.keyPath),
      },
      uptimeSec: Math.floor((Date.now() - startTime) / 1000),
    };
  });

  app.get("/version", async () => ({
    version: config.version,
    schemaVersion: getSchemaVersion(),
  }));
}
