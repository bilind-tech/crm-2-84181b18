// API-Shapes (camelCase) für das Steuer-Modul. Spiegelt src/lib/steuern/types.ts
// im Frontend, ohne SteuerPosten (der gehört zur Frontend-Berechnung).

export type UstRhythmus = "monatlich" | "quartalsweise" | "jaehrlich";
export type SteuerArt = "ust" | "kst" | "soli" | "gewst" | "manuell";

export interface SteuerEinstellungen {
  kstSatz: number;
  soliSatz: number;
  gewstMesszahl: number;
  gewstHebesatz: number;
  ustRhythmus: UstRhythmus;
  ruecklageSatz: number;
  ustPufferSatz: number;
  updatedAt: string;
}

export const STEUER_DEFAULTS: Omit<SteuerEinstellungen, "updatedAt"> = {
  kstSatz: 15,
  soliSatz: 5.5,
  gewstMesszahl: 3.5,
  gewstHebesatz: 525,
  ustRhythmus: "monatlich",
  ruecklageSatz: 35,
  ustPufferSatz: 10,
};

export interface ManuellerPostenInput {
  art: SteuerArt;
  titel: string;
  zeitraum: { jahr: number; monat?: number | null; quartal?: number | null };
  faelligAm: string;
  geschaetzterBetrag: number;
  notiz?: string | null;
}

export interface ManuellerPosten extends ManuellerPostenInput {
  id: string;
  erstelltAm: string;
}

export interface BezahltMarkierung {
  postenId: string;
  bezahltAm: string;
  tatsaechlicherBetrag?: number | null;
  notiz?: string | null;
  erstelltAm: string;
}

export interface BezahltMarkierungInput {
  bezahltAm: string;
  tatsaechlicherBetrag?: number | null;
  notiz?: string | null;
}
