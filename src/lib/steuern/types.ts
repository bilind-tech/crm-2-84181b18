// Typen für das Steuer-Modul (GmbH Sankt Augustin).
// Reines Frontend-Modell, später vom Pi-Backend gespiegelt.

export type SteuerArt = "ust" | "kst" | "soli" | "gewst" | "manuell";

export type SteuerStatus = "offen" | "bezahlt" | "ueberfaellig";

export type UstRhythmus = "monatlich" | "quartalsweise" | "jaehrlich";

export interface SteuerEinstellungen {
  /** % vom Gewinn (Default 15) */
  kstSatz: number;
  /** % der KSt (Default 5,5) */
  soliSatz: number;
  /** Gewerbesteuer-Messzahl % (Default 3,5) */
  gewstMesszahl: number;
  /** Hebesatz Sankt Augustin in % (Default 525) */
  gewstHebesatz: number;
  /** USt-Voranmeldung-Rhythmus */
  ustRhythmus: UstRhythmus;
  /** Empfohlene Liquiditätsrücklage in % vom Gewinn (Default 35) */
  ruecklageSatz: number;
}

export const STEUER_DEFAULTS: SteuerEinstellungen = {
  kstSatz: 15,
  soliSatz: 5.5,
  gewstMesszahl: 3.5,
  gewstHebesatz: 525,
  ustRhythmus: "monatlich",
  ruecklageSatz: 35,
};

/** Ein konkreter Steuerposten — geplant, fällig oder bezahlt. */
export interface SteuerPosten {
  id: string;
  art: SteuerArt;
  titel: string;
  /** Zeitraum, auf den sich der Posten bezieht. Bei USt monatlich/quartal, sonst Jahr. */
  zeitraum: { jahr: number; monat?: number; quartal?: 1 | 2 | 3 | 4 };
  /** ISO-Date YYYY-MM-DD */
  faelligAm: string;
  /** Geschätzter Betrag in EUR. */
  geschaetzterBetrag: number;
  /** Tatsächlich gezahlter Betrag, falls bekannt. */
  tatsaechlicherBetrag?: number;
  status: SteuerStatus;
  /** ISO-Date wenn als bezahlt markiert. */
  bezahltAm?: string;
  /** Welche Rechnungen/Dokumente flossen in die Berechnung ein? Für Detail-Transparenz. */
  berechnungsgrundlage?: {
    rechnungIds: string[];
    dokumentIds: string[];
    nettoEinnahmen?: number;
    nettoAusgaben?: number;
    ust?: number;
    vorsteuer?: number;
  };
  /** True bei automatisch berechneten Posten (USt/KSt/Soli/GewSt), false bei manuellen. */
  automatisch: boolean;
  notiz?: string;
  erstelltAm: string;
}
