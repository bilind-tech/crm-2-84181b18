// Regel-Engine für Mahnwesen — reine Funktionen, kein gespeicherter Zustand.
// HINWEIS (Step 14): Diese Datei dient nur noch als Anzeige-Helper / Live-Vorschau.
// Kanonische Werte für Empfehlungen, Versand-Vorschläge und Lauf-Statistik
// liefert das Backend (`/mahnung/status`, `/mahnung/laeufe`).

import type {
  MahnEinstellungen,
  MahnStufe,
  MahnStufeConfig,
  Rechnung,
} from "@/lib/api/types";
import { summenRechnung } from "@/lib/belege/summen";

export interface MahnZustand {
  /** True wenn Rechnung überhaupt mahnfähig (offen, nicht storniert/bezahlt). */
  istMahnfaehig: boolean;
  /** Tage seit Fälligkeitsdatum (negativ = noch nicht fällig). */
  tageUeberfaellig: number;
  /** Höchste bereits versendete Stufe (0 = noch keine). */
  letzteVersendeteStufe: 0 | MahnStufe;
  /** Empfohlene nächste Stufe — null wenn keine fällig oder Stufe 3 schon raus. */
  empfohleneStufe: MahnStufe | null;
  /** True wenn Stufe 3 raus → Inkasso-Übergabe steht an. */
  istInkassoReif: boolean;
  /** True wenn pausiert (mahnPausiertBis in Zukunft). */
  istPausiert: boolean;
  pausiertBis?: string;
  /** Offener Betrag (Brutto - bezahlt). */
  offenEUR: number;
  /** Falls eine Stufe versendet wurde: deren Frist. */
  letzteFrist?: string;
}

function tageDifferenz(a: string, b: string): number {
  const dA = new Date(a + "T00:00:00").getTime();
  const dB = new Date(b + "T00:00:00").getTime();
  return Math.round((dA - dB) / 86_400_000);
}

function heuteISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function bestimmeMahnZustand(
  rechnung: Rechnung,
  einstellungen: MahnEinstellungen,
  heute: string = heuteISO(),
): MahnZustand {
  const s = summenRechnung(rechnung.positionen, rechnung.rabattGesamt);
  const bezahlt = rechnung.zahlungen.reduce((acc, z) => acc + z.betrag, 0);
  const offen = Math.max(0, s.brutto - bezahlt);
  const tageUeberfaellig = tageDifferenz(heute, rechnung.faelligkeitsdatum);

  const istMahnfaehig =
    rechnung.status !== "entwurf" &&
    rechnung.status !== "storniert" &&
    rechnung.status !== "bezahlt" &&
    offen > 0.005;

  const mahnungen = (rechnung.mahnungen ?? []).slice().sort((a, b) => a.stufe - b.stufe);
  const letzte = mahnungen[mahnungen.length - 1];
  const letzteVersendeteStufe = (letzte?.stufe ?? 0) as 0 | MahnStufe;

  const istInkassoReif = letzteVersendeteStufe === 3;
  const istPausiert = !!(rechnung.mahnPausiertBis && rechnung.mahnPausiertBis > heute);

  let empfohleneStufe: MahnStufe | null = null;

  if (istMahnfaehig && !istInkassoReif && !istPausiert && einstellungen.autoVorschlagAktiv) {
    const naechsteStufe = (letzteVersendeteStufe + 1) as MahnStufe;
    const config = einstellungen.stufen.find((c) => c.stufe === naechsteStufe);
    if (config) {
      // Stufe 1: Tage nach Fälligkeit. Stufe 2/3: Tage nach letzter Frist.
      const referenzDatum = letzte?.neueFrist ?? rechnung.faelligkeitsdatum;
      const tageSeitReferenz = tageDifferenz(heute, referenzDatum);
      // Bei Stufe 1 wird tageNachVorgaenger an Fälligkeit gemessen — nicht an Frist.
      // Bei Stufe 2/3 wird gemessen, wie lang die letzte Frist überzogen ist.
      const schwelle =
        naechsteStufe === 1 ? config.tageNachVorgaenger : config.tageNachVorgaenger;
      // Hinweis: bei Stufe 2/3 ist tageSeitReferenz "Tage seit letzter Frist"
      // — da setzen wir die tageNachVorgaenger als Karenz nach Fristablauf.
      // Für Stufe 1: tageSeitReferenz ist bereits "Tage seit Fälligkeit".
      if (tageSeitReferenz >= (naechsteStufe === 1 ? schwelle : 0)) {
        // Zusätzlich: bei Stufe 2/3 muss die Frist erst ablaufen + tageNachVorgaenger danach
        if (naechsteStufe === 1) {
          empfohleneStufe = 1;
        } else {
          // tageSeitReferenz = Tage seit Frist letzter Mahnung
          if (tageSeitReferenz >= config.tageNachVorgaenger) {
            empfohleneStufe = naechsteStufe;
          }
        }
      }
    }
  }

  return {
    istMahnfaehig,
    tageUeberfaellig,
    letzteVersendeteStufe,
    empfohleneStufe,
    istInkassoReif,
    istPausiert,
    pausiertBis: rechnung.mahnPausiertBis,
    offenEUR: offen,
    letzteFrist: letzte?.neueFrist,
  };
}

/** Berechnet die "neue Frist" beim Versand einer Stufe — heute + fristTage. */
export function berechneNeueFrist(stufe: MahnStufeConfig, heute: string = heuteISO()): string {
  const d = new Date(heute + "T00:00:00");
  d.setDate(d.getDate() + stufe.fristTage);
  return d.toISOString().slice(0, 10);
}

/** Mappt Stufen-Index auf Bezeichnung (Fallback wenn keine Config). */
export function stufenLabel(stufe: MahnStufe, einstellungen?: MahnEinstellungen): string {
  const c = einstellungen?.stufen.find((x) => x.stufe === stufe);
  if (c) return c.bezeichnung;
  return stufe === 1 ? "Zahlungserinnerung" : stufe === 2 ? "1. Mahnung" : "Letzte Mahnung";
}

/** Sortier-Score für Cockpit: höher = dringender. */
export function dringlichkeitScore(zustand: MahnZustand): number {
  if (zustand.istInkassoReif) return 1_000_000 + zustand.offenEUR;
  if (!zustand.istMahnfaehig) return -1;
  return zustand.tageUeberfaellig * 1000 + Math.min(zustand.offenEUR, 99_999);
}
