import path from "node:path";

const DEFAULT_DATA_DIR =
  process.env.NODE_ENV === "production"
    ? "/var/lib/mycleancenter"
    : path.resolve(process.cwd(), "data");

export const config = {
  version: "0.1.0",
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  dataDir: process.env.DATA_DIR ?? DEFAULT_DATA_DIR,
  get dbPath() {
    return path.join(this.dataDir, "db", "mycleancenter.db");
  },
  get keyPath() {
    return path.join(this.dataDir, "keys", "master.key");
  },
  get uploadsDir() {
    return path.join(this.dataDir, "uploads");
  },
  get backupsDir() {
    return path.join(this.dataDir, "backups");
  },
  get logsDir() {
    return path.join(this.dataDir, "logs");
  },
  // CORS: LAN + Lovable Preview erlaubt. Im Dev sehr permissiv.
  corsOrigins: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),
} as const;

export type AppConfig = typeof config;
