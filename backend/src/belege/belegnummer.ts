// Belegnummern-Format laut Memory `mem://features/belegnummern`:
//   {KÜRZEL}{MM}{YY}/{NN}   z.B. GFU0526/01
// Wenn der Kunde kein Kürzel hat, wird ein Fallback-Präfix aus den Firmendaten
// (angebotPraefix / rechnungsPraefix) zusammen mit der Kundennummer verwendet.
//
// Vergabe IMMER innerhalb derselben SQLite-Transaktion wie der INSERT
// auf angebot/rechnung — siehe repos.

import { getDatabase } from "../db/index.js";
import { nextBelegNummer, periodeMMYY } from "../kunden/nummern.js";

export type BelegArt = "angebot" | "rechnung";

function loadKuerzel(kundeId: string): string | null {
  const row = getDatabase()
    .prepare(`SELECT kuerzel, nummer FROM kunde WHERE id = ?`)
    .get(kundeId) as { kuerzel: string | null; nummer: string } | undefined;
  if (!row) return null;
  if (row.kuerzel && row.kuerzel.trim()) return row.kuerzel.toUpperCase();
  return null;
}

function loadFallbackPrefix(art: BelegArt): string {
  return art === "angebot" ? "AN" : "RE";
}

/** Vergibt eine neue Belegnummer und persistiert den Zähler-Stand. */
export function vergebeBelegnummer(
  kundeId: string,
  art: BelegArt,
  bezugsdatum: Date = new Date(),
): string {
  const periode = periodeMMYY(bezugsdatum);
  const lfd = nextBelegNummer(kundeId, periode);
  const lfdStr = String(lfd).padStart(2, "0");

  const kuerzel = loadKuerzel(kundeId);
  if (kuerzel) {
    return `${kuerzel}${periode}/${lfdStr}`;
  }
  // Fallback ohne Kürzel
  return `${loadFallbackPrefix(art)}${periode}/${lfdStr}`;
}
