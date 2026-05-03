// Session-Management. Tokens als HttpOnly-Cookies.
// Sliding-Expiry 14 Tage, Hard-Cap 90 Tage.

import { randomBytes } from "node:crypto";
import { getDatabase } from "../db/index.js";

export const SESSION_COOKIE = "mcc_sess";
export const SLIDING_DAYS = 14;
const HARD_CAP_DAYS = 90;
const TOUCH_THROTTLE_MS = 60_000;

const lastTouchedAt = new Map<string, number>();

interface SessionRow {
  token: string;
  user_id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  hard_expires_at: string;
  user_agent: string | null;
  ip: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}
function plusDaysIso(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

export interface CreatedSession {
  token: string;
  expiresAt: string;
}

export function createSession(userId: string, userAgent?: string, ip?: string): CreatedSession {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = plusDaysIso(SLIDING_DAYS);
  const hardExpiresAt = plusDaysIso(HARD_CAP_DAYS);
  getDatabase()
    .prepare(
      `INSERT INTO auth_session (token, user_id, created_at, last_seen_at, expires_at, hard_expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(token, userId, nowIso(), nowIso(), expiresAt, hardExpiresAt, userAgent ?? null, ip ?? null);
  lastTouchedAt.set(token, Date.now());
  return { token, expiresAt };
}

export interface ResolvedSession {
  token: string;
  userId: string;
  username: string;
  expiresAt: string;
  /** True wenn beim Resolve eine Sliding-Verlängerung geschrieben wurde — Cookie sollte erneuert werden. */
  refreshed: boolean;
}

export function resolveSession(token: string): ResolvedSession | null {
  if (!token) return null;
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT s.token, s.user_id, s.expires_at, s.hard_expires_at, u.username
       FROM auth_session s JOIN app_user u ON u.id = s.user_id
       WHERE s.token = ?`,
    )
    .get(token) as
    | (Pick<SessionRow, "token" | "user_id" | "expires_at" | "hard_expires_at"> & { username: string })
    | undefined;
  if (!row) return null;

  const now = Date.now();
  if (Date.parse(row.expires_at) < now || Date.parse(row.hard_expires_at) < now) {
    deleteSession(token);
    return null;
  }

  // Sliding update (throttled)
  let refreshed = false;
  let expiresAt = row.expires_at;
  const last = lastTouchedAt.get(token) ?? 0;
  if (now - last > TOUCH_THROTTLE_MS) {
    lastTouchedAt.set(token, now);
    const newExpires = plusDaysIso(SLIDING_DAYS);
    expiresAt =
      Date.parse(newExpires) < Date.parse(row.hard_expires_at) ? newExpires : row.hard_expires_at;
    db.prepare(`UPDATE auth_session SET last_seen_at = ?, expires_at = ? WHERE token = ?`).run(
      nowIso(),
      expiresAt,
      token,
    );
    refreshed = true;
  }

  return {
    token: row.token,
    userId: row.user_id,
    username: row.username,
    expiresAt,
    refreshed,
  };
}

export function deleteSession(token: string): void {
  getDatabase().prepare(`DELETE FROM auth_session WHERE token = ?`).run(token);
  lastTouchedAt.delete(token);
}

/** Owner-geprüftes Revoke. Liefert true wenn gelöscht. */
export function deleteSessionForUser(token: string, userId: string): boolean {
  const res = getDatabase()
    .prepare(`DELETE FROM auth_session WHERE token = ? AND user_id = ?`)
    .run(token, userId);
  if (res.changes > 0) lastTouchedAt.delete(token);
  return res.changes > 0;
}

export function deleteAllSessionsForUser(userId: string, except?: string): number {
  const db = getDatabase();
  const stmt = except
    ? db.prepare(`DELETE FROM auth_session WHERE user_id = ? AND token != ?`)
    : db.prepare(`DELETE FROM auth_session WHERE user_id = ?`);
  const res = except ? stmt.run(userId, except) : stmt.run(userId);
  return res.changes;
}

export function listSessions(userId: string): Array<{
  token: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
}> {
  return getDatabase()
    .prepare(
      `SELECT token, created_at AS createdAt, last_seen_at AS lastSeenAt, expires_at AS expiresAt,
              user_agent AS userAgent, ip
       FROM auth_session WHERE user_id = ? ORDER BY last_seen_at DESC`,
    )
    .all(userId) as Array<{
    token: string;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
    userAgent: string | null;
    ip: string | null;
  }>;
}

export function purgeExpiredSessions(): number {
  const db = getDatabase();
  // Tokens vor dem DELETE einsammeln, damit der Touch-Cache mit aufgeräumt wird.
  const expired = db
    .prepare(`SELECT token FROM auth_session WHERE expires_at < ? OR hard_expires_at < ?`)
    .all(nowIso(), nowIso()) as Array<{ token: string }>;
  const res = db
    .prepare(`DELETE FROM auth_session WHERE expires_at < ? OR hard_expires_at < ?`)
    .run(nowIso(), nowIso());
  for (const r of expired) lastTouchedAt.delete(r.token);
  return res.changes;
}

/**
 * Beim Boot Touch-Throttle aus DB warmladen, damit ein Restart nicht
 * sofort einen Update-Sturm auslöst.
 */
export function warmTouchCacheFromDb(): number {
  try {
    const rows = getDatabase()
      .prepare(`SELECT token, last_seen_at FROM auth_session`)
      .all() as Array<{ token: string; last_seen_at: string }>;
    let n = 0;
    for (const r of rows) {
      const ts = Date.parse(r.last_seen_at);
      if (!Number.isNaN(ts)) {
        lastTouchedAt.set(r.token, ts);
        n++;
      }
    }
    return n;
  } catch {
    return 0;
  }
}
