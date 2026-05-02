// Berechnet priorisierte „Nächste Schritte" für das Dashboard.
// Liefert Angebot-/Rechnung-Aufgaben (Erstellen, Versenden, Nachfassen).
//
// Mahn-Vorschläge werden NICHT mehr hier berechnet — sie kommen aus dem
// Backend-Mahnlauf (`/mahnung/laeufe/:id`), siehe NaechsteSchritteCard.

import type { Angebot, Rechnung, Kunde } from "@/lib/api/types";

export type NaechsterSchrittTyp =
  | "rechnung_erstellen"
  | "rechnung_versenden"
  | "mahnung_senden"
  | "angebot_nachfassen";

export interface NaechsterSchritt {
  id: string;
  typ: NaechsterSchrittTyp;
  prioritaet: number; // höher = dringender
  kundeId?: string;
  kundeName: string;
  belegNummer: string;
  belegId: string;
  ueberschrift: string;
  detail: string;
  ctaLabel: string;
  /** Optional: Tage seit relevantem Ereignis (für Sortierung & Anzeige). */
  tage?: number;
}

function kundeName(k?: Kunde): string {
  if (!k) return "Unbekannter Kunde";
  if (k.firmenname) return k.firmenname;
  const n = [k.vorname, k.nachname].filter(Boolean).join(" ");
  return n || k.nummer || "Unbekannter Kunde";
}

function tageSeit(iso?: string): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

export function berechneNaechsteSchritte(
  angebote: Angebot[],
  rechnungen: Rechnung[],
  kunden: Kunde[],
): NaechsterSchritt[] {
  const kundeMap = new Map(kunden.map((k) => [k.id, k]));
  const heute = new Date().toISOString().slice(0, 10);
  const out: NaechsterSchritt[] = [];

  // 1. Angebot angenommen → Rechnung erstellen
  for (const a of angebote) {
    if (a.status !== "angenommen") continue;
    const hatRechnung = rechnungen.some((r) => r.quellAngebotId === a.id);
    if (hatRechnung) continue;
    const k = kundeMap.get(a.kundeId);
    out.push({
      id: `angebot-rechnen-${a.id}`,
      typ: "rechnung_erstellen",
      prioritaet: 90,
      kundeId: a.kundeId,
      kundeName: kundeName(k),
      belegNummer: a.nummer,
      belegId: a.id,
      ueberschrift: `Rechnung erstellen für ${kundeName(k)}`,
      detail: `Angebot ${a.nummer} wurde angenommen.`,
      ctaLabel: "Rechnung erstellen",
    });
  }

  // 2. Rechnung im Entwurf → versenden
  for (const r of rechnungen) {
    if (r.status !== "entwurf") continue;
    const k = kundeMap.get(r.kundeId);
    out.push({
      id: `rechnung-senden-${r.id}`,
      typ: "rechnung_versenden",
      prioritaet: 85,
      kundeId: r.kundeId,
      kundeName: kundeName(k),
      belegNummer: r.nummer,
      belegId: r.id,
      ueberschrift: `Rechnung an ${kundeName(k)} senden`,
      detail: `Entwurf ${r.nummer} ist bereit zum Versand.`,
      ctaLabel: "Per E-Mail senden",
    });
  }

  // 3. Rechnung überfällig → Mahnung
  for (const r of rechnungen) {
    if (r.status === "bezahlt" || r.status === "storniert" || r.status === "entwurf") continue;
    if (!(r.faelligkeitsdatum < heute)) continue;
    const k = kundeMap.get(r.kundeId);
    const tage = tageSeit(r.faelligkeitsdatum);
    out.push({
      id: `mahnung-${r.id}`,
      typ: "mahnung_senden",
      prioritaet: 95 + Math.min(tage, 30), // je länger fällig, desto wichtiger
      kundeId: r.kundeId,
      kundeName: kundeName(k),
      belegNummer: r.nummer,
      belegId: r.id,
      ueberschrift: `Mahnung an ${kundeName(k)}`,
      detail: `${r.nummer} ist seit ${tage} ${tage === 1 ? "Tag" : "Tagen"} überfällig.`,
      ctaLabel: "Mahnung öffnen",
      tage,
    });
  }

  // 4. Angebot versendet seit > 7 Tagen ohne Antwort → nachfassen
  for (const a of angebote) {
    if (a.status !== "versendet") continue;
    const tage = tageSeit(a.versendetAm ?? a.erstelltAm);
    if (tage < 7) continue;
    const k = kundeMap.get(a.kundeId);
    out.push({
      id: `nachfassen-${a.id}`,
      typ: "angebot_nachfassen",
      prioritaet: 50 + Math.min(tage, 20),
      kundeId: a.kundeId,
      kundeName: kundeName(k),
      belegNummer: a.nummer,
      belegId: a.id,
      ueberschrift: `Angebot bei ${kundeName(k)} nachfassen`,
      detail: `${a.nummer} wartet seit ${tage} Tagen auf Antwort.`,
      ctaLabel: "Nachfassen",
      tage,
    });
  }

  return out.sort((a, b) => b.prioritaet - a.prioritaet);
}
