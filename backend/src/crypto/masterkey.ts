import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";

/**
 * Master-Key für AES-256-GCM Verschlüsselung sensibler Settings (SMTP-PW,
 * Google-OAuth-Tokens etc.). Wird beim ersten Start einmalig erzeugt und
 * NIEMALS rotiert ohne kontrollierte Migration.
 *
 * SICHERHEIT:
 *   - Datei chmod 600 (nur Owner lesen/schreiben)
 *   - NIEMALS loggen
 *   - NIEMALS in HTTP-Response zurückgeben
 *   - In Backups separat behandeln (Step 3)
 */

const KEY_LENGTH_BYTES = 32; // 256 bit

export function ensureMasterKey(keyPath: string): { created: boolean; present: boolean } {
  const dir = path.dirname(keyPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  if (existsSync(keyPath)) {
    // Validierung: hat die richtige Länge?
    const buf = readFileSync(keyPath);
    if (buf.length !== KEY_LENGTH_BYTES) {
      throw new Error(
        `Master-Key in ${keyPath} hat falsche Länge (${buf.length} statt ${KEY_LENGTH_BYTES} bytes). ` +
          `NICHT überschreiben — manuell prüfen!`,
      );
    }
    return { created: false, present: true };
  }

  const key = randomBytes(KEY_LENGTH_BYTES);
  writeFileSync(keyPath, key, { mode: 0o600 });
  // Doppelt absichern (umask-unabhängig):
  try {
    chmodSync(keyPath, 0o600);
  } catch {
    /* unter Windows ggf. nicht möglich — ok für Dev */
  }
  return { created: true, present: true };
}

export function loadMasterKey(keyPath: string): Buffer {
  return readFileSync(keyPath);
}
