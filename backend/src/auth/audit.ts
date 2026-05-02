// Audit-Log (DB).
import { getDatabase } from "../db/index.js";

export function audit(opts: {
  userId?: string | null;
  action: string;
  detail?: unknown;
  ip?: string | null;
}): void {
  try {
    getDatabase()
      .prepare(`INSERT INTO audit_log (user_id, action, detail, ip) VALUES (?, ?, ?, ?)`)
      .run(
        opts.userId ?? null,
        opts.action,
        opts.detail !== undefined ? JSON.stringify(opts.detail) : null,
        opts.ip ?? null,
      );
  } catch {
    // best effort
  }
}
