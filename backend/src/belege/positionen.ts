// Positionen-Helper: Replace-All (löscht alle Positionen eines Belegs und
// schreibt die übergebenen neu, in der gegebenen Reihenfolge).
import crypto from "node:crypto";
import type Database from "better-sqlite3";
import { euroToCt, positionRowToApi, type ApiPosition, type DbPosition } from "./mappers.js";

export interface PositionInput {
  id?: string;
  beschreibung?: string;
  menge?: number;
  einheit?: string;
  einzelpreisNetto?: number;
  steuersatz?: number;
  rabatt?: number;
  modus?: "einzel" | "pauschal";
  pauschalpreisNetto?: number;
  ausfuehrung?: string;
}

const ALLOWED_EINHEITEN = ["stk", "h", "m2", "pauschal", "tag", "monat"];

function normEinheit(e: string | undefined): string {
  return e && ALLOWED_EINHEITEN.includes(e) ? e : "stk";
}

export function replacePositionen(
  db: Database.Database,
  table: "angebot_position" | "rechnung_position",
  fkCol: "angebot_id" | "rechnung_id",
  belegId: string,
  positionen: PositionInput[],
): void {
  db.prepare(`DELETE FROM ${table} WHERE ${fkCol} = ?`).run(belegId);
  if (!positionen.length) return;
  const ins = db.prepare(
    `INSERT INTO ${table} (
       id, ${fkCol}, sort, beschreibung, menge, einheit,
       einzelpreis_netto_ct, steuersatz, rabatt, modus,
       pauschalpreis_netto_ct, ausfuehrung
     ) VALUES (
       @id, @fk, @sort, @beschreibung, @menge, @einheit,
       @einzelpreis_netto_ct, @steuersatz, @rabatt, @modus,
       @pauschalpreis_netto_ct, @ausfuehrung
     )`,
  );
  positionen.forEach((p, i) => {
    ins.run({
      id: p.id ?? crypto.randomUUID(),
      fk: belegId,
      sort: i,
      beschreibung: p.beschreibung ?? "",
      menge: p.menge ?? 1,
      einheit: normEinheit(p.einheit),
      einzelpreis_netto_ct: euroToCt(p.einzelpreisNetto ?? 0),
      steuersatz: p.steuersatz ?? 19,
      rabatt: p.rabatt ?? 0,
      modus: p.modus === "pauschal" ? "pauschal" : "einzel",
      pauschalpreis_netto_ct: p.pauschalpreisNetto != null ? euroToCt(p.pauschalpreisNetto) : null,
      ausfuehrung: p.ausfuehrung ?? null,
    });
  });
}

const POS_COLS = `
  id, sort, beschreibung, menge, einheit, einzelpreis_netto_ct,
  steuersatz, rabatt, modus, pauschalpreis_netto_ct, ausfuehrung
`;

export function listPositionen(
  db: Database.Database,
  table: "angebot_position" | "rechnung_position",
  fkCol: "angebot_id" | "rechnung_id",
  belegId: string,
): ApiPosition[] {
  const rows = db
    .prepare(`SELECT ${POS_COLS} FROM ${table} WHERE ${fkCol} = ? ORDER BY sort ASC`)
    .all(belegId) as DbPosition[];
  return rows.map(positionRowToApi);
}
