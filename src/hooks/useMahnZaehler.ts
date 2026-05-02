// Hook: liefert Anzahl der Rechnungen, für die eine Mahn-Aktion empfohlen wird.
// Wird im Sidebar-Badge und im Dashboard-Widget verwendet.

import { useMemo } from "react";
import { useMahnEinstellungen, useRechnungen } from "@/hooks/useApi";
import { bestimmeMahnZustand } from "@/lib/mahnung/regeln";
import { passtInZeitraum, type ZeitraumState } from "@/components/filters/ZeitraumFilter";

export interface MahnZaehler {
  /** Rechnungen, für die jetzt eine Mahnstufe vorgeschlagen wird. */
  aktionEmpfohlen: number;
  /** Alle aktuell überfälligen Rechnungen (auch ohne Empfehlung, z.B. pausiert). */
  ueberfaellig: number;
  /** Summe der offenen Beträge aller überfälligen Rechnungen. */
  offenSumme: number;
  /** Inkasso-reife Rechnungen (Stufe 3 raus, noch nicht übergeben). */
  inkassoReif: number;
}

export function useMahnZaehler(zeitraum?: ZeitraumState): MahnZaehler {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: einstellungen } = useMahnEinstellungen();

  return useMemo(() => {
    if (!einstellungen) {
      return { aktionEmpfohlen: 0, ueberfaellig: 0, offenSumme: 0, inkassoReif: 0 };
    }
    const quelle = zeitraum
      ? rechnungen.filter((r) => passtInZeitraum(r.rechnungsdatum, zeitraum))
      : rechnungen;
    let aktion = 0;
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
      if (z.empfohleneStufe !== null) aktion += 1;
      if (z.istInkassoReif && !r.inkassoMarkiert) inkasso += 1;
    }
    return {
      aktionEmpfohlen: aktion,
      ueberfaellig: ueber,
      offenSumme: summe,
      inkassoReif: inkasso,
    };
  }, [rechnungen, einstellungen, zeitraum]);
}
