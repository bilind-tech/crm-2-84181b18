// Setup-Token: einmalig beim ersten Start in keys/setup.token erzeugt,
// solange noch kein User existiert. 24h Ablauf, regeneriert sich.
// Wird nach erfolgreichem Setup gelöscht.

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "node:fs";
import path from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { getDatabase } from "../db/index.js";
import { config } from "../config.js";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const WARN_AGE_MS = 60 * 60 * 1000;

let setupCompleteCache: boolean | null = null;

function tokenPath(): string {
  return path.join(config.dataDir, "keys", "setup.token");
}

interface StoredToken {
  token: string;
  createdAt: string;
}

export function userCount(): number {
  if (setupCompleteCache === true) return 1; // schnellpfad
  const row = getDatabase().prepare(`SELECT COUNT(*) AS c FROM app_user`).get() as { c: number };
  if (row.c > 0) setupCompleteCache = true;
  return row.c;
}

export function markSetupComplete(): void {
  setupCompleteCache = true;
  // Setup-Token-Datei nach erfolgreicher Einrichtung sofort von der Platte entfernen.
  if (existsSync(tokenPath())) {
    try { unlinkSync(tokenPath()); } catch { /* ignore */ }
  }
}

export function invalidateSetupCache(): void {
  setupCompleteCache = null;
}

function readStored(): StoredToken | null {
  if (!existsSync(tokenPath())) return null;
  try {
    const raw = readFileSync(tokenPath(), "utf8").trim();
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as StoredToken;
      if (parsed?.token && parsed?.createdAt) return parsed;
    }
    // Legacy: nur Token-String
    return { token: raw, createdAt: new Date(0).toISOString() };
  } catch {
    return null;
  }
}

function writeStored(tok: StoredToken): void {
  const dir = path.dirname(tokenPath());
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(tokenPath(), JSON.stringify(tok), { mode: 0o600 });
  try {
    chmodSync(tokenPath(), 0o600);
  } catch {
    /* ignore */
  }
}

function isExpired(tok: StoredToken): boolean {
  const created = Date.parse(tok.createdAt);
  if (Number.isNaN(created)) return true;
  return Date.now() - created > TOKEN_TTL_MS;
}

export function ensureSetupToken(log: (line: string) => void): void {
  if (userCount() > 0) {
    if (existsSync(tokenPath())) {
      try {
        unlinkSync(tokenPath());
      } catch {
        /* ignore */
      }
    }
    return;
  }
  const existing = readStored();
  if (existing && !isExpired(existing)) {
    const ageMs = Date.now() - Date.parse(existing.createdAt);
    if (ageMs > WARN_AGE_MS) {
      log(`WARN: Setup-Token älter als 1h (${Math.round(ageMs / 60000)} min). Datei: ${tokenPath()}`);
    }
    log(`Setup-Token vorhanden (${tokenPath()}): ${existing.token}`);
    return;
  }
  // neu generieren
  const tok: StoredToken = {
    token: randomBytes(24).toString("base64url"),
    createdAt: new Date().toISOString(),
  };
  writeStored(tok);
  log("==================== ERSTEINRICHTUNG ====================");
  if (existing) log("(alter Setup-Token war abgelaufen — neu erzeugt)");
  log(`Setup-Token (gültig 24h): ${tok.token}`);
  log(`(auch lesbar in: ${tokenPath()})`);
  log("=========================================================");
}

export function checkAndConsumeSetupToken(provided: string): boolean {
  const stored = readStored();
  if (!stored) return false;
  if (isExpired(stored)) {
    try {
      unlinkSync(tokenPath());
    } catch {
      /* ignore */
    }
    return false;
  }
  const a = Buffer.from(stored.token);
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
