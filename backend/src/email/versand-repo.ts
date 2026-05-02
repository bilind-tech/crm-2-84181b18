// Versand-Queue Repository.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";

export type EmailVersandStatus = "pending" | "sending" | "gesendet" | "fehler" | "manuell";
export type BelegArt = "angebot" | "rechnung";

export interface EmailVersand {
  id: string;
  empfaengerTo: string;
  empfaengerCc?: string | null;
  empfaengerBcc?: string | null;
  betreff: string;
  bodyHtml: string;
  belegArt?: BelegArt | null;
  belegId?: string | null;
  vorlageId?: string | null;
  signaturId?: string | null;
  idempotenzKey: string;
  status: EmailVersandStatus;
  versuche: number;
  naechsterVersuchAt?: string | null;
  versendetAm?: string | null;
  fehlerText?: string | null;
  messageId?: string | null;
  erstelltAm: string;
  geaendertAm: string;
}

interface Row {
  id: string;
  empfaenger_to: string; empfaenger_cc: string | null; empfaenger_bcc: string | null;
  betreff: string; body_html: string;
  beleg_art: BelegArt | null; beleg_id: string | null;
  vorlage_id: string | null; signatur_id: string | null;
  idempotenz_key: string;
  status: EmailVersandStatus; versuche: number;
  naechster_versuch_at: string | null; versendet_am: string | null;
  fehler_text: string | null; message_id: string | null;
  erstellt_am: string; geaendert_am: string;
}

const map = (r: Row): EmailVersand => ({
  id: r.id, empfaengerTo: r.empfaenger_to, empfaengerCc: r.empfaenger_cc, empfaengerBcc: r.empfaenger_bcc,
  betreff: r.betreff, bodyHtml: r.body_html,
  belegArt: r.beleg_art, belegId: r.beleg_id,
  vorlageId: r.vorlage_id, signaturId: r.signatur_id,
  idempotenzKey: r.idempotenz_key, status: r.status, versuche: r.versuche,
  naechsterVersuchAt: r.naechster_versuch_at, versendetAm: r.versendet_am,
  fehlerText: r.fehler_text, messageId: r.message_id,
  erstelltAm: r.erstellt_am, geaendertAm: r.geaendert_am,
});

// Backoff in Minuten: 1, 5, 15, 60, 240, 1440. Danach -> manuell.
const BACKOFF_MIN = [1, 5, 15, 60, 240, 1440];

function nowIso(): string { return new Date().toISOString().slice(0, 19).replace("T", " "); }
function plusMin(min: number): string {
  const d = new Date(Date.now() + min * 60_000);
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export interface EnqueueInput {
  empfaengerTo: string;
  empfaengerCc?: string;
  empfaengerBcc?: string;
  betreff: string;
  bodyHtml: string;
  belegArt?: BelegArt;
  belegId?: string;
  vorlageId?: string;
  signaturId?: string;
  idempotenzKey: string;
}

export function enqueueVersand(input: EnqueueInput): { row: EmailVersand; created: boolean } {
  const db = getDatabase();
  const existing = db.prepare(`SELECT * FROM email_versand WHERE idempotenz_key = ?`)
    .get(input.idempotenzKey) as Row | undefined;
  if (existing) return { row: map(existing), created: false };

  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO email_versand (
      id, empfaenger_to, empfaenger_cc, empfaenger_bcc, betreff, body_html,
      beleg_art, beleg_id, vorlage_id, signatur_id, idempotenz_key,
      status, versuche, naechster_versuch_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending', 0, datetime('now'))`,
  ).run(
    id, input.empfaengerTo, input.empfaengerCc ?? null, input.empfaengerBcc ?? null,
    input.betreff, input.bodyHtml,
    input.belegArt ?? null, input.belegId ?? null,
    input.vorlageId ?? null, input.signaturId ?? null,
    input.idempotenzKey,
  );
  return { row: getById(id)!, created: true };
}

export function getById(id: string): EmailVersand | null {
  const r = getDatabase().prepare(`SELECT * FROM email_versand WHERE id = ?`).get(id) as Row | undefined;
  return r ? map(r) : null;
}

export interface ListFilter {
  status?: EmailVersandStatus;
  belegId?: string;
  q?: string;
  limit?: number;
  offset?: number;
}
export function listVersand(f: ListFilter = {}): EmailVersand[] {
  const where: string[] = []; const params: unknown[] = [];
  if (f.status) { where.push("status = ?"); params.push(f.status); }
  if (f.belegId) { where.push("beleg_id = ?"); params.push(f.belegId); }
  if (f.q && f.q.trim()) {
    where.push("(LOWER(empfaenger_to) LIKE ? OR LOWER(betreff) LIKE ?)");
    const like = `%${f.q.trim().toLowerCase()}%`;
    params.push(like, like);
  }
  const sql = `SELECT * FROM email_versand
               ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY erstellt_am DESC LIMIT ? OFFSET ?`;
  params.push(f.limit ?? 200, f.offset ?? 0);
  return (getDatabase().prepare(sql).all(...params) as Row[]).map(map);
}

// Atomar fällige holen + auf 'sending' setzen.
export function claimDue(limit: number): EmailVersand[] {
  const db = getDatabase();
  const claimed: EmailVersand[] = [];
  const tx = db.transaction(() => {
    const due = db.prepare(
      `SELECT * FROM email_versand
       WHERE status = 'pending'
         AND (naechster_versuch_at IS NULL OR naechster_versuch_at <= datetime('now'))
       ORDER BY erstellt_am ASC LIMIT ?`,
    ).all(limit) as Row[];
    for (const r of due) {
      db.prepare(`UPDATE email_versand SET status='sending', geaendert_am=datetime('now') WHERE id=? AND status='pending'`).run(r.id);
      claimed.push(map({ ...r, status: "sending" }));
    }
  });
  tx();
  return claimed;
}

export function markErfolg(id: string, messageId: string | null): void {
  getDatabase().prepare(
    `UPDATE email_versand SET status='gesendet', versendet_am=datetime('now'),
      message_id=?, fehler_text=NULL, geaendert_am=datetime('now'), versuche = versuche + 1 WHERE id=?`,
  ).run(messageId, id);
}

export function markFehler(id: string, error: string): void {
  const db = getDatabase();
  const cur = getById(id);
  if (!cur) return;
  const versuche = cur.versuche + 1;
  if (versuche >= BACKOFF_MIN.length + 1) {
    db.prepare(`UPDATE email_versand SET status='manuell', fehler_text=?, versuche=?, geaendert_am=datetime('now'), naechster_versuch_at=NULL WHERE id=?`)
      .run(error.slice(0, 1000), versuche, id);
  } else {
    const min = BACKOFF_MIN[Math.min(versuche - 1, BACKOFF_MIN.length - 1)];
    db.prepare(`UPDATE email_versand SET status='pending', fehler_text=?, versuche=?, naechster_versuch_at=?, geaendert_am=datetime('now') WHERE id=?`)
      .run(error.slice(0, 1000), versuche, plusMin(min), id);
  }
}

export function retry(id: string): boolean {
  return getDatabase().prepare(
    `UPDATE email_versand SET status='pending', naechster_versuch_at=datetime('now'), geaendert_am=datetime('now')
     WHERE id=? AND status IN ('fehler','manuell','pending')`,
  ).run(id).changes > 0;
}

export function abbrechen(id: string): boolean {
  return getDatabase().prepare(
    `UPDATE email_versand SET status='manuell', fehler_text='Manuell abgebrochen', geaendert_am=datetime('now')
     WHERE id=? AND status IN ('pending','sending')`,
  ).run(id).changes > 0;
}

export { nowIso };
