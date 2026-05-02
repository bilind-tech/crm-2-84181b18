// Login-Lockout pro (IP, Username).
// 5 Fehlversuche -> 15 Min Sperre.

import { getDatabase } from "../db/index.js";

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

function nowMs(): number {
  return Date.now();
}

export interface LockoutStatus {
  locked: boolean;
  lockedUntil: string | null;
  failCount: number;
}

export function getStatus(ip: string, username: string): LockoutStatus {
  const row = getDatabase()
    .prepare(`SELECT fail_count, locked_until FROM auth_lockout WHERE ip = ? AND username = ?`)
    .get(ip, username.toLowerCase()) as
    | { fail_count: number; locked_until: string | null }
    | undefined;
  if (!row) return { locked: false, lockedUntil: null, failCount: 0 };
  const locked = row.locked_until !== null && Date.parse(row.locked_until) > nowMs();
  return { locked, lockedUntil: row.locked_until, failCount: row.fail_count };
}

export function recordFailure(ip: string, username: string): LockoutStatus {
  const db = getDatabase();
  const u = username.toLowerCase();
  db.prepare(
    `INSERT INTO auth_lockout (ip, username, fail_count, locked_until, updated_at)
     VALUES (?, ?, 1, NULL, datetime('now'))
     ON CONFLICT(ip, username) DO UPDATE SET
       fail_count = fail_count + 1,
       updated_at = datetime('now'),
       locked_until = CASE
         WHEN fail_count + 1 >= ${MAX_FAILS} THEN datetime('now', '+${LOCK_MINUTES} minutes')
         ELSE locked_until
       END`,
  ).run(ip, u);
  return getStatus(ip, u);
}

export function recordSuccess(ip: string, username: string): void {
  getDatabase()
    .prepare(`DELETE FROM auth_lockout WHERE ip = ? AND username = ?`)
    .run(ip, username.toLowerCase());
}
