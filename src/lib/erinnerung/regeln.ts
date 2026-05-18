// Reine Frontend-Logik: ermittelt, welche Rechnungen erinnerungsreif sind.
// Eine Rechnung ist erinnerungsreif, wenn:
//   - Status nicht bezahlt, storniert oder entwurf
//   - offener Restbetrag > 0
//   - heute >= faelligkeitsdatum + tageNachFaelligkeit
//   - letzte gesendete E-Mail (Kontext rechnung) >= 7 Tage her ODER keine
//
// Versand bleibt manuell (Memory-Regel — niemals Auto-Mails). Diese Logik
// erzeugt nur Vorschläge.

import type { EmailVersand, Kunde, Rechnung } from "@/lib/api/types";

export const DEFAULT_TAGE_NACH_FAELLIGKEIT = 14;
/** Mindestabstand zwischen zwei Erinnerungs-Vorschlägen für dieselbe Rechnung. */
export const ERINNERUNG_COOLDOWN_TAGE = 7;

export interface ErinnerungsKandidat {
  id: string;
  nummer: string;
  titel: string;
  kundeId: string;
  kundeName: string;
  tageUeber: number;
  offen: number;
  brutto: number;
  faelligkeitsdatum: string;
  letzteErinnerungAm?: string | null;
}

function bruttoSumme(r: Rechnung): number {
  return (
    r.positionen.reduce(
      (a, p) => a + p.menge * p.einzelpreisNetto * (1 - (p.rabatt || 0) / 100),
      0,
    ) *
    (1 + r.steuersatz / 100)
  );
}

function kundeName(k?: Kunde): string {
  if (!k) return "Unbekannt";
  return (
    k.firmenname ||
    [k.vorname, k.nachname].filter(Boolean).join(" ") ||
    k.nummer ||
    "Unbekannt"
  );
}

export interface ErinnerungsOptionen {
  tageNachFaelligkeit?: number;
  cooldownTage?: number;
  heute?: string; // ISO yyyy-mm-dd
}

export function berechneErinnerungsKandidaten(
  rechnungen: Rechnung[],
  kunden: Kunde[],
  versand: EmailVersand[],
  opts: ErinnerungsOptionen = {},
): ErinnerungsKandidat[] {
  const tageNach = Math.max(
    1,
    Math.floor(opts.tageNachFaelligkeit ?? DEFAULT_TAGE_NACH_FAELLIGKEIT),
  );
  const cooldown = Math.max(0, Math.floor(opts.cooldownTage ?? ERINNERUNG_COOLDOWN_TAGE));
  const heute = opts.heute ?? new Date().toISOString().slice(0, 10);
  const heuteMs = Date.parse(heute);
  const kundeMap = new Map(kunden.map((k) => [k.id, k]));

  // Pro Rechnungs-ID die letzte versendete Mail bestimmen (für Cooldown-Berechnung).
  const letzteMailMap = new Map<string, string>();
  for (const v of versand) {
    if (v.belegArt !== "rechnung" || !v.belegId) continue;
    if (v.status !== "gesendet") continue;
    const ts = v.versendetAm;
    if (!ts) continue;
    const cur = letzteMailMap.get(v.belegId);
    if (!cur || ts > cur) letzteMailMap.set(v.belegId, ts);
  }

  const out: ErinnerungsKandidat[] = [];
  for (const r of rechnungen) {
    if (r.status === "bezahlt" || r.status === "storniert" || r.status === "entwurf") continue;
    if (!r.faelligkeitsdatum) continue;

    const brutto = bruttoSumme(r);
    const bezahlt = r.zahlungen.reduce((a, z) => a + z.betrag, 0);
    const offen = brutto - bezahlt;
    if (offen <= 0.001) continue;

    const tageUeber = Math.floor(
      (heuteMs - Date.parse(r.faelligkeitsdatum)) / 86_400_000,
    );
    if (tageUeber < tageNach) continue;

    const letzte = letzteMailMap.get(r.id) ?? null;
    if (letzte) {
      const seitMail = Math.floor((heuteMs - Date.parse(letzte)) / 86_400_000);
      if (seitMail < cooldown) continue;
    }

    out.push({
      id: r.id,
      nummer: r.nummer,
      titel: r.titel,
      kundeId: r.kundeId,
      kundeName: kundeName(kundeMap.get(r.kundeId)),
      tageUeber,
      offen,
      brutto,
      faelligkeitsdatum: r.faelligkeitsdatum,
      letzteErinnerungAm: letzte,
    });
  }

  // Längste Überfälligkeit zuerst.
  out.sort((a, b) => b.tageUeber - a.tageUeber);
  return out;
}

/** Vereinheitlichte Map "rechnungId → kandidat", z. B. für Listen-Badges. */
export function indexKandidaten(
  liste: ErinnerungsKandidat[],
): Map<string, ErinnerungsKandidat> {
  return new Map(liste.map((k) => [k.id, k]));
}