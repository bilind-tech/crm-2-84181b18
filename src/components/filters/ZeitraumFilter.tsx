// Helpers für Zeitraum-Filter (Jahr + Monat) — die UI wird inline in der
// jeweiligen FilterBar gerendert (Desktop: Pills, Mobile: im Filter-Sheet).
// Hier liegen nur State-Typ, Default, Match-Funktion und Monatsnamen.

export const MONATE_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export interface ZeitraumState {
  /** "alle" oder "YYYY" */
  jahr: string;
  /** "alle" oder "01"–"12" */
  monat: string;
}

export const ZEITRAUM_ALLE: ZeitraumState = { jahr: "alle", monat: "alle" };

/** Standard: aktuelles Jahr, alle Monate. Wird live ausgewertet. */
export function zeitraumAktuellesJahr(): ZeitraumState {
  return { jahr: new Date().getFullYear().toString(), monat: "alle" };
}

/** Liefert sortierte Jahresliste aus den verfügbaren ISO-Daten + aktuelles Jahr. */
export function jahreAusDaten(verfuegbareDaten: string[]): string[] {
  const set = new Set<string>();
  for (const d of verfuegbareDaten) {
    if (d && d.length >= 4) set.add(d.slice(0, 4));
  }
  set.add(new Date().getFullYear().toString());
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

/** Prüft, ob ein ISO-Datum (YYYY-MM-DD) in den gewählten Zeitraum fällt. */
export function passtInZeitraum(isoDatum: string | undefined, z: ZeitraumState): boolean {
  if (z.jahr === "alle") return true;
  if (!isoDatum || isoDatum.length < 7) return false;
  if (isoDatum.slice(0, 4) !== z.jahr) return false;
  if (z.monat !== "alle" && isoDatum.slice(5, 7) !== z.monat) return false;
  return true;
}

export function zeitraumIstAktiv(z: ZeitraumState): boolean {
  return z.jahr !== "alle" || z.monat !== "alle";
}
