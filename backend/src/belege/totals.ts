// Brutto-Berechnung in Cent — autoritative serverseitige Summe.
// Wird zur Status-Ableitung (teilbezahlt/bezahlt) genutzt.
import type Database from "better-sqlite3";

interface PosRow {
  menge: number;
  einzelpreis_netto_ct: number;
  steuersatz: number;
  rabatt: number;
  modus: string;
  pauschalpreis_netto_ct: number | null;
}

/** Brutto in Cent. Berücksichtigt Position-Rabatt + Beleg-Rabatt + Steuersatz pro Position. */
export function rechnungBruttoCt(db: Database.Database, rechnungId: string): number {
  const head = db
    .prepare(`SELECT rabatt_gesamt FROM rechnung WHERE id = ?`)
    .get(rechnungId) as { rabatt_gesamt: number } | undefined;
  if (!head) return 0;
  const rows = db
    .prepare(
      `SELECT menge, einzelpreis_netto_ct, steuersatz, rabatt, modus, pauschalpreis_netto_ct
         FROM rechnung_position WHERE rechnung_id = ?`,
    )
    .all(rechnungId) as PosRow[];

  const rabattGesamt = head.rabatt_gesamt || 0;
  let bruttoSum = 0;
  for (const p of rows) {
    const nettoBase =
      p.modus === "pauschal" && p.pauschalpreis_netto_ct != null
        ? p.pauschalpreis_netto_ct
        : Math.round(p.menge * p.einzelpreis_netto_ct);
    const nachPosRabatt = nettoBase * (1 - (p.rabatt || 0) / 100);
    const nachGesamtRabatt = nachPosRabatt * (1 - rabattGesamt / 100);
    const brutto = nachGesamtRabatt * (1 + (p.steuersatz || 0) / 100);
    bruttoSum += brutto;
  }
  return Math.round(bruttoSum);
}

/** Summe aller Zahlungen in Cent. */
export function zahlungSummeCt(db: Database.Database, rechnungId: string): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(betrag_ct), 0) AS s FROM zahlung WHERE rechnung_id = ?`)
    .get(rechnungId) as { s: number };
  return row.s;
}
