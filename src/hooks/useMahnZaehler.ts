// Hook: liefert Mahn-Kennzahlen für Sidebar-Badge & Dashboard.
//
// `aktionEmpfohlen` kommt aus dem Backend-Lauf (kanonische Quelle, identisch
// zur Cron-Empfehlung). `ueberfaellig`, `offenSumme`, `inkassoReif` werden
// weiterhin clientseitig aus den Rechnungen abgeleitet, weil sie filterbar
// nach Zeitraum sein müssen und nicht im /mahnung/status enthalten sind.

import { useMemo } from "react";
import { useMahnEinstellungen, useMahnStatus, useRechnungen } from "@/hooks/useApi";
import { bestimmeMahnZustand } from "@/lib/mahnung/regeln";
import { passtInZeitraum, type ZeitraumState } from "@/components/filters/ZeitraumFilter";

export interface MahnZaehler {
  /** Aus Backend-Lauf: Anzahl Rechnungen mit empfohlener Mahnstufe. */
  aktionEmpfohlen: number;
  /** Alle aktuell überfälligen Rechnungen (Client-Berechnung, optional gefiltert). */
  ueberfaellig: number;
  /** Summe der offenen Beträge aller überfälligen Rechnungen. */
  offenSumme: number;
  /** Inkasso-reife Rechnungen (Stufe 3 raus, noch nicht übergeben). */
  inkassoReif: number;
}

export function useMahnZaehler(zeitraum?: ZeitraumState): MahnZaehler {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: einstellungen } = useMahnEinstellungen();
  const { data: status } = useMahnStatus();

  return useMemo(() => {
    const aktionAusBackend = status?.letzterLauf?.vorschlaege ?? 0;
    if (!einstellungen) {
      return { aktionEmpfohlen: aktionAusBackend, ueberfaellig: 0, offenSumme: 0, inkassoReif: 0 };
    }
    const quelle = zeitraum
      ? rechnungen.filter((r) => passtInZeitraum(r.rechnungsdatum, zeitraum))
      : rechnungen;
    let ueber = 0;
    let summe = 0;
    let inkasso = 0;
    for (const r of quelle) {
      const z = bestimmeMahnZustand(r, einstellungen);
      if (!z.istMahnfaehig) continue;
      if (z.tageUeberfaellig > 0) {
        ueber += 1;
        summe += z.offenEUR;
      }
      if (z.istInkassoReif && !r.inkassoMarkiert) inkasso += 1;
    }
    // Wenn ein Zeitraum gefiltert wurde, ist der Backend-Wert ungenau —
    // dann lieber Client-Berechnung als grobe Annäherung.
    const aktion = zeitraum
      ? quelle.reduce((acc, r) => {
          const z = bestimmeMahnZustand(r, einstellungen);
          return acc + (z.empfohleneStufe !== null ? 1 : 0);
        }, 0)
      : aktionAusBackend;
    return {
      aktionEmpfohlen: aktion,
      ueberfaellig: ueber,
      offenSumme: summe,
      inkassoReif: inkasso,
    };
  }, [rechnungen, einstellungen, status, zeitraum]);
}
