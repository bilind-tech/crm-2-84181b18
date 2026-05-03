// Repo für Dokumente + Upload-Sessions.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import { emit } from "../events/bus.js";
import { rowToDokument, rowToUploadSession, type DokumentRow, type UploadSessionRow } from "./mappers.js";
import type {
  Dokument, DokumentMetaInput, DokumentListFilter, DokumentTyp, DokumentQuelle,
  UploadSession,
} from "./types.js";
import { SESSION_TTL_MIN } from "./types.js";

// ---------- Dokumente ----------

export interface CreateDokumentInput {
  titel: string;
  beschreibung?: string | null;
  typ: DokumentTyp;
  kundeId?: string | null;
  objektId?: string | null;
  uploadSessionId?: string | null;
  dateiname: string;
  mimeType: string;
  groesseBytes: number;
  sha256: string;
  storagePath: string;
  dokumentdatum?: string | null;
  betrag?: number | null;
  steuerrelevant?: boolean;
  ustSatz?: number | null;
  faelligAm?: string | null;
  quelle?: DokumentQuelle;
}

export function createDokument(input: CreateDokumentInput): Dokument {
  const id = `dok-${crypto.randomUUID().slice(0, 12)}`;
  const db = getDatabase();
  db.prepare(
    `INSERT INTO dokumente (
       id, titel, beschreibung, typ, kunde_id, objekt_id, upload_session_id,
       dateiname, mime_type, groesse_bytes, sha256, storage_path,
       dokumentdatum, betrag, steuerrelevant, ust_satz,
       faellig_am, quelle
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    id,
    input.titel,
    input.beschreibung ?? null,
    input.typ,
    input.kundeId ?? null,
    input.objektId ?? null,
    input.uploadSessionId ?? null,
    input.dateiname,
    input.mimeType,
    input.groesseBytes,
    input.sha256,
    input.storagePath,
    input.dokumentdatum ?? null,
    input.betrag ?? null,
    input.steuerrelevant ? 1 : 0,
    input.ustSatz ?? null,
    input.faelligAm ?? null,
    input.quelle ?? "upload",
  );
  const dok = getDokument(id)!;
  emit("dokument:erstellt", { id });
  return dok;
}

export function getDokument(id: string): Dokument | null {
  const r = getDatabase()
    .prepare(`SELECT * FROM dokumente WHERE id = ? AND geloescht_am IS NULL`)
    .get(id) as DokumentRow | undefined;
  return r ? rowToDokument(r) : null;
}

/** Auch gelöschte Zeilen liefern — für Storage-Cleanup. */
export function getDokumentRaw(id: string): DokumentRow | null {
  return (getDatabase().prepare(`SELECT * FROM dokumente WHERE id = ?`).get(id) as DokumentRow | undefined) ?? null;
}

export function listDokumente(filter: DokumentListFilter = {}): Dokument[] {
  const where: string[] = ["geloescht_am IS NULL"];
  const params: unknown[] = [];
  if (filter.kundeId) { where.push("kunde_id = ?"); params.push(filter.kundeId); }
  if (filter.objektId) { where.push("objekt_id = ?"); params.push(filter.objektId); }
  if (filter.typ) { where.push("typ = ?"); params.push(filter.typ); }
  if (filter.jahr) {
    where.push("substr(COALESCE(dokumentdatum, hochgeladen_am), 1, 4) = ?");
    params.push(String(filter.jahr));
  }
  if (filter.offen) { where.push("erledigt_am IS NULL AND faellig_am IS NOT NULL"); }
  if (filter.steuer) { where.push("steuerrelevant = 1"); }
  const sql = `SELECT * FROM dokumente WHERE ${where.join(" AND ")}
               ORDER BY hochgeladen_am DESC LIMIT 1000`;
  const rows = getDatabase().prepare(sql).all(...params) as DokumentRow[];
  return rows.map(rowToDokument);
}

export interface UpdateDokumentInput extends Partial<DokumentMetaInput> {
  erledigt?: boolean;
}

export function updateDokument(id: string, patch: UpdateDokumentInput): Dokument | null {
  const existing = getDokument(id);
  if (!existing) return null;
  const sets: string[] = [];
  const vals: unknown[] = [];
  const map: Record<string, string> = {
    titel: "titel",
    beschreibung: "beschreibung",
    typ: "typ",
    kundeId: "kunde_id",
    objektId: "objekt_id",
    dokumentdatum: "dokumentdatum",
    betrag: "betrag",
    ustSatz: "ust_satz",
    faelligAm: "faellig_am",
    quelle: "quelle",
    uploadSessionId: "upload_session_id",
  };
  for (const [k, col] of Object.entries(map)) {
    if (k in patch) {
      sets.push(`${col} = ?`);
      vals.push((patch as Record<string, unknown>)[k] ?? null);
    }
  }
  if ("steuerrelevant" in patch && patch.steuerrelevant !== undefined) {
    sets.push("steuerrelevant = ?"); vals.push(patch.steuerrelevant ? 1 : 0);
  }
  if ("erledigt" in patch && patch.erledigt !== undefined) {
    if (patch.erledigt) {
      sets.push("erledigt_am = COALESCE(erledigt_am, datetime('now'))");
    } else {
      sets.push("erledigt_am = NULL");
    }
  }
  if (sets.length === 0) return existing;
  vals.push(id);
  getDatabase().prepare(
    `UPDATE dokumente SET ${sets.join(", ")} WHERE id = ? AND geloescht_am IS NULL`,
  ).run(...vals);
  return getDokument(id);
}

/** Soft-Delete. Datei bleibt für 30 Tage liegen (Cleanup-Cron Step 13). */
export function softDeleteDokument(id: string): boolean {
  const r = getDatabase().prepare(
    `UPDATE dokumente SET geloescht_am = datetime('now') WHERE id = ? AND geloescht_am IS NULL`,
  ).run(id);
  return r.changes > 0;
}

/** Findet alle aktiven Dokumente mit gleichem sha256 (für Dedup-Counter). */
export function refsForSha(sha256: string): number {
  const r = getDatabase()
    .prepare(`SELECT COUNT(*) AS n FROM dokumente WHERE sha256 = ? AND geloescht_am IS NULL`)
    .get(sha256) as { n: number };
  return r.n;
}

export interface DriveStatusUpdate {
  status: "pending" | "uploaded" | "fehler";
  fileId?: string | null;
  url?: string | null;
  fehlerText?: string | null;
}

export function setDriveStatus(id: string, u: DriveStatusUpdate): void {
  getDatabase().prepare(
    `UPDATE dokumente SET drive_status=?, drive_file_id=?, drive_url=?, drive_fehler=?,
       drive_letzter_versuch=datetime('now') WHERE id=?`,
  ).run(u.status, u.fileId ?? null, u.url ?? null, u.fehlerText ?? null, id);
}

// ---------- Frist-Logging (Dedup pro Tag) ----------

export function fristAlreadyLogged(dokumentId: string, tag: string, status: string): boolean {
  const r = getDatabase()
    .prepare(`SELECT 1 FROM dokumente_frist_benachrichtigung_log WHERE dokument_id=? AND tag=? AND status=?`)
    .get(dokumentId, tag, status);
  return !!r;
}

export function logFristBenachrichtigung(dokumentId: string, tag: string, status: string): void {
  try {
    getDatabase().prepare(
      `INSERT INTO dokumente_frist_benachrichtigung_log (dokument_id, tag, status) VALUES (?,?,?)`,
    ).run(dokumentId, tag, status);
  } catch {
    /* primary-key conflict = bereits geloggt */
  }
}

// ---------- Upload-Sessions ----------

function genToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function createSession(input: { kundeId?: string | null; objektId?: string | null }): UploadSession {
  const id = `ups-${crypto.randomUUID().slice(0, 12)}`;
  const token = genToken();
  const ablauf = new Date(Date.now() + SESSION_TTL_MIN * 60_000).toISOString().slice(0, 19).replace("T", " ");
  getDatabase().prepare(
    `INSERT INTO upload_sessions (id, token, kunde_id, objekt_id, ablauf_am) VALUES (?,?,?,?,?)`,
  ).run(id, token, input.kundeId ?? null, input.objektId ?? null, ablauf);
  return getSessionById(id)!;
}

export function getSessionById(id: string): UploadSession | null {
  const r = getDatabase().prepare(`SELECT * FROM upload_sessions WHERE id = ?`).get(id) as UploadSessionRow | undefined;
  if (!r) return null;
  const dokIds = (getDatabase()
    .prepare(`SELECT id FROM dokumente WHERE upload_session_id = ? AND geloescht_am IS NULL ORDER BY hochgeladen_am`)
    .all(id) as { id: string }[]).map((x) => x.id);
  return rowToUploadSession(r, dokIds);
}

export function getSessionByToken(token: string): UploadSession | null {
  const r = getDatabase().prepare(`SELECT * FROM upload_sessions WHERE token = ?`).get(token) as UploadSessionRow | undefined;
  if (!r) return null;
  return getSessionById(r.id);
}

export function endSession(id: string): boolean {
  const r = getDatabase().prepare(`UPDATE upload_sessions SET beendet = 1 WHERE id = ?`).run(id);
  return r.changes > 0;
}

export function purgeExpiredSessions(): number {
  return getDatabase().prepare(
    `DELETE FROM upload_sessions WHERE ablauf_am < datetime('now', '-1 day')`,
  ).run().changes;
}

export function isSessionUploadable(s: UploadSession): boolean {
  if (s.beendet) return false;
  return new Date(s.ablaufAm).getTime() > Date.now();
}
