// Setup-Token: einmalig beim ersten Start in keys/setup.token erzeugt,
// solange noch kein User existiert. Wird nach erfolgreichem Setup gelöscht.

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { getDatabase } from "../db/index.js";
import { config } from "../config.js";

function tokenPath(): string {
  return path.join(config.dataDir, "keys", "setup.token");
}

export function userCount(): number {
  const row = getDatabase().prepare(`SELECT COUNT(*) AS c FROM app_user`).get() as { c: number };
  return row.c;
}

export function ensureSetupToken(log: (line: string) => void): void {
  if (userCount() > 0) {
    // System schon eingerichtet — Token darf nicht herumliegen
    if (existsSync(tokenPath())) {
      try {
        unlinkSync(tokenPath());
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (existsSync(tokenPath())) {
    const existing = readFileSync(tokenPath(), "utf8").trim();
    log(`Setup-Token vorhanden (${tokenPath()}): ${existing}`);
    return;
  }
  const dir = path.dirname(tokenPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tok = randomBytes(24).toString("base64url");
  writeFileSync(tokenPath(), tok, { mode: 0o600 });
  try {
    chmodSync(tokenPath(), 0o600);
  } catch {
    /* ignore */
  }
  log("==================== ERSTEINRICHTUNG ====================");
  log(`Setup-Token (einmalig): ${tok}`);
  log(`(auch lesbar in: ${tokenPath()})`);
  log("=========================================================");
}

export function checkAndConsumeSetupToken(provided: string): boolean {
  if (!existsSync(tokenPath())) return false;
  const stored = readFileSync(tokenPath(), "utf8").trim();
  const a = Buffer.from(stored);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  if (!timingSafeEqual(a, b)) return false;
  try {
    unlinkSync(tokenPath());
  } catch {
    /* ignore */
  }
  return true;
}
