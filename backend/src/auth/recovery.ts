// Recovery-Code: 24 Zeichen Base32 ohne mehrdeutige Zeichen (kein I/L/O/0/1/U).
// Format mit Bindestrichen: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX (29 chars inkl. Bindestriche).
// Argon2id-Hash wird in app_user.recovery_hash gespeichert.

import { randomBytes } from "node:crypto";
import { hash, verify, Algorithm } from "@node-rs/argon2";
import { getDatabase } from "../db/index.js";

const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789"; // 30 Zeichen
const RAW_LEN = 24;
const ARGON_OPTS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

export function generateRecoveryCode(): string {
  const buf = randomBytes(RAW_LEN);
  let raw = "";
  for (let i = 0; i < RAW_LEN; i++) {
    raw += ALPHABET[buf[i]! % ALPHABET.length];
  }
  return raw.match(/.{4}/g)!.join("-");
}

export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export async function hashRecoveryCode(code: string): Promise<string> {
  return hash(normalizeRecoveryCode(code), ARGON_OPTS);
}

export async function verifyRecoveryCode(stored: string, provided: string): Promise<boolean> {
  try {
    return await verify(stored, normalizeRecoveryCode(provided));
  } catch {
    return false;
  }
}

/** Speichert neuen Hash, setzt recovery_used_at zurück. */
export function persistRecoveryHash(userId: string, hashStr: string): void {
  getDatabase()
    .prepare(
      `UPDATE app_user SET recovery_hash = ?, recovery_used_at = NULL, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(hashStr, userId);
}

/** Markiert Recovery als verbraucht. */
export function markRecoveryConsumed(userId: string): void {
  getDatabase()
    .prepare(`UPDATE app_user SET recovery_used_at = datetime('now') WHERE id = ?`)
    .run(userId);
}
