// Benachrichtigungs-Repo (Bell + Toasts).
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import { emit } from "../events/bus.js";

export type Prio = "info" | "erfolg" | "warnung" | "fehler";

export interface Benachrichtigung {
  id: string;
  aktivitaetId: string;
  prioritaet: Prio;
  titel: string;
  beschreibung: string;
  aktionLabel?: string | null;
  aktionRoute?: string | null;
  gelesenAm?: string | null;
  weggewischtAm?: string | null;
  erstelltAm: string;
}

interface Row {
  id: string; aktivitaet_id: string; prioritaet: Prio;
  titel: string; beschreibung: string;
  aktion_label: string | null; aktion_route: string | null;
  gelesen_am: string | null; weggewischt_am: string | null;
  erstellt_am: string;
}

const map = (r: Row): Benachrichtigung => ({
  id: r.id, aktivitaetId: r.aktivitaet_id, prioritaet: r.prioritaet,
  titel: r.titel, beschreibung: r.beschreibung,
  aktionLabel: r.aktion_label, aktionRoute: r.aktion_route,
  gelesenAm: r.gelesen_am, weggewischtAm: r.weggewischt_am,
  erstelltAm: r.erstellt_am,
});

export interface CreateInput {
  aktivitaetId: string;
  prioritaet: Prio;
  titel: string;
  beschreibung?: string;
  aktionLabel?: string | null;
  aktionRoute?: string | null;
}

export function createBenachrichtigung(input: CreateInput): Benachrichtigung {
  const id = crypto.randomUUID();
  const erstelltAm = new Date().toISOString().slice(0, 19).replace("T", " ");
  getDatabase()
    .prepare(`INSERT INTO benachrichtigung
              (id, aktivitaet_id, prioritaet, titel, beschreibung, aktion_label, aktion_route, erstellt_am)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      id, input.aktivitaetId, input.prioritaet,
      input.titel, input.beschreibung ?? "",
      input.aktionLabel ?? null, input.aktionRoute ?? null, erstelltAm,
    );
  emit("benachrichtigung:neu", {
    id, prioritaet: input.prioritaet, titel: input.titel, aktionRoute: input.aktionRoute ?? null,
  });
  return {
    id, aktivitaetId: input.aktivitaetId, prioritaet: input.prioritaet,
    titel: input.titel, beschreibung: input.beschreibung ?? "",
    aktionLabel: input.aktionLabel ?? null, aktionRoute: input.aktionRoute ?? null,
    gelesenAm: null, weggewischtAm: null, erstelltAm,
  };
}

export function listBenachrichtigungen(opts: { nurUngelesen?: boolean; limit?: number } = {}): Benachrichtigung[] {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const where = ["weggewischt_am IS NULL"];
  if (opts.nurUngelesen) where.push("gelesen_am IS NULL");
  const rows = getDatabase()
    .prepare(`SELECT * FROM benachrichtigung WHERE ${where.join(" AND ")}
              ORDER BY erstellt_am DESC LIMIT ?`)
    .all(limit) as Row[];
  return rows.map(map);
}

export function ungeleseneZahl(): number {
  const r = getDatabase()
    .prepare(`SELECT COUNT(*) AS n FROM benachrichtigung WHERE weggewischt_am IS NULL AND gelesen_am IS NULL`)
    .get() as { n: number };
  return r.n;
}

export function gesamtZahl(): number {
  const r = getDatabase()
    .prepare(`SELECT COUNT(*) AS n FROM benachrichtigung WHERE weggewischt_am IS NULL`)
    .get() as { n: number };
  return r.n;
}

export function markGelesen(id: string): boolean {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const r = getDatabase()
    .prepare(`UPDATE benachrichtigung SET gelesen_am = COALESCE(gelesen_am, ?) WHERE id = ? AND weggewischt_am IS NULL`)
    .run(now, id);
  if (r.changes > 0) emit("benachrichtigung:gelesen", { id });
  return r.changes > 0;
}

export function markAlleGelesen(): number {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const r = getDatabase()
    .prepare(`UPDATE benachrichtigung SET gelesen_am = ? WHERE gelesen_am IS NULL AND weggewischt_am IS NULL`)
    .run(now);
  if (r.changes > 0) emit("benachrichtigung:gelesen", { alle: true });
  return r.changes;
}

export function wegwischen(id: string): boolean {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  const r = getDatabase()
    .prepare(`UPDATE benachrichtigung SET weggewischt_am = ? WHERE id = ? AND weggewischt_am IS NULL`)
    .run(now, id);
  if (r.changes > 0) emit("benachrichtigung:weg", { id });
  return r.changes > 0;
}

export function purgeOldWegwischte(): number {
  try {
    return getDatabase()
      .prepare(`DELETE FROM benachrichtigung WHERE weggewischt_am IS NOT NULL
                AND datetime(weggewischt_am) < datetime('now', '-30 days')`)
      .run().changes;
  } catch { return 0; }
}

export function getById(id: string): Benachrichtigung | null {
  const r = getDatabase().prepare(`SELECT * FROM benachrichtigung WHERE id = ?`).get(id) as Row | undefined;
  return r ? map(r) : null;
}
