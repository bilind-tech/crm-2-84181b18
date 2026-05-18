// Liefert die Liste der aktuell vorgeschlagenen Zahlungserinnerungen.
// Reine Frontend-Aggregation aus bestehenden /rechnungen-, /kunden- und
// /email/versand-Endpoints — kein neuer Backend-Call.

import { useMemo } from "react";
import { useEmailVersand, useKunden, useRechnungen } from "@/hooks/useApi";
import {
  berechneErinnerungsKandidaten,
  DEFAULT_TAGE_NACH_FAELLIGKEIT,
  type ErinnerungsKandidat,
} from "@/lib/erinnerung/regeln";

export interface ErinnerungsErgebnis {
  count: number;
  gesamtOffen: number;
  kandidaten: ErinnerungsKandidat[];
}

export function useErinnerungsKandidaten(
  tageNachFaelligkeit: number = DEFAULT_TAGE_NACH_FAELLIGKEIT,
): ErinnerungsErgebnis {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: kunden = [] } = useKunden();
  const { data: versand = [] } = useEmailVersand();

  return useMemo(() => {
    const kandidaten = berechneErinnerungsKandidaten(rechnungen, kunden, versand, {
      tageNachFaelligkeit,
    });
    const gesamtOffen = kandidaten.reduce((a, k) => a + k.offen, 0);
    return { count: kandidaten.length, gesamtOffen, kandidaten };
  }, [rechnungen, kunden, versand, tageNachFaelligkeit]);
}