// Atomare Vergabe von Belegnummern und Stammdaten-Nummern.
// SQLite "INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING" ist eine einzige
// Anweisung und damit innerhalb der WAL-Schreibtransaktion atomar.
// Mehrere parallele Aufrufe können nicht dieselbe Nummer ziehen — busy_timeout
// + WAL bringen sie in Reihe.

import { getDatabase } from "../db/index.js";
import type { BelegArt } from "../belege/nummer-format.js";

export { periodeMMYY } from "../belege/nummer-format.js";

/** Liefert die nächste laufende Nummer für (kunde, belegart, periodeMMYY).
 *  Atomar: UPSERT + RETURNING in einer SQL-Anweisung. */
export function nextBelegNummer(
  kundeId: string,
  belegart: BelegArt,
  periodeMMYY: string,
): number {
  const row = getDatabase()
    .prepare(
      `INSERT INTO belegnummer_zaehler (kunde_id, belegart, periode, naechster_start)
       VALUES (?, ?, ?, 2)
       ON CONFLICT(kunde_id, belegart, periode)
         DO UPDATE SET naechster_start = naechster_start + 1
       RETURNING naechster_start`,
    )
    .get(kundeId, belegart, periodeMMYY) as { naechster_start: number };
  return row.naechster_start - 1;
}

/** Setzt den Zähler mindestens auf `mindestens` hoch (z.B. nach Import).
 *  Idempotent. */
export function bumpBelegNummerMindestens(
  kundeId: string,
  belegart: BelegArt,
  periodeMMYY: string,
  mindestens: number,
): void {
  // mindestens = nächste freie NN, also "naechster_start" muss = mindestens sein.
  getDatabase()
    .prepare(
      `INSERT INTO belegnummer_zaehler (kunde_id, belegart, periode, naechster_start)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(kunde_id, belegart, periode)
         DO UPDATE SET naechster_start = MAX(naechster_start, excluded.naechster_start)`,
    )
    .run(kundeId, belegart, periodeMMYY, Math.max(1, mindestens));
}

/** Vorschau ohne Vergabe. */
export function peekBelegNummer(
  kundeId: string,
  belegart: BelegArt,
  periodeMMYY: string,
): number {
  const row = getDatabase()
    .prepare(
      `SELECT naechster_start FROM belegnummer_zaehler
       WHERE kunde_id=? AND belegart=? AND periode=?`,
    )
    .get(kundeId, belegart, periodeMMYY) as { naechster_start: number } | undefined;
  return row ? row.naechster_start : 1;
}

/** Liefert die nächste Kundennummer im gegebenen Jahr (1, 2, 3, …). */
export function nextKundeNummer(jahr: number): number {
  const row = getDatabase()
    .prepare(
      `INSERT INTO kunde_nummer_zaehler (jahr, naechster)
       VALUES (?, 2)
       ON CONFLICT(jahr) DO UPDATE SET naechster = naechster + 1
       RETURNING naechster`,
    )
    .get(jahr) as { naechster: number };
  return row.naechster - 1;
}

/** Liefert die nächste Objektnummer im gegebenen Jahr. */
export function nextObjektNummer(jahr: number): number {
  const row = getDatabase()
    .prepare(
      `INSERT INTO objekt_nummer_zaehler (jahr, naechster)
       VALUES (?, 2)
       ON CONFLICT(jahr) DO UPDATE SET naechster = naechster + 1
       RETURNING naechster`,
    )
    .get(jahr) as { naechster: number };
  return row.naechster - 1;
}

export function formatKundeNummer(jahr: number, n: number): string {
  return `K-${jahr}-${String(n).padStart(3, "0")}`;
}
export function formatObjektNummer(jahr: number, n: number): string {
  return `O-${jahr}-${String(n).padStart(3, "0")}`;
}
