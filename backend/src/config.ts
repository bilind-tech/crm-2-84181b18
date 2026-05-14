import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

// Zentrale DB-Datei-Konstante. Backup, Restore und Live müssen denselben
// Namen verwenden, sonst landet ein Restore in einer toten Datei.
export const DB_FILENAME = "mycleancenter.db";

const DEFAULT_DATA_DIR =
  process.env.NODE_ENV === "production"
    ? "/var/lib/mycleancenter"
    : path.resolve(process.cwd(), "data");

export const config = {
  version: "0.2.0",
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "0.0.0.0",
  nodeEnv: process.env.NODE_ENV ?? "development",
  dataDir: process.env.DATA_DIR ?? DEFAULT_DATA_DIR,
  get dbPath() {
    return path.join(this.dataDir, "db", DB_FILENAME);
  },
  get dbDir() {
    return path.join(this.dataDir, "db");
  },
  get keyPath() {
    return path.join(this.dataDir, "keys", "master.key");
  },
  get keysDir() {
    return path.join(this.dataDir, "keys");
  },
  get uploadsDir() {
    return path.join(this.dataDir, "uploads");
  },
  get backupsDir() {
    return path.join(this.dataDir, "backups");
  },
  get backupsDailyDir() {
    return path.join(this.backupsDir, "daily");
  },
  get backupsWeeklyDir() {
    return path.join(this.backupsDir, "weekly");
  },
  get backupsMonthlyDir() {
    return path.join(this.backupsDir, "monthly");
  },
  get backupsSafetyDir() {
    return path.join(this.backupsDir, "safety");
  },
  get backupsTmpDir() {
    return path.join(this.backupsDir, "tmp");
  },
  get logsDir() {
    return path.join(this.dataDir, "logs");
  },
  get maintenanceFlagPath() {
    return path.join(this.dataDir, "maintenance.flag");
  },
  // Frontend-Statics — vom Backend ausgeliefert (Pi: dist/ neben backend/).
  // Override via FRONTEND_DIR. Wenn Verzeichnis fehlt, wird Static-Plugin nicht geladen.
  frontendDir:
    process.env.FRONTEND_DIR ??
    (process.env.NODE_ENV === "production"
      ? "/opt/mycleancenter/current/dist"
      : path.resolve(process.cwd(), "..", "dist")),
  // CORS: LAN + Lovable Preview erlaubt. Im Dev sehr permissiv.
  corsOrigins: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),
} as const;

export type AppConfig = typeof config;

/**
 * Prüft beim Backend-Start, dass `DATA_DIR` auf einem echten externen
 * Datenträger liegt (USB-SSD), nicht auf der SD-Karte. Schreibt im Fehlerfall
 * eine deutliche Warnung — startet aber trotzdem, damit das System bei Defekt
 * der SSD nicht komplett offline ist.
 *
 * Rückgabe: { ok, mountInfo, warning } für Diagnose & Doctor.
 */
export function inspectDataDir(): {
  ok: boolean;
  resolved: string;
  warning: string | null;
  freeBytes: number | null;
} {
  let resolved = config.dataDir;
  try {
    resolved = fs.realpathSync(config.dataDir);
  } catch {
    // Verzeichnis existiert noch nicht → wird gleich angelegt, kein Fehler.
  }

  let freeBytes: number | null = null;
  try {
    const s = fs.statfsSync(resolved);
    freeBytes = Number(s.bavail) * Number(s.bsize) || null;
  } catch {
    /* ignore */
  }

  // Nur in Production prüfen — im Dev ist alles auf der lokalen Disk OK.
  if (config.nodeEnv !== "production") {
    return { ok: true, resolved, warning: null, freeBytes };
  }

  // Heuristik: SD-Karte unter Raspberry Pi heißt typischerweise mmcblk0p2 und
  // ist als `/`-Root gemountet. Wenn unser DATA_DIR auf demselben Mountpoint
  // wie `/` liegt, ist es höchstwahrscheinlich die SD-Karte.
  try {
    const dfLine = (p: string): string => {
      const out = execFileSync("df", ["-P", p], { encoding: "utf8", timeout: 2000 });
      const lines = out.trim().split("\n");
      return (lines[lines.length - 1] || "").split(/\s+/)[0] ?? "";
    };
    const dataMount = dfLine(resolved);
    const rootMount = dfLine("/");
    if (dataMount === rootMount) {
      return {
        ok: false,
        resolved,
        freeBytes,
        warning:
          `DATA_DIR (${resolved}) liegt auf demselben Datenträger wie /. ` +
          `Vermutlich SD-Karte. Empfohlen: USB-SSD mounten und Installer mit ` +
          `--use-ssd=/mnt/data neu ausführen.`,
      };
    }
  } catch {
    /* ignore */
  }
  return { ok: true, resolved, warning: null, freeBytes };
}
