// Berechnet überfällige Rechnungen aus dem React-Query-Cache.
// Eine Rechnung gilt als überfällig, wenn:
//  - faelligkeitsdatum < heute
//  - Status nicht "bezahlt" und nicht "storniert"
//  - noch ein offener Restbetrag existiert

import { useMemo } from "react";
import { useRechnungen, useKunden } from "@/hooks/useApi";

export interface UeberfaelligEintrag {
  id: string;
  nummer: string;
  titel: string;
  kundeName: string;
  tageUeber: number;
  offen: number;
  faelligkeitsdatum: string;
}

export interface UeberfaelligErgebnis {
  count: number;
  gesamtOffen: number;
  rechnungen: UeberfaelligEintrag[];
}

export function useUeberfaelligeRechnungen(): UeberfaelligErgebnis {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: kunden = [] } = useKunden();

  return useMemo(() => {
    const heute = new Date().toISOString().slice(0, 10);
    const heuteMs = Date.parse(heute);
    const kundeMap = new Map(kunden.map((k) => [k.id, k]));

    const liste: UeberfaelligEintrag[] = [];
    let gesamtOffen = 0;

    for (const r of rechnungen) {
      if (r.status === "bezahlt" || r.status === "storniert") continue;
      if (!r.faelligkeitsdatum || r.faelligkeitsdatum >= heute) continue;

      const brutto =
        r.positionen.reduce(
          (a, p) => a + p.menge * p.einzelpreisNetto * (1 - (p.rabatt || 0) / 100),
          0,
        ) *
        (1 + r.steuersatz / 100);
      const bezahlt = r.zahlungen.reduce((a, z) => a + z.betrag, 0);
      const offen = brutto - bezahlt;
      if (offen <= 0.001) continue;

      const k = kundeMap.get(r.kundeId);
      const kundeName =
        k?.firmenname ||
        [k?.vorname, k?.nachname].filter(Boolean).join(" ") ||
        "Unbekannt";
      const tageUeber = Math.floor(
        (heuteMs - Date.parse(r.faelligkeitsdatum)) / 86_400_000,
      );

      liste.push({
        id: r.id,
        nummer: r.nummer,
        titel: r.titel,
        kundeName,
        tageUeber,
        offen,
        faelligkeitsdatum: r.faelligkeitsdatum,
      });
      gesamtOffen += offen;
    }

    // Längste Überfälligkeit zuerst
    liste.sort((a, b) => b.tageUeber - a.tageUeber);

    return { count: liste.length, gesamtOffen, rechnungen: liste };
  }, [rechnungen, kunden]);
}
