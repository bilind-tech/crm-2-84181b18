// Berechnet fällige Zahlungserinnerungen aus dem React-Query-Cache.
//
// Trigger: ≥ ERINNERUNG_AB_TAGEN Tage nach Fälligkeit, Status nicht „bezahlt"
// / „storniert" / „entwurf", noch offener Restbetrag > 0.
// Wenn bereits eine Erinnerung verschickt wurde (E-Mail-Versand-Historie mit
// vorlageId === Erinnerung-Vorlage), darf die nächste erst nach
// ERINNERUNG_INTERVALL Tagen erneut vorgeschlagen werden.

import { useMemo } from "react";
import { useRechnungen, useEmailVersand } from "@/hooks/useApi";
import { useErinnerungVorlageId } from "@/lib/erinnerung/seedVorlage";
import { ERINNERUNG_AB_TAGEN, ERINNERUNG_INTERVALL } from "@/lib/erinnerung/regeln";

export interface ErinnerungEintrag {
  /** Rechnungs-ID. */
  id: string;
  nummer: string;
  kundeId: string;
  /** Tage seit Fälligkeit. */
  tageUeber: number;
  /** Noch offener Restbetrag in EUR. */
  offen: number;
  /** Wie viele Erinnerungen bisher verschickt wurden. */
  anzahlBisher: number;
  /** ISO-Zeitpunkt der letzten Erinnerung, falls vorhanden. */
  letzteErinnerungAm?: string;
}

export interface ErinnerungenErgebnis {
  count: number;
  gesamtOffen: number;
  eintraege: ErinnerungEintrag[];
}

export function useErinnerungen(): ErinnerungenErgebnis {
  const { data: rechnungen = [] } = useRechnungen();
  const { data: versand = [] } = useEmailVersand({ belegTyp: "rechnung" });
  const erinnerungVorlageId = useErinnerungVorlageId();

  return useMemo(() => {
    const heuteMs = Date.now();
    const eintraege: ErinnerungEintrag[] = [];
    let gesamtOffen = 0;

    for (const r of rechnungen) {
      if (r.status === "bezahlt" || r.status === "storniert" || r.status === "entwurf") continue;
      if (!r.faelligkeitsdatum) continue;

      const faelligMs = Date.parse(r.faelligkeitsdatum + "T00:00:00");
      if (!Number.isFinite(faelligMs)) continue;
      const tageUeber = Math.floor((heuteMs - faelligMs) / 86_400_000);
      if (tageUeber < ERINNERUNG_AB_TAGEN) continue;

      let netto = 0;
      let steuer = 0;
      for (const p of r.positionen) {
        const linie =
          p.modus === "pauschal"
            ? (p.pauschalpreisNetto ?? 0) * (1 - (p.rabatt || 0) / 100)
            : p.menge * p.einzelpreisNetto * (1 - (p.rabatt || 0) / 100);
        netto += linie;
        steuer += linie * (p.steuersatz / 100);
      }
      const brutto = (netto + steuer) * (1 - (r.rabattGesamt || 0) / 100);
      const bezahlt = r.zahlungen.reduce((a, z) => a + z.betrag, 0);
      const offen = brutto - bezahlt;
      if (offen <= 0.01) continue;

      // Bisherige Erinnerungen für genau diese Rechnung
      const ownErinnerungen = erinnerungVorlageId
        ? versand.filter(
            (v) =>
              v.belegId === r.id &&
              v.vorlageId === erinnerungVorlageId &&
              (v.status === "gesendet" || v.sendOk === true),
          )
        : [];

      const letzteAm = ownErinnerungen
        .map((v) => v.versendetAm ?? "")
        .filter(Boolean)
        .sort()
        .pop();

      if (letzteAm) {
        const tageSeit = Math.floor((heuteMs - Date.parse(letzteAm)) / 86_400_000);
        if (tageSeit < ERINNERUNG_INTERVALL) continue;
      }

      eintraege.push({
        id: r.id,
        nummer: r.nummer,
        kundeId: r.kundeId,
        tageUeber,
        offen,
        anzahlBisher: ownErinnerungen.length,
        letzteErinnerungAm: letzteAm,
      });
      gesamtOffen += offen;
    }

    eintraege.sort((a, b) => b.tageUeber - a.tageUeber);
    return { eintraege, count: eintraege.length, gesamtOffen };
  }, [rechnungen, versand, erinnerungVorlageId]);
}

/** Schnell-Check für inline „Erinnerung senden"-Buttons in Listen/Detail. */
export function useIstErinnerungFaellig(rechnungId: string): boolean {
  const { eintraege } = useErinnerungen();
  return eintraege.some((e) => e.id === rechnungId);
}