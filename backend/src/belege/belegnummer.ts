// Belegnummern-Vergabe — kollisionsfrei, importfest, mit Reservierung.
//
// Fluss:
//   1. Format-Präfix bestimmen (Kürzel oder Fallback "AN-K123" / "RE-K123").
//   2. Periode "MMYY" aus Bezugsdatum.
//   3. In Schleife max. 50 Versuche:
//      a) nextBelegNummer() zieht atomar die nächste NN aus dem Zähler.
//      b) Wenn die formatierte Nummer in `belegnummer_reserviert` steht oder
//         schon in angebot/rechnung existiert → noch eine ziehen.
//   4. Vergebene Nummer wird vom Aufrufer im selben tx in INSERT geschrieben.
//      Schlägt der INSERT trotz Vorprüfung an UNIQUE fehl (Race), retried der
//      Aufrufer komplett (siehe vergebeBelegnummerMitRetry).

import { getDatabase } from "../db/index.js";
import {
  fallbackPrefix,
  formatBelegnummer,
  periodeMMYY,
  type BelegArt,
} from "./nummer-format.js";
import { nextBelegNummer, bumpBelegNummerMindestens } from "../kunden/nummern.js";

export type { BelegArt } from "./nummer-format.js";

const MAX_SKIP_VERSUCHE = 50;
const MAX_RETRY = 5;

interface KundeNumInfo {
  kuerzel: string | null;
  nummer: string;
}

function loadKundeNum(kundeId: string): KundeNumInfo | null {
  const row = getDatabase()
    .prepare(`SELECT kuerzel, nummer FROM kunde WHERE id = ?`)
    .get(kundeId) as KundeNumInfo | undefined;
  if (!row) return null;
  return row;
}

function bestimmePrefix(art: BelegArt, kunde: KundeNumInfo): string {
  if (kunde.kuerzel && kunde.kuerzel.trim()) {
    return kunde.kuerzel.trim().toUpperCase();
  }
  return fallbackPrefix(art, kunde.nummer);
}

function istReserviertOderVergeben(art: BelegArt, nummer: string): boolean {
  const db = getDatabase();
  const r = db
    .prepare(`SELECT 1 FROM belegnummer_reserviert WHERE art=? AND nummer=?`)
    .get(art, nummer);
  if (r) return true;
  const tabelle = art === "angebot" ? "angebot" : "rechnung";
  const v = db
    .prepare(`SELECT 1 FROM ${tabelle} WHERE nummer=?`)
    .get(nummer);
  return Boolean(v);
}

/** Vergibt eine neue Belegnummer. MUSS innerhalb derselben Transaktion wie
 *  der Beleg-INSERT laufen. */
export function vergebeBelegnummer(
  kundeId: string,
  art: BelegArt,
  bezugsdatum: Date = new Date(),
): { nummer: string; periode: string } {
  const kunde = loadKundeNum(kundeId);
  if (!kunde) throw new Error(`Kunde ${kundeId} existiert nicht`);
  const prefix = bestimmePrefix(art, kunde);
  const periode = periodeMMYY(bezugsdatum);

  for (let i = 0; i < MAX_SKIP_VERSUCHE; i++) {
    const nn = nextBelegNummer(kundeId, art, periode);
    const nummer = formatBelegnummer({ prefix, periode, nn });
    if (!istReserviertOderVergeben(art, nummer)) {
      return { nummer, periode };
    }
    // sonst weiter — Zähler ist schon hochgezählt, nächste Iteration zieht NN+1
  }
  throw new Error(
    `Belegnummer konnte nach ${MAX_SKIP_VERSUCHE} Versuchen nicht vergeben werden ` +
      `(Kunde=${kundeId}, art=${art}, periode=${periode}). Reservierungen prüfen.`,
  );
}

/** Wrapper für Aufrufer: führt `fn(nummer, periode)` in der gegebenen
 *  Transaktion aus und retried bei UNIQUE-Constraint auf nummer (Race). */
export function mitBelegnummerRetry<T>(
  kundeId: string,
  art: BelegArt,
  bezugsdatum: Date,
  fn: (nummer: string, periode: string) => T,
): T {
  let lastErr: unknown = null;
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      const { nummer, periode } = vergebeBelegnummer(kundeId, art, bezugsdatum);
      return fn(nummer, periode);
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // SQLITE_CONSTRAINT_UNIQUE auf <tabelle>.nummer → erneut versuchen.
      if (!/UNIQUE constraint failed:.*\.nummer/i.test(msg)) {
        throw e;
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Belegnummer-Vergabe fehlgeschlagen");
}

/** Reserviert eine Nummer — verhindert Auto-Vergabe und alarmiert bei
 *  Konflikten mit bereits existierenden Belegen. */
export function reserviereNummer(input: {
  art: BelegArt;
  nummer: string;
  kundeId?: string;
  grund?: string;
}): { ok: true } | { ok: false; grund: "kollision" | "format" } {
  const db = getDatabase();
  // Format prüfen
  const importParse = await import("./nummer-format.js");
  if (!importParse.parseBelegnummer(input.nummer)) {
    return { ok: false, grund: "format" };
  }
  const tabelle = input.art === "angebot" ? "angebot" : "rechnung";
  const v = db
    .prepare(`SELECT 1 FROM ${tabelle} WHERE nummer=?`)
    .get(input.nummer);
  if (v) return { ok: false, grund: "kollision" };
  db.prepare(
    `INSERT OR IGNORE INTO belegnummer_reserviert (nummer, art, kunde_id, grund)
     VALUES (?, ?, ?, ?)`,
  ).run(input.nummer, input.art, input.kundeId ?? null, input.grund ?? null);
  return { ok: true };
}

/** Scannt alle bestehenden Belege und hebt die Zähler auf MAX(nn)+1.
 *  Idempotent — kann jederzeit erneut ausgeführt werden. */
export function importScanZaehler(): {
  angebot: number;
  rechnung: number;
  unbekannt: number;
} {
  const db = getDatabase();
  // Kunde-Map: nummer → id (für Import-Belege ohne klares kunde_id-Mapping
  // greifen wir auf die joinbare Spalte zurück).
  const stats = { angebot: 0, rechnung: 0, unbekannt: 0 };
  for (const art of ["angebot", "rechnung"] as const) {
    const rows = db
      .prepare(`SELECT kunde_id, nummer FROM ${art}`)
      .all() as { kunde_id: string; nummer: string }[];
    // Group by kunde_id+periode → max nn
    const max = new Map<string, number>();
    for (const r of rows) {
      // Lazy-Parse hier statt Top-Level-Import-Loop, um den Test simpel zu halten
      const m = /(\d{4})\/(\d{1,4})$/.exec(r.nummer);
      if (!m) {
        stats.unbekannt++;
        continue;
      }
      const periode = m[1];
      const nn = Number(m[2]);
      const key = `${r.kunde_id}|${periode}`;
      max.set(key, Math.max(max.get(key) ?? 0, nn));
    }
    for (const [key, nn] of max.entries()) {
      const [kundeId, periode] = key.split("|");
      bumpBelegNummerMindestens(kundeId, art, periode, nn + 1);
      stats[art]++;
    }
  }
  return stats;
}
