// Manifest-Validierung für System-Update-Pakete.
// Manifest ist im Root des ZIPs unter `manifest.json`. Pflichtfelder + HMAC-Signatur.
import crypto from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { config } from "../config.js";
import { getSchemaVersion } from "../db/index.js";
import type { UpdateManifest } from "./types.js";

export class ManifestError extends Error {
  statusCode = 400;
}

const SEMVER = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;

function loadMasterKey(): Buffer {
  if (!existsSync(config.keyPath)) {
    throw new ManifestError("Master-Key fehlt — kann Manifest-Signatur nicht prüfen");
  }
  return readFileSync(config.keyPath);
}

/**
 * Erwartetes Manifest-Schema:
 *   { appVersion, schemaVersion, createdAt, minBackendVersion, signature, hinweise? }
 *
 * `signature` = HMAC-SHA256(master.key, JSON.stringify(payloadOhneSignatur)) hex.
 *
 * Das verhindert Fremd-ZIPs — nur Releases, die mit dem master.key des Pi
 * (oder einem internen Build-Server, der den Key kennt) signiert sind, sind gültig.
 *
 * Achtung: Im DEV/Test-Modus (NODE_ENV !== production) wird die Signatur
 * trotzdem geprüft, aber gegen den lokal vorhandenen master.key. Tests müssen
 * also mit dem aktuellen Key signierte Pakete bauen.
 */
export function validateManifest(
  raw: unknown,
  current: { appVersion: string; schemaVersion: number },
  options: { erlaubeGleicheVersion?: boolean } = {},
): UpdateManifest {
  if (!raw || typeof raw !== "object") throw new ManifestError("Manifest ist kein Objekt");
  const m = raw as Record<string, unknown>;
  const required = ["appVersion", "schemaVersion", "createdAt", "minBackendVersion", "signature"];
  for (const f of required) {
    if (!(f in m)) throw new ManifestError(`Manifest-Feld fehlt: ${f}`);
  }
  if (typeof m.appVersion !== "string" || !SEMVER.test(m.appVersion)) {
    throw new ManifestError("appVersion muss semver sein");
  }
  if (typeof m.minBackendVersion !== "string" || !SEMVER.test(m.minBackendVersion)) {
    throw new ManifestError("minBackendVersion muss semver sein");
  }
  if (typeof m.schemaVersion !== "number" || !Number.isInteger(m.schemaVersion)) {
    throw new ManifestError("schemaVersion muss Integer sein");
  }
  if (typeof m.signature !== "string" || !/^[a-f0-9]{64}$/i.test(m.signature)) {
    throw new ManifestError("signature ungültig");
  }
  if (typeof m.createdAt !== "string") throw new ManifestError("createdAt fehlt");

  // Signatur prüfen: HMAC über alle Felder OHNE signature, kanonisch JSON-serialisiert.
  const payload = canonicalJson({ ...m, signature: undefined });
  const key = loadMasterKey();
  const expected = crypto.createHmac("sha256", key).update(payload).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(m.signature as string, "hex"))) {
    throw new ManifestError("Manifest-Signatur ungültig — fremdes oder verändertes Paket");
  }

  // Schema-Downgrade verboten
  if (m.schemaVersion < current.schemaVersion) {
    throw new ManifestError(
      `Paket-schemaVersion ${m.schemaVersion} ist kleiner als aktuelle ${current.schemaVersion}`,
    );
  }

  // App-Version Vergleich
  if (!options.erlaubeGleicheVersion && compareSemver(m.appVersion as string, current.appVersion) <= 0) {
    throw new ManifestError(
      `Paket-Version ${m.appVersion} ist nicht neuer als installierte ${current.appVersion}`,
    );
  }

  // minBackendVersion: laufendes Backend muss >= sein. Bei In-place-Update
  // ist das fast immer trivial (current >= current), aber bei externen
  // Build-Pipelines wichtig.
  if (compareSemver(current.appVersion, m.minBackendVersion as string) < 0) {
    throw new ManifestError(
      `Paket erfordert mindestens Backend ${m.minBackendVersion}, läuft aber ${current.appVersion}`,
    );
  }

  // Schema-Version-Sicherheits-Check vs. aktuelles Live-Schema
  const liveSchema = getSchemaVersion();
  if (m.schemaVersion < liveSchema) {
    throw new ManifestError("Live-Schema ist neuer als Paket");
  }

  return {
    appVersion: m.appVersion as string,
    schemaVersion: m.schemaVersion as number,
    createdAt: m.createdAt as string,
    minBackendVersion: m.minBackendVersion as string,
    signature: m.signature as string,
    hinweise: typeof m.hinweise === "string" ? m.hinweise : undefined,
  };
}

/** JSON-Serialisierung mit sortierten Keys (kanonisch) — undefined-Felder weglassen. */
function canonicalJson(obj: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .forEach((k) => (sorted[k] = obj[k]));
  return JSON.stringify(sorted);
}

export function signManifest(
  payload: Omit<UpdateManifest, "signature">,
  masterKeyBuffer?: Buffer,
): UpdateManifest {
  const key = masterKeyBuffer ?? loadMasterKey();
  const signature = crypto
    .createHmac("sha256", key)
    .update(canonicalJson({ ...payload, signature: undefined } as Record<string, unknown>))
    .digest("hex");
  return { ...payload, signature };
}

function compareSemver(a: string, b: string): number {
  const [aMain] = a.split("-");
  const [bMain] = b.split("-");
  const ap = aMain.split(".").map(Number);
  const bp = bMain.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((ap[i] ?? 0) > (bp[i] ?? 0)) return 1;
    if ((ap[i] ?? 0) < (bp[i] ?? 0)) return -1;
  }
  return 0;
}
