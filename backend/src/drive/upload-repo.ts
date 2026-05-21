// Drive-Upload Queue Repository.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import { emit } from "../events/bus.js";

export type DriveUploadStatus = "pending" | "running" | "erfolg" | "fehler" | "manuell";
export type BelegArt =
  | "angebot"
  | "rechnung"
  | "dokument"
  | "ordner_create"
  | "ordner_rename"
  | "ordner_move"
  | "ordner_delete"
  | "dokument_delete"
  | "dokument_move";

export interface DriveUpload {
  id: string;
  belegArt: BelegArt;
  belegId: string;
  dateiName: string;
  pdfSha256: string;
  idempotenzKey: string;
  opPayload?: Record<string, unknown> | null;
  status: DriveUploadStatus;
  versuche: number;
  naechsterVersuchAt?: string | null;
  driveFileId?: string | null;
  driveWebLink?: string | null;
  fehlerText?: string | null;
  abgeschlossenAm?: string | null;
  erstelltAm: string;
  geaendertAm: string;
}

interface Row {
  id: string; beleg_art: BelegArt; beleg_id: string;
  datei_name: string; pdf_sha256: string; idempotenz_key: string;
  op_payload_json: string | null;
  status: DriveUploadStatus; versuche: number;
  naechster_versuch_at: string | null;
  drive_file_id: string | null; drive_web_link: string | null;
  fehler_text: string | null; abgeschlossen_am: string | null;
  erstellt_am: string; geaendert_am: string;
}
const map = (r: Row): DriveUpload => ({
  id: r.id, belegArt: r.beleg_art, belegId: r.beleg_id,
  dateiName: r.datei_name, pdfSha256: r.pdf_sha256, idempotenzKey: r.idempotenz_key,
  opPayload: r.op_payload_json ? safeParse(r.op_payload_json) : null,
  status: r.status, versuche: r.versuche, naechsterVersuchAt: r.naechster_versuch_at,
  driveFileId: r.drive_file_id, driveWebLink: r.drive_web_link,
  fehlerText: r.fehler_text, abgeschlossenAm: r.abgeschlossen_am,
  erstelltAm: r.erstellt_am, geaendertAm: r.geaendert_am,
});

function safeParse(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

const BACKOFF_MIN = [1, 5, 15, 60, 240, 1440];
function plusMin(min: number): string {
  return new Date(Date.now() + min * 60_000).toISOString().slice(0, 19).replace("T", " ");
}

export interface EnqueueInput {
  belegArt: BelegArt;
  belegId: string;
  dateiName: string;
  pdfSha256: string;
  idempotenzKey: string;
  opPayload?: Record<string, unknown> | null;
}
export function enqueue(input: EnqueueInput): { row: DriveUpload; created: boolean } {
  const db = getDatabase();
  const existing = db.prepare(`SELECT * FROM drive_upload_queue WHERE idempotenz_key = ?`)
    .get(input.idempotenzKey) as Row | undefined;
  if (existing) return { row: map(existing), created: false };
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO drive_upload_queue (id, beleg_art, beleg_id, datei_name, pdf_sha256, idempotenz_key, op_payload_json, status, versuche, naechster_versuch_at)
     VALUES (?,?,?,?,?,?,?, 'pending', 0, datetime('now'))`,
  ).run(
    id, input.belegArt, input.belegId, input.dateiName, input.pdfSha256, input.idempotenzKey,
    input.opPayload ? JSON.stringify(input.opPayload) : null,
  );
  return { row: getById(id)!, created: true };
}

export function getById(id: string): DriveUpload | null {
  const r = getDatabase().prepare(`SELECT * FROM drive_upload_queue WHERE id = ?`).get(id) as Row | undefined;
  return r ? map(r) : null;
}

/** Letzter erfolgreicher Upload für (belegArt, belegId), oder null. */
export function getLatestErfolg(belegArt: BelegArt, belegId: string): DriveUpload | null {
  const r = getDatabase().prepare(
    `SELECT * FROM drive_upload_queue
     WHERE beleg_art = ? AND beleg_id = ? AND status = 'erfolg'
     ORDER BY abgeschlossen_am DESC LIMIT 1`,
  ).get(belegArt, belegId) as Row | undefined;
  return r ? map(r) : null;
}

export interface ListFilter { status?: DriveUploadStatus; belegId?: string; belegArt?: BelegArt; limit?: number; offset?: number }
export function listUploads(f: ListFilter = {}): DriveUpload[] {
  const where: string[] = []; const params: unknown[] = [];
  if (f.status) { where.push("status = ?"); params.push(f.status); }
  if (f.belegId) { where.push("beleg_id = ?"); params.push(f.belegId); }
  if (f.belegArt) { where.push("beleg_art = ?"); params.push(f.belegArt); }
  const sql = `SELECT * FROM drive_upload_queue
               ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY erstellt_am DESC LIMIT ? OFFSET ?`;
  params.push(f.limit ?? 200, f.offset ?? 0);
  return (getDatabase().prepare(sql).all(...params) as Row[]).map(map);
}

export function claimDue(limit: number): DriveUpload[] {
  const db = getDatabase();
  const claimed: DriveUpload[] = [];
  const tx = db.transaction(() => {
    const due = db.prepare(
      `SELECT * FROM drive_upload_queue
       WHERE status = 'pending'
         AND (naechster_versuch_at IS NULL OR naechster_versuch_at <= datetime('now'))
         AND NOT EXISTS (
           SELECT 1 FROM drive_upload_queue r2
            WHERE r2.beleg_id = drive_upload_queue.beleg_id
              AND r2.status = 'running'
         )
       ORDER BY erstellt_am ASC LIMIT ?`,
    ).all(limit) as Row[];
    for (const r of due) {
      db.prepare(`UPDATE drive_upload_queue SET status='running', geaendert_am=datetime('now') WHERE id=? AND status='pending'`).run(r.id);
      claimed.push(map({ ...r, status: "running" }));
    }
  });
  tx();
  return claimed;
}

export function markErfolg(id: string, fileId: string, webLink?: string): void {
  getDatabase().prepare(
    `UPDATE drive_upload_queue SET status='erfolg', drive_file_id=?, drive_web_link=?,
       fehler_text=NULL, abgeschlossen_am=datetime('now'), versuche=versuche+1, geaendert_am=datetime('now')
     WHERE id=?`,
  ).run(fileId, webLink ?? null, id);
  const cur = getById(id);
  emit("drive:upload-changed", {
    id, status: "erfolg",
    belegArt: cur?.belegArt ?? null, belegId: cur?.belegId ?? null, fehlerText: null,
  });
  emit("drive:hochgeladen", {
    id, belegArt: cur?.belegArt ?? null, belegId: cur?.belegId ?? null,
    fileId, webLink: webLink ?? null,
  });
}

export function markFehler(id: string, error: string): void {
  const db = getDatabase();
  const cur = getById(id);
  if (!cur) return;
  const versuche = cur.versuche + 1;
  const finalFail = versuche >= BACKOFF_MIN.length + 1;
  if (finalFail) {
    db.prepare(`UPDATE drive_upload_queue SET status='manuell', fehler_text=?, versuche=?, naechster_versuch_at=NULL, geaendert_am=datetime('now') WHERE id=?`)
      .run(error.slice(0, 1000), versuche, id);
  } else {
    const min = BACKOFF_MIN[Math.min(versuche - 1, BACKOFF_MIN.length - 1)];
    db.prepare(`UPDATE drive_upload_queue SET status='pending', fehler_text=?, versuche=?, naechster_versuch_at=?, geaendert_am=datetime('now') WHERE id=?`)
      .run(error.slice(0, 1000), versuche, plusMin(min), id);
  }
  emit("drive:upload-changed", {
    id, status: finalFail ? "manuell" : "pending",
    belegArt: cur.belegArt, belegId: cur.belegId,
    fehlerText: error.slice(0, 1000),
  });
  emit("drive:fehler", {
    id, belegArt: cur.belegArt, belegId: cur.belegId,
    fehlerText: error.slice(0, 1000), final: finalFail,
  });
}

export function retry(id: string): boolean {
  return getDatabase().prepare(
    `UPDATE drive_upload_queue SET status='pending', naechster_versuch_at=datetime('now'), geaendert_am=datetime('now')
     WHERE id=? AND status IN ('fehler','manuell','pending')`,
  ).run(id).changes > 0;
}
