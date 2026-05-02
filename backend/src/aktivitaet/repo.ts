// Aktivitäts-Repo + Listen-API.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import { emit } from "../events/bus.js";
import { createBenachrichtigung, type Prio } from "../benachrichtigung/repo.js";

export interface Aktivitaet {
  id: string;
  art: string;
  bezugArt?: string | null;
  bezugId?: string | null;
  titel: string;
  beschreibung: string;
  kontext?: unknown;
  userId?: string | null;
  zeitpunkt: string;
}

interface Row {
  id: string; art: string;
  bezug_art: string | null; bezug_id: string | null;
  titel: string; beschreibung: string;
  kontext_json: string | null; user_id: string | null;
  zeitpunkt: string;
}

const map = (r: Row): Aktivitaet => ({
  id: r.id, art: r.art,
  bezugArt: r.bezug_art, bezugId: r.bezug_id,
  titel: r.titel, beschreibung: r.beschreibung,
  kontext: r.kontext_json ? safeParse(r.kontext_json) : undefined,
  userId: r.user_id, zeitpunkt: r.zeitpunkt,
});

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

export interface RecordInput {
  art: string;
  bezugArt?: string | null;
  bezugId?: string | null;
  titel: string;
  beschreibung?: string;
  kontext?: unknown;
  userId?: string | null;
  notify?: {
    prioritaet: Prio;
    titel?: string;
    beschreibung?: string;
    aktionLabel?: string | null;
    aktionRoute?: string | null;
  };
}

export function record(input: RecordInput): Aktivitaet {
  const id = crypto.randomUUID();
  const zeitpunkt = new Date().toISOString().slice(0, 19).replace("T", " ");
  getDatabase()
    .prepare(`INSERT INTO aktivitaet (id, art, bezug_art, bezug_id, titel, beschreibung, kontext_json, user_id, zeitpunkt)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id, input.art,
      input.bezugArt ?? null, input.bezugId ?? null,
      input.titel, input.beschreibung ?? "",
      input.kontext !== undefined ? JSON.stringify(input.kontext) : null,
      input.userId ?? null, zeitpunkt,
    );

  emit("aktivitaet:neu", {
    id, art: input.art,
    bezugArt: input.bezugArt ?? null, bezugId: input.bezugId ?? null,
    titel: input.titel, zeitpunkt,
  });

  if (input.notify) {
    createBenachrichtigung({
      aktivitaetId: id,
      prioritaet: input.notify.prioritaet,
      titel: input.notify.titel ?? input.titel,
      beschreibung: input.notify.beschreibung ?? input.beschreibung ?? "",
      aktionLabel: input.notify.aktionLabel ?? null,
      aktionRoute: input.notify.aktionRoute ?? null,
    });
  }

  return {
    id, art: input.art,
    bezugArt: input.bezugArt ?? null, bezugId: input.bezugId ?? null,
    titel: input.titel, beschreibung: input.beschreibung ?? "",
    kontext: input.kontext, userId: input.userId ?? null, zeitpunkt,
  };
}

export interface ListOpts {
  limit?: number;
  vor?: string;            // Cursor: zeitpunkt < vor
  art?: string;
  bezugArt?: string;
  bezugId?: string;
}

export function list(opts: ListOpts = {}): { items: Aktivitaet[]; naechsterCursor?: string } {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.vor)       { where.push("zeitpunkt < ?"); params.push(opts.vor); }
  if (opts.art)       { where.push("art = ?");       params.push(opts.art); }
  if (opts.bezugArt)  { where.push("bezug_art = ?"); params.push(opts.bezugArt); }
  if (opts.bezugId)   { where.push("bezug_id = ?");  params.push(opts.bezugId); }
  const sql = `SELECT * FROM aktivitaet ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY zeitpunkt DESC LIMIT ?`;
  const rows = getDatabase().prepare(sql).all(...params, limit + 1) as Row[];
  const more = rows.length > limit;
  const items = (more ? rows.slice(0, limit) : rows).map(map);
  return {
    items,
    naechsterCursor: more ? items[items.length - 1].zeitpunkt : undefined,
  };
}

export function getById(id: string): Aktivitaet | null {
  const r = getDatabase().prepare(`SELECT * FROM aktivitaet WHERE id = ?`).get(id) as Row | undefined;
  return r ? map(r) : null;
}

const RETENTION_DAYS = 365;
export function purgeOldAktivitaeten(): number {
  try {
    return getDatabase()
      .prepare(`DELETE FROM aktivitaet WHERE datetime(zeitpunkt) < datetime('now', ?)`)
      .run(`-${RETENTION_DAYS} days`).changes;
  } catch { return 0; }
}
