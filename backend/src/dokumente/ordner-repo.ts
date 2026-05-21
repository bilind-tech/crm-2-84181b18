// Repo für Dokument-Ordner (hierarchisch, Soft-Delete).
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";

export interface DokumentOrdner {
  id: string;
  name: string;
  parentId: string | null;
  erstelltAm: string;
}

export interface DokumentOrdnerMitZaehlern extends DokumentOrdner {
  anzahlDokumente: number;
  anzahlKinder: number;
}

interface OrdnerRow {
  id: string;
  name: string;
  parent_id: string | null;
  erstellt_am: string;
  geloescht_am: string | null;
}

function rowTo(r: OrdnerRow): DokumentOrdner {
  return { id: r.id, name: r.name, parentId: r.parent_id, erstelltAm: r.erstellt_am };
}

export function getOrdner(id: string): DokumentOrdner | null {
  const r = getDatabase()
    .prepare(`SELECT * FROM dokument_ordner WHERE id = ? AND geloescht_am IS NULL`)
    .get(id) as OrdnerRow | undefined;
  return r ? rowTo(r) : null;
}

export function listOrdner(): DokumentOrdnerMitZaehlern[] {
  const db = getDatabase();
  const rows = db
    .prepare(`SELECT * FROM dokument_ordner WHERE geloescht_am IS NULL ORDER BY name COLLATE NOCASE`)
    .all() as OrdnerRow[];
  const dokCounts = db
    .prepare(
      `SELECT ordner_id AS id, COUNT(*) AS n FROM dokumente
       WHERE geloescht_am IS NULL AND ordner_id IS NOT NULL GROUP BY ordner_id`,
    )
    .all() as { id: string; n: number }[];
  const kindCounts = db
    .prepare(
      `SELECT parent_id AS id, COUNT(*) AS n FROM dokument_ordner
       WHERE geloescht_am IS NULL AND parent_id IS NOT NULL GROUP BY parent_id`,
    )
    .all() as { id: string; n: number }[];
  const dokMap = new Map(dokCounts.map((c) => [c.id, c.n]));
  const kindMap = new Map(kindCounts.map((c) => [c.id, c.n]));
  return rows.map((r) => ({
    ...rowTo(r),
    anzahlDokumente: dokMap.get(r.id) ?? 0,
    anzahlKinder: kindMap.get(r.id) ?? 0,
  }));
}

/** Zählt Dokumente am Root (ordner_id IS NULL) und Root-Ordner. */
export function rootZaehler(): { anzahlDokumente: number; anzahlKinder: number } {
  const db = getDatabase();
  const a = db
    .prepare(`SELECT COUNT(*) AS n FROM dokumente WHERE geloescht_am IS NULL AND ordner_id IS NULL`)
    .get() as { n: number };
  const k = db
    .prepare(`SELECT COUNT(*) AS n FROM dokument_ordner WHERE geloescht_am IS NULL AND parent_id IS NULL`)
    .get() as { n: number };
  return { anzahlDokumente: a.n, anzahlKinder: k.n };
}

export interface CreateOrdnerInput {
  name: string;
  parentId?: string | null;
}

export class OrdnerError extends Error {
  constructor(public code: "name-exists" | "parent-missing" | "zyklus" | "name-leer", message?: string) {
    super(message ?? code);
  }
}

function nameExists(name: string, parentId: string | null, exceptId?: string): boolean {
  const db = getDatabase();
  const trimmed = name.trim();
  let row: { id: string } | undefined;
  if (parentId === null) {
    row = db
      .prepare(
        `SELECT id FROM dokument_ordner
         WHERE geloescht_am IS NULL AND parent_id IS NULL
           AND LOWER(name) = LOWER(?) AND (? IS NULL OR id <> ?)`,
      )
      .get(trimmed, exceptId ?? null, exceptId ?? null) as { id: string } | undefined;
  } else {
    row = db
      .prepare(
        `SELECT id FROM dokument_ordner
         WHERE geloescht_am IS NULL AND parent_id = ?
           AND LOWER(name) = LOWER(?) AND (? IS NULL OR id <> ?)`,
      )
      .get(parentId, trimmed, exceptId ?? null, exceptId ?? null) as { id: string } | undefined;
  }
  return !!row;
}

export function createOrdner(input: CreateOrdnerInput): DokumentOrdner {
  const name = input.name.trim();
  if (!name) throw new OrdnerError("name-leer");
  const parentId = input.parentId ?? null;
  if (parentId && !getOrdner(parentId)) throw new OrdnerError("parent-missing");
  if (nameExists(name, parentId)) throw new OrdnerError("name-exists");
  const id = `ord-${crypto.randomUUID().slice(0, 12)}`;
  getDatabase()
    .prepare(`INSERT INTO dokument_ordner (id, name, parent_id) VALUES (?, ?, ?)`)
    .run(id, name, parentId);
  return getOrdner(id)!;
}

function pfadEnthaelt(startId: string, suchId: string): boolean {
  // Prüft, ob suchId im Pfad von startId nach oben liegt.
  let cur: string | null = startId;
  const guard = new Set<string>();
  while (cur) {
    if (cur === suchId) return true;
    if (guard.has(cur)) return false;
    guard.add(cur);
    const r = getDatabase()
      .prepare(`SELECT parent_id FROM dokument_ordner WHERE id = ? AND geloescht_am IS NULL`)
      .get(cur) as { parent_id: string | null } | undefined;
    cur = r?.parent_id ?? null;
  }
  return false;
}

export interface UpdateOrdnerInput {
  name?: string;
  parentId?: string | null;
}

export function updateOrdner(id: string, patch: UpdateOrdnerInput): DokumentOrdner | null {
  const cur = getOrdner(id);
  if (!cur) return null;
  const neuName = patch.name !== undefined ? patch.name.trim() : cur.name;
  if (!neuName) throw new OrdnerError("name-leer");
  const neuParent = patch.parentId !== undefined ? patch.parentId : cur.parentId;
  if (neuParent !== null) {
    if (neuParent === id) throw new OrdnerError("zyklus");
    const parentOrdner = getOrdner(neuParent);
    if (!parentOrdner) throw new OrdnerError("parent-missing");
    // Zyklus-Check: neuer Parent darf nicht unter `id` liegen.
    if (pfadEnthaelt(neuParent, id)) throw new OrdnerError("zyklus");
  }
  if (nameExists(neuName, neuParent, id)) throw new OrdnerError("name-exists");
  getDatabase()
    .prepare(`UPDATE dokument_ordner SET name = ?, parent_id = ? WHERE id = ?`)
    .run(neuName, neuParent, id);
  return getOrdner(id);
}

/** Soft-Löschen. Modus bestimmt, was mit Inhalten passiert. */
export function deleteOrdner(
  id: string,
  modus: "move-to-parent" | "cascade",
): { geloescht: boolean; verschoben: number; mitgeloescht: number } {
  const cur = getOrdner(id);
  if (!cur) return { geloescht: false, verschoben: 0, mitgeloescht: 0 };
  const db = getDatabase();
  let verschoben = 0;
  let mitgeloescht = 0;

  if (modus === "move-to-parent") {
    // Direkte Dokumente in den Parent hochziehen.
    const r1 = db
      .prepare(`UPDATE dokumente SET ordner_id = ? WHERE ordner_id = ? AND geloescht_am IS NULL`)
      .run(cur.parentId, id);
    verschoben += r1.changes;
    // Direkte Unterordner in den Parent hochziehen.
    db.prepare(`UPDATE dokument_ordner SET parent_id = ? WHERE parent_id = ? AND geloescht_am IS NULL`)
      .run(cur.parentId, id);
  } else {
    // cascade: rekursiv alle Nachfahren + deren Dokumente soft-löschen.
    const stack: string[] = [id];
    const visited = new Set<string>();
    const ids: string[] = [];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (visited.has(next)) continue;
      visited.add(next);
      ids.push(next);
      const kinder = db
        .prepare(`SELECT id FROM dokument_ordner WHERE parent_id = ? AND geloescht_am IS NULL`)
        .all(next) as { id: string }[];
      for (const k of kinder) stack.push(k.id);
    }
    // Dokumente in diesen Ordnern soft-löschen.
    const placeholders = ids.map(() => "?").join(",");
    const r1 = db
      .prepare(
        `UPDATE dokumente SET geloescht_am = datetime('now')
         WHERE ordner_id IN (${placeholders}) AND geloescht_am IS NULL`,
      )
      .run(...ids);
    mitgeloescht = r1.changes;
    // Ordner soft-löschen (alle in `ids`, außer dem Wurzel-id ist eh dabei).
    db.prepare(
      `UPDATE dokument_ordner SET geloescht_am = datetime('now')
       WHERE id IN (${placeholders}) AND geloescht_am IS NULL`,
    ).run(...ids);
    return { geloescht: true, verschoben: 0, mitgeloescht };
  }

  // Schließlich Ordner selbst soft-löschen.
  db.prepare(`UPDATE dokument_ordner SET geloescht_am = datetime('now') WHERE id = ?`).run(id);
  return { geloescht: true, verschoben, mitgeloescht };
}

/** Liefert alle Nachfahren-Ordner-IDs (inkl. Wurzel). */
export function descendantIds(rootId: string): string[] {
  const db = getDatabase();
  const stack: string[] = [rootId];
  const visited = new Set<string>();
  const out: string[] = [];
  while (stack.length > 0) {
    const next = stack.pop()!;
    if (visited.has(next)) continue;
    visited.add(next);
    out.push(next);
    const kinder = db
      .prepare(`SELECT id FROM dokument_ordner WHERE parent_id = ? AND geloescht_am IS NULL`)
      .all(next) as { id: string }[];
    for (const k of kinder) stack.push(k.id);
  }
  return out;
}

/** Setzt ordner_id für eine Menge an Dokumenten. */
export function moveDokumente(ids: string[], ordnerId: string | null): number {
  if (ids.length === 0) return 0;
  if (ordnerId !== null && !getOrdner(ordnerId)) throw new OrdnerError("parent-missing");
  const placeholders = ids.map(() => "?").join(",");
  const r = getDatabase()
    .prepare(
      `UPDATE dokumente SET ordner_id = ?
       WHERE id IN (${placeholders}) AND geloescht_am IS NULL`,
    )
    .run(ordnerId, ...ids);
  return r.changes;
}