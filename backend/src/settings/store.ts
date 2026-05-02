// Generischer Settings-Store. Werte sind IMMER als JSON gespeichert.
// Sensible Werte werden vor dem Speichern AES-GCM-verschlüsselt.

import { getDatabase } from "../db/index.js";
import { encryptString, decryptString } from "../crypto/aes.js";

const cache = new Map<string, { value: unknown; encrypted: boolean; updatedAt: string }>();

interface Row {
  key: string;
  value: string;
  encrypted: number;
  updated_at: string;
}

function readRow(key: string): Row | undefined {
  return getDatabase()
    .prepare(`SELECT key, value, encrypted, updated_at FROM setting WHERE key = ?`)
    .get(key) as Row | undefined;
}

function decode(row: Row): unknown {
  const raw = row.encrypted ? decryptString(row.value) : row.value;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function getSetting<T = unknown>(key: string): T | undefined {
  if (cache.has(key)) {
    return cache.get(key)!.value as T;
  }
  const row = readRow(key);
  if (!row) return undefined;
  const value = decode(row);
  cache.set(key, { value, encrypted: !!row.encrypted, updatedAt: row.updated_at });
  return value as T;
}

export function getSettingMeta(
  key: string,
): { exists: boolean; encrypted: boolean; updatedAt: string | null } {
  const row = readRow(key);
  if (!row) return { exists: false, encrypted: false, updatedAt: null };
  return { exists: true, encrypted: !!row.encrypted, updatedAt: row.updated_at };
}

export function setSetting(key: string, value: unknown, opts?: { encrypt?: boolean }): void {
  const json = JSON.stringify(value);
  const encrypt = !!opts?.encrypt;
  const stored = encrypt ? encryptString(json) : json;
  getDatabase()
    .prepare(
      `INSERT INTO setting (key, value, encrypted, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         encrypted = excluded.encrypted,
         updated_at = datetime('now')`,
    )
    .run(key, stored, encrypt ? 1 : 0);
  cache.delete(key);
}

export function deleteSetting(key: string): void {
  getDatabase().prepare(`DELETE FROM setting WHERE key = ?`).run(key);
  cache.delete(key);
}

export function listSettings(prefix: string): Array<{ key: string; value: unknown; encrypted: boolean; updatedAt: string }> {
  const rows = getDatabase()
    .prepare(`SELECT key, value, encrypted, updated_at FROM setting WHERE key LIKE ? ORDER BY key`)
    .all(`${prefix}%`) as Row[];
  return rows.map((r) => ({
    key: r.key,
    value: decode(r),
    encrypted: !!r.encrypted,
    updatedAt: r.updated_at,
  }));
}

export function clearSettingsCache(): void {
  cache.clear();
}
