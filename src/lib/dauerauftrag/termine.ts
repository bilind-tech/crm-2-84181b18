// Reine Funktionen rund um Dauerauftrag-Termine. Keine Seiteneffekte.
//
// Liefert: nächste Stichtage, Periode-Schlüssel ("2026-04" / "2026-Q2"), Anzeige-Strings.
// Wird sowohl im Frontend (Vorschau, Scheduler) als auch im Pi-Backend (Cron) genutzt.

import type { Dauerauftrag, ISODate } from "@/lib/api/types";

export function isoDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

function clampMonatstag(jahr: number, monatIdx: number, tag: number): Date {
  // Stichtag 31. → in Kurzmonaten auf den letzten Tag fallen
  const letzter = new Date(jahr, monatIdx + 1, 0).getDate();
  return new Date(jahr, monatIdx, Math.min(tag, letzter));
}

function monatsletzter(jahr: number, monatIdx: number): Date {
  return new Date(jahr, monatIdx + 1, 0);
}

/** Berechnet einen einzelnen Stichtag innerhalb eines Monats anhand der DA-Stichtagsregel. */
function stichtagImMonat(da: Dauerauftrag, jahr: number, monatIdx: number): Date {
  const t = da.stichtag.typ;
  if (t === "monatsletzter") return monatsletzter(jahr, monatIdx);
  if (t === "monatstag") return clampMonatstag(jahr, monatIdx, da.stichtag.wert ?? 1);
  // quartalstag: Tag X innerhalb des ersten Monats des Quartals
  return clampMonatstag(jahr, monatIdx, da.stichtag.wert ?? 1);
}

/** Schritt zwischen zwei Läufen in Monaten je nach Frequenz. */
function frequenzMonate(da: Dauerauftrag): number {
  switch (da.frequenz) {
    case "monatlich": return 1;
    case "quartalsweise": return 3;
    case "halbjaehrlich": return 6;
    case "jaehrlich": return 12;
  }
}

/** Liefert den ersten Stichtag ≥ `ab`, der zur DA-Regel passt. */
function ersterStichtagAb(da: Dauerauftrag, ab: Date): Date {
  const start = new Date(da.laufzeitVon);
  const von = ab < start ? start : ab;
  const schritt = frequenzMonate(da);

  // Anker: Monat von laufzeitVon, in Schrittweite vorrücken
  let jahr = start.getFullYear();
  let monat = start.getMonth();
  let kandidat = stichtagImMonat(da, jahr, monat);

  // Bei quartalsweise/halbjährlich/jährlich richten wir uns nach dem Anker-Monat von laufzeitVon
  while (kandidat < von) {
    monat += schritt;
    while (monat > 11) { monat -= 12; jahr += 1; }
    kandidat = stichtagImMonat(da, jahr, monat);
  }
  return kandidat;
}

/** Nächste N Stichtage ab `ab` (inklusive Heute, falls noch fällig). */
export function berechneNaechsteLauftermine(
  da: Dauerauftrag,
  ab: Date,
  n: number,
): Date[] {
  if (n <= 0) return [];
  if (da.status === "beendet") return [];
  const ende = da.laufzeitBis ? new Date(da.laufzeitBis) : null;

  const ergebnis: Date[] = [];
  const schritt = frequenzMonate(da);
  let kandidat = ersterStichtagAb(da, ab);
  let jahr = kandidat.getFullYear();
  let monat = kandidat.getMonth();

  while (ergebnis.length < n) {
    if (ende && kandidat > ende) break;
    ergebnis.push(new Date(kandidat));
    monat += schritt;
    while (monat > 11) { monat -= 12; jahr += 1; }
    kandidat = stichtagImMonat(da, jahr, monat);
  }
  return ergebnis;
}

/** Periode-Schlüssel für Idempotenz: "2026-04" oder "2026-Q2" oder "2026-H1" oder "2026". */
export function periodeFuer(da: Dauerauftrag, datum: Date): string {
  const j = datum.getFullYear();
  const m = datum.getMonth();
  switch (da.frequenz) {
    case "monatlich":
      return `${j}-${String(m + 1).padStart(2, "0")}`;
    case "quartalsweise":
      return `${j}-Q${Math.floor(m / 3) + 1}`;
    case "halbjaehrlich":
      return `${j}-H${m < 6 ? 1 : 2}`;
    case "jaehrlich":
      return String(j);
  }
}

const MONATE_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Menschenlesbare Bezeichnung der Periode: "April 2026", "Q2 2026", … */
export function periodeBezeichnung(da: Dauerauftrag, datum: Date): string {
  const j = datum.getFullYear();
  const m = datum.getMonth();
  switch (da.frequenz) {
    case "monatlich": return `${MONATE_DE[m]} ${j}`;
    case "quartalsweise": return `Q${Math.floor(m / 3) + 1} ${j}`;
    case "halbjaehrlich": return `${m < 6 ? "1. Halbjahr" : "2. Halbjahr"} ${j}`;
    case "jaehrlich": return `Jahr ${j}`;
  }
}

/** Erster und letzter Tag der Periode (für Rechnungs-Leistungszeitraum-Texte). */
export function periodeBereich(da: Dauerauftrag, datum: Date): { von: Date; bis: Date } {
  const j = datum.getFullYear();
  const m = datum.getMonth();
  switch (da.frequenz) {
    case "monatlich":
      return { von: new Date(j, m, 1), bis: new Date(j, m + 1, 0) };
    case "quartalsweise": {
      const qStart = Math.floor(m / 3) * 3;
      return { von: new Date(j, qStart, 1), bis: new Date(j, qStart + 3, 0) };
    }
    case "halbjaehrlich": {
      const hStart = m < 6 ? 0 : 6;
      return { von: new Date(j, hStart, 1), bis: new Date(j, hStart + 6, 0) };
    }
    case "jaehrlich":
      return { von: new Date(j, 0, 1), bis: new Date(j, 11, 31) };
  }
}

/** Ist der DA aktuell pausiert? (status oder pausiertBis ≥ heute) */
export function istPausiert(da: Dauerauftrag, heute: Date = new Date()): boolean {
  if (da.status === "pausiert") return true;
  if (da.pausiertBis && new Date(da.pausiertBis) >= heute) return true;
  return false;
}

/** Monatlicher Brutto-Wert für MRR-Anzeige. Quartalsweise → /3, jährlich → /12. */
export function monatlicheBrutto(da: Dauerauftrag, brutto: number): number {
  switch (da.frequenz) {
    case "monatlich": return brutto;
    case "quartalsweise": return brutto / 3;
    case "halbjaehrlich": return brutto / 6;
    case "jaehrlich": return brutto / 12;
  }
}
