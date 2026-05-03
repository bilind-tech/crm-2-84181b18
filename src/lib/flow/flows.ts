// Lebenszyklus-Definitionen für Angebote und Rechnungen.
// Liefert für die FlowBar-Komponente die Schritte + den aktuellen Index.

import type { Angebot, Rechnung } from "@/lib/api/types";
import { summenRechnung } from "@/lib/belege/summen";
import { formatDate, formatEUR } from "@/lib/format";

export type FlowTone = "neutral" | "active" | "success" | "danger" | "muted";

export interface FlowStep {
  key: string;
  label: string;
  hint?: string;
  date?: string;
  tone: FlowTone;
  /** true wenn dieser Schritt erreicht oder abgeschlossen wurde */
  reached: boolean;
  /** true wenn das der aktuell aktive Schritt ist */
  current: boolean;
}

export interface FlowResult {
  steps: FlowStep[];
}

// ---------- Angebot ----------

export function angebotFlow(a: Angebot, hatRechnung = false): FlowResult {
  const status = a.status;
  // Nur „echt versendet": versendetAm wird ausschließlich beim realen Sende-Vorgang gesetzt.
  const versendet = !!a.versendetAm;
  const angenommen = status === "angenommen";
  const abgelehnt = status === "abgelehnt";
  const abgelaufen = status === "abgelaufen";

  // Schritt 1: Entwurf
  const s1: FlowStep = {
    key: "entwurf",
    label: "Entwurf",
    date: formatDate(a.erstelltAm),
    tone: "success",
    reached: true,
    current: status === "entwurf",
  };

  // Schritt 2: Versendet
  const s2: FlowStep = {
    key: "versendet",
    label: "Versendet",
    date: a.versendetAm ? formatDate(a.versendetAm) : undefined,
    tone: versendet ? "success" : "muted",
    reached: versendet,
    current: status === "versendet",
  };

  // Schritt 3: Antwort des Kunden
  let s3Label = "Antwort";
  let s3Hint: string | undefined = "Wartet auf Antwort";
  let s3Tone: FlowTone = "muted";
  let s3Reached = false;
  let s3Current = false;
  if (angenommen) {
    s3Label = "Angenommen";
    s3Hint = undefined;
    s3Tone = "success";
    s3Reached = true;
    s3Current = !hatRechnung;
  } else if (abgelehnt) {
    s3Label = "Abgelehnt";
    s3Hint = undefined;
    s3Tone = "danger";
    s3Reached = true;
    s3Current = true;
  } else if (abgelaufen) {
    s3Label = "Abgelaufen";
    s3Hint = a.gueltigBis ? `Gültig war bis ${formatDate(a.gueltigBis)}` : undefined;
    s3Tone = "muted";
    s3Reached = true;
    s3Current = true;
  } else if (versendet) {
    s3Current = true;
    s3Tone = "active";
  }
  const s3: FlowStep = {
    key: "antwort",
    label: s3Label,
    hint: s3Hint,
    tone: s3Tone,
    reached: s3Reached,
    current: s3Current,
  };

  // Schritt 4: In Rechnung umgewandelt
  const s4: FlowStep = {
    key: "rechnung",
    label: "In Rechnung",
    tone: hatRechnung ? "success" : abgelehnt || abgelaufen ? "muted" : angenommen ? "active" : "muted",
    reached: hatRechnung,
    current: angenommen && !hatRechnung,
  };

  return { steps: [s1, s2, s3, s4] };
}

// ---------- Rechnung ----------

export function rechnungFlow(r: Rechnung): FlowResult {
  const status = r.status;
  const s = summenRechnung(r.positionen, r.rabattGesamt);
  const bezahlt = r.zahlungen.reduce((a, z) => a + z.betrag, 0);
  const offen = Math.max(0, s.brutto - bezahlt);

  // Nur „echt versendet": versendetAm wird ausschließlich beim realen Sende-Vorgang gesetzt.
  const istVersendet = !!r.versendetAm;
  const istUeberfaellig = status === "ueberfaellig";
  const istBezahlt = status === "bezahlt" || (offen <= 0.001 && bezahlt > 0);
  const istTeilbezahlt = bezahlt > 0 && !istBezahlt;
  const istStorniert = status === "storniert";

  const s1: FlowStep = {
    key: "entwurf",
    label: "Entwurf",
    date: formatDate(r.erstelltAm),
    tone: "success",
    reached: true,
    current: status === "entwurf",
  };

  const s2: FlowStep = {
    key: "versendet",
    label: "Versendet",
    date: r.versendetAm ? formatDate(r.versendetAm) : undefined,
    hint: istUeberfaellig ? `Überfällig seit ${formatDate(r.faelligkeitsdatum)}` : undefined,
    tone: istUeberfaellig ? "danger" : istVersendet ? "success" : "muted",
    reached: istVersendet,
    current: status === "versendet" && !istTeilbezahlt,
  };

  const s3: FlowStep = {
    key: "bezahlt",
    label: istStorniert ? "Storniert" : "Bezahlt",
    date: istBezahlt && r.zahlungen.length > 0
      ? formatDate(r.zahlungen[r.zahlungen.length - 1].datum)
      : undefined,
    hint: istTeilbezahlt
      ? `${formatEUR(bezahlt)} von ${formatEUR(s.brutto)} · noch ${formatEUR(offen)} offen`
      : undefined,
    tone: istStorniert ? "muted" : istBezahlt ? "success" : istTeilbezahlt ? "active" : "muted",
    reached: istBezahlt || istTeilbezahlt,
    current: istBezahlt || istTeilbezahlt,
  };

  return { steps: [s1, s2, s3] };
}
