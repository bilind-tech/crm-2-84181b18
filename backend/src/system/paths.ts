// Pfad-Layout für System-Updates auf dem Pi.
// Im Dev-Modus (NODE_ENV != "production") wird ein lokales `dev-root/`
// statt `/opt/mycleancenter/` verwendet, damit Tests und Entwicklung ohne
// sudo möglich sind.
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { config } from "../config.js";

const PROD_ROOT = "/opt/mycleancenter";

export function appRoot(): string {
  if (config.nodeEnv === "production") return PROD_ROOT;
  return process.env.APP_ROOT ?? path.resolve(process.cwd(), "dev-root");
}

export function ensureAppDirs(): void {
  for (const d of [appRoot(), versionsDir(), stagingRoot()]) {
    try {
      mkdirSync(d, { recursive: true, mode: 0o755 });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(
        `Update-Verzeichnis konnte nicht vorbereitet werden (${d}): ${msg}. ` +
          `Bitte prüfen, ob ${appRoot()} existiert und für den Service-User beschreibbar ist.`,
      );
    }
  }
}

export function versionsDir(): string {
  return path.join(appRoot(), "versions");
}

export function versionDir(stamp: string): string {
  return path.join(versionsDir(), stamp);
}

export function currentLink(): string {
  return path.join(appRoot(), "current");
}

export function previousLink(): string {
  return path.join(appRoot(), "previous");
}

export function stagingRoot(): string {
  return path.join(appRoot(), "staging");
}

export function stagingDir(uploadId: string): string {
  return path.join(stagingRoot(), uploadId);
}

export function lockFile(): string {
  return path.join(stagingRoot(), ".install.lock");
}

export function brokenDir(stamp: string): string {
  return path.join(versionsDir(), `broken-${stamp}`);
}

export function nowStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
