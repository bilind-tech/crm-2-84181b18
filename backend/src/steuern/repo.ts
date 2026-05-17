import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/index.js";
import {
  rowToBezahlt,
  rowToEinstellungen,
  rowToManueller,
  type BezahltRow,
  type EinstellungenRow,
  type ManuellerRow,
} from "./mappers.js";
import { STEUER_DEFAULTS } from "./types.js";
import type {
  BezahltMarkierung,
  BezahltMarkierungInput,
  ManuellerPosten,
  ManuellerPostenInput,
  SteuerEinstellungen,
} from "./types.js";

// ---------- Einstellungen (Singleton) ----------

export function getEinstellungen(): SteuerEinstellungen {
  const db = getDatabase();
  let row = db
    .prepare("SELECT * FROM steuer_einstellungen WHERE id = 1")
    .get() as EinstellungenRow | undefined;
  if (!row) {
    db.prepare("INSERT OR IGNORE INTO steuer_einstellungen (id) VALUES (1)").run();
    row = db
      .prepare("SELECT * FROM steuer_einstellungen WHERE id = 1")
      .get() as EinstellungenRow;
  }
  return rowToEinstellungen(row);
}

export function updateEinstellungen(
  patch: Partial<Omit<SteuerEinstellungen, "updatedAt">>,
): SteuerEinstellungen {
  const db = getDatabase();
  const map: Record<string, string> = {
    kstSatz: "kst_satz",
    soliSatz: "soli_satz",
    gewstMesszahl: "gewst_messzahl",
    gewstHebesatz: "gewst_hebesatz",
    ustRhythmus: "ust_rhythmus",
    ruecklageSatz: "ruecklage_satz",
    ustPufferSatz: "ust_puffer_satz",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(patch)) {
    const col = map[k];
    if (!col || v === undefined) continue;
    sets.push(`${col} = ?`);
    vals.push(v);
  }
  if (sets.length === 0) return getEinstellungen();
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE steuer_einstellungen SET ${sets.join(", ")} WHERE id = 1`).run(...vals);
  return getEinstellungen();
}

export function resetEinstellungen(): SteuerEinstellungen {
  return updateEinstellungen({ ...STEUER_DEFAULTS });
}

/** Löscht alle Bezahlt-Markierungen, deren posten_id mit `prefix` beginnt. */
export function deleteBezahltByPrefix(prefix: string): number {
  const db = getDatabase();
  const r = db
    .prepare("DELETE FROM steuer_bezahlt_markierung WHERE posten_id LIKE ?")
    .run(`${prefix}%`);
  return r.changes;
}

// ---------- Manuelle Posten ----------

export function listManuellePosten(): ManuellerPosten[] {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT * FROM steuer_manueller_posten WHERE geloescht_am IS NULL ORDER BY faellig_am ASC")
    .all() as ManuellerRow[];
  return rows.map(rowToManueller);
}

export function getManuellerPosten(id: string): ManuellerPosten | null {
  const db = getDatabase();
  const r = db
    .prepare("SELECT * FROM steuer_manueller_posten WHERE id = ? AND geloescht_am IS NULL")
    .get(id) as ManuellerRow | undefined;
  return r ? rowToManueller(r) : null;
}

export function addManuellerPosten(input: ManuellerPostenInput): ManuellerPosten {
  const db = getDatabase();
  const id = `man-${randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO steuer_manueller_posten
       (id, art, titel, zeitraum_jahr, zeitraum_monat, zeitraum_quartal,
        faellig_am, geschaetzter_betrag, notiz)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.art,
    input.titel,
    input.zeitraum.jahr,
    input.zeitraum.monat ?? null,
    input.zeitraum.quartal ?? null,
    input.faelligAm,
    input.geschaetzterBetrag,
    input.notiz ?? null,
  );
  return getManuellerPosten(id)!;
}

export function updateManuellerPosten(
  id: string,
  patch: Partial<ManuellerPostenInput>,
): ManuellerPosten | null {
  const existing = getManuellerPosten(id);
  if (!existing) return null;
  const db = getDatabase();
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (patch.art !== undefined) { sets.push("art = ?"); vals.push(patch.art); }
  if (patch.titel !== undefined) { sets.push("titel = ?"); vals.push(patch.titel); }
  if (patch.zeitraum !== undefined) {
    sets.push("zeitraum_jahr = ?", "zeitraum_monat = ?", "zeitraum_quartal = ?");
    vals.push(patch.zeitraum.jahr, patch.zeitraum.monat ?? null, patch.zeitraum.quartal ?? null);
  }
  if (patch.faelligAm !== undefined) { sets.push("faellig_am = ?"); vals.push(patch.faelligAm); }
  if (patch.geschaetzterBetrag !== undefined) {
    sets.push("geschaetzter_betrag = ?"); vals.push(patch.geschaetzterBetrag);
  }
  if (patch.notiz !== undefined) { sets.push("notiz = ?"); vals.push(patch.notiz); }
  if (sets.length === 0) return existing;
  vals.push(id);
  db.prepare(`UPDATE steuer_manueller_posten SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return getManuellerPosten(id);
}

// Soft-Delete. Hart-Löschen (inkl. Bezahlt-Markierung) passiert über
// Einstellungen → Datenbank.
export function removeManuellerPosten(id: string): boolean {
  const r = getDatabase()
    .prepare("UPDATE steuer_manueller_posten SET geloescht_am = datetime('now') WHERE id = ? AND geloescht_am IS NULL")
    .run(id);
  return r.changes > 0;
}

// ---------- Bezahlt-Markierungen ----------

export function listBezahlt(): Record<string, BezahltMarkierung> {
  const db = getDatabase();
  const rows = db
    .prepare("SELECT * FROM steuer_bezahlt_markierung")
    .all() as BezahltRow[];
  const out: Record<string, BezahltMarkierung> = {};
  for (const r of rows) out[r.posten_id] = rowToBezahlt(r);
  return out;
}

export function setBezahlt(
  postenId: string,
  input: BezahltMarkierungInput,
): BezahltMarkierung {
  const db = getDatabase();
  db.prepare(
    `INSERT INTO steuer_bezahlt_markierung
       (posten_id, bezahlt_am, tatsaechlicher_betrag, notiz)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(posten_id) DO UPDATE SET
       bezahlt_am = excluded.bezahlt_am,
       tatsaechlicher_betrag = excluded.tatsaechlicher_betrag,
       notiz = excluded.notiz`,
  ).run(
    postenId,
    input.bezahltAm,
    input.tatsaechlicherBetrag ?? null,
    input.notiz ?? null,
  );
  const r = db
    .prepare("SELECT * FROM steuer_bezahlt_markierung WHERE posten_id = ?")
    .get(postenId) as BezahltRow;
  return rowToBezahlt(r);
}

export function removeBezahlt(postenId: string): boolean {
  const db = getDatabase();
  const r = db
    .prepare("DELETE FROM steuer_bezahlt_markierung WHERE posten_id = ?")
    .run(postenId);
  return r.changes > 0;
}
