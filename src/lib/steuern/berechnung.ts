// Berechnungs-Engine für das Steuer-Modul.
// Reines Frontend — bezieht Daten aus React-Query (Rechnungen, Dokumente).

import type { Rechnung, Dokument } from "@/lib/api/types";
import { summenRechnung } from "@/lib/belege/summen";
import type {
  SteuerEinstellungen,
  SteuerPosten,
  UstRhythmus,
} from "./types";

// ---------- Helpers ----------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function bezahltAm(r: Rechnung): string | null {
  if (!r.zahlungen?.length) return null;
  const sorted = [...r.zahlungen].sort((a, b) => a.datum.localeCompare(b.datum));
  return sorted[sorted.length - 1].datum;
}

function istVollBezahlt(r: Rechnung): boolean {
  if (r.status === "storniert" || r.status === "entwurf") return false;
  const { brutto } = summenRechnung(r.positionen, r.rabattGesamt);
  const summe = (r.zahlungen ?? []).reduce((s, z) => s + z.betrag, 0);
  return summe >= brutto - 0.005;
}

function periode(date: string, rhythmus: UstRhythmus): { jahr: number; monat?: number; quartal?: 1 | 2 | 3 | 4 } {
  const d = new Date(date);
  const jahr = d.getFullYear();
  const monat = d.getMonth() + 1;
  if (rhythmus === "monatlich") return { jahr, monat };
  if (rhythmus === "quartalsweise") {
    const quartal = Math.ceil(monat / 3) as 1 | 2 | 3 | 4;
    return { jahr, quartal };
  }
  return { jahr };
}

/** Fälligkeit = 10. des Folgemonats. `endMonat` ist 1-basiert (1=Jan). */
function ustFaelligAm(p: { jahr: number; monat?: number; quartal?: 1 | 2 | 3 | 4 }): string {
  let endMonat: number;
  if (p.monat) endMonat = p.monat;
  else if (p.quartal) endMonat = p.quartal * 3;
  else endMonat = 12;
  // new Date(jahr, endMonat, 10) = 10. des Folgemonats (monthIndex 0-basiert).
  // Bei endMonat=12 → 10.01. des Folgejahres ✓.
  return isoDate(new Date(p.jahr, endMonat, 10));
}

function periodeKey(p: { jahr: number; monat?: number; quartal?: 1 | 2 | 3 | 4 }): string {
  if (p.monat) return `${p.jahr}-M${String(p.monat).padStart(2, "0")}`;
  if (p.quartal) return `${p.jahr}-Q${p.quartal}`;
  return `${p.jahr}`;
}

function periodeLabel(p: { jahr: number; monat?: number; quartal?: 1 | 2 | 3 | 4 }): string {
  const monate = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  if (p.monat) return `${monate[p.monat - 1]} ${p.jahr}`;
  if (p.quartal) return `Q${p.quartal} ${p.jahr}`;
  return String(p.jahr);
}

// ---------- USt: aus bezahlten Rechnungen + Dokumenten ableiten ----------

interface UstAggregat {
  zeitraum: { jahr: number; monat?: number; quartal?: 1 | 2 | 3 | 4 };
  ust: number;
  vorsteuer: number;
  rechnungIds: string[];
  dokumentIds: string[];
}

export function aggregiereUst(
  rechnungen: Rechnung[],
  dokumente: Dokument[],
  rhythmus: UstRhythmus,
): UstAggregat[] {
  const map = new Map<string, UstAggregat>();

  for (const r of rechnungen) {
    if (!istVollBezahlt(r)) continue;
    const datum = bezahltAm(r);
    if (!datum) continue;
    const p = periode(datum, rhythmus);
    const key = periodeKey(p);
    const sums = summenRechnung(r.positionen, r.rabattGesamt);
    const agg = map.get(key) ?? { zeitraum: p, ust: 0, vorsteuer: 0, rechnungIds: [], dokumentIds: [] };
    agg.ust += sums.steuer;
    agg.rechnungIds.push(r.id);
    map.set(key, agg);
  }

  for (const d of dokumente) {
    if (!d.steuerrelevant || !d.betrag || !d.dokumentdatum) continue;
    const p = periode(d.dokumentdatum, rhythmus);
    const key = periodeKey(p);
    // Vorsteuer = brutto / (1 + satz) * satz, Default 19 %
    const satz = (d.ustSatz ?? 19) / 100;
    const vorsteuer = (d.betrag / (1 + satz)) * satz;
    const agg = map.get(key) ?? { zeitraum: p, ust: 0, vorsteuer: 0, rechnungIds: [], dokumentIds: [] };
    agg.vorsteuer += vorsteuer;
    agg.dokumentIds.push(d.id);
    map.set(key, agg);
  }

  return Array.from(map.values()).sort((a, b) => periodeKey(a.zeitraum).localeCompare(periodeKey(b.zeitraum)));
}

// ---------- Gewinn-Aggregation YTD ----------

export interface GewinnAggregat {
  jahr: number;
  nettoEinnahmen: number;
  nettoAusgaben: number;
  gewinn: number;
  rechnungIds: string[];
  dokumentIds: string[];
}

export function gewinnYtd(
  rechnungen: Rechnung[],
  dokumente: Dokument[],
  jahr: number,
): GewinnAggregat {
  let nettoEinnahmen = 0;
  let nettoAusgaben = 0;
  const rechnungIds: string[] = [];
  const dokumentIds: string[] = [];

  for (const r of rechnungen) {
    if (!istVollBezahlt(r)) continue;
    const datum = bezahltAm(r);
    if (!datum) continue;
    if (new Date(datum).getFullYear() !== jahr) continue;
    const sums = summenRechnung(r.positionen, r.rabattGesamt);
    nettoEinnahmen += sums.netto;
    rechnungIds.push(r.id);
  }

  for (const d of dokumente) {
    if (!d.steuerrelevant || !d.betrag || !d.dokumentdatum) continue;
    if (new Date(d.dokumentdatum).getFullYear() !== jahr) continue;
    const satz = (d.ustSatz ?? 19) / 100;
    nettoAusgaben += d.betrag / (1 + satz);
    dokumentIds.push(d.id);
  }

  return {
    jahr,
    nettoEinnahmen,
    nettoAusgaben,
    gewinn: nettoEinnahmen - nettoAusgaben,
    rechnungIds,
    dokumentIds,
  };
}

// ---------- Generierung: Steuerposten aus Aggregaten ----------

export function generiereAutomatischePosten(
  rechnungen: Rechnung[],
  dokumente: Dokument[],
  einstellungen: SteuerEinstellungen,
  jahr: number,
): SteuerPosten[] {
  const posten: SteuerPosten[] = [];
  const now = new Date().toISOString();
  const heute = new Date();

  // --- USt-Voranmeldungen (auch reine Vorsteuer-Perioden = Erstattung) ---
  // Auf die berechnete Zahllast wird ein Puffer für noch nicht erfasste
  // Vorsteuer-Belege angewendet (Default 10 %). Reduziert die Schuld realistisch.
  const pufferFaktor = Math.max(0, 1 - (einstellungen.ustPufferSatz ?? 0) / 100);
  const ust = aggregiereUst(rechnungen, dokumente, einstellungen.ustRhythmus);
  for (const u of ust) {
    if (u.zeitraum.jahr !== jahr) continue;
    const rohZahllast = u.ust - u.vorsteuer;
    // Puffer nur auf positive Zahllast anwenden, nicht auf Erstattungen
    const zahllast = rohZahllast > 0 ? rohZahllast * pufferFaktor : rohZahllast;
    const faellig = ustFaelligAm(u.zeitraum);
    const istVergangen = new Date(faellig) < heute;
    const istErstattung = zahllast < -0.005;

    posten.push({
      id: `auto-ust-${periodeKey(u.zeitraum)}`,
      art: "ust",
      titel: istErstattung
        ? `USt-Erstattung ${periodeLabel(u.zeitraum)}`
        : `USt-Voranmeldung ${periodeLabel(u.zeitraum)}`,
      zeitraum: u.zeitraum,
      faelligAm: faellig,
      geschaetzterBetrag: Math.abs(zahllast),
      status: istErstattung
        ? "offen" // Erstattungen bleiben „offen" bis vom FA gezahlt
        : Math.abs(zahllast) <= 0.005
        ? "bezahlt"
        : istVergangen
        ? "ueberfaellig"
        : "offen",
      automatisch: true,
      berechnungsgrundlage: {
        rechnungIds: u.rechnungIds,
        dokumentIds: u.dokumentIds,
        ust: u.ust,
        vorsteuer: u.vorsteuer,
      },
      notiz: istErstattung
        ? `Vorsteuer-Überhang — Erstattung vom Finanzamt erwartet.`
        : einstellungen.ustPufferSatz > 0
        ? `Inkl. ${einstellungen.ustPufferSatz} % Vorsteuer-Puffer für noch nicht erfasste Belege.`
        : undefined,
      erstelltAm: now,
    });
  }

  // --- Ertragsteuern KSt + Soli + GewSt: EIN Rücklage-Posten je Steuerart ---
  // Berechnet nur auf den TATSÄCHLICH realisierten YTD-Gewinn (keine Hochrechnung).
  // So kann die Rücklage NIEMALS höher werden als die anteilige Steuer auf den
  // bisher erwirtschafteten Gewinn. Fällig zur nächsten regulären Frist.
  const g = gewinnYtd(rechnungen, dokumente, jahr);

  if (g.gewinn > 0) {
    const kstYtd = g.gewinn * (einstellungen.kstSatz / 100);
    const soliYtd = kstYtd * (einstellungen.soliSatz / 100);
    const gewstYtd =
      g.gewinn * (einstellungen.gewstMesszahl / 100) * (einstellungen.gewstHebesatz / 100);

    // Nächster KSt/Soli-Quartalstermin (10.03/06/09/12)
    const kstMonate = [3, 6, 9, 12];
    const naechsterKst =
      kstMonate.find((m) => new Date(jahr, m - 1, 10) >= heute) ?? kstMonate[0];
    const kstFaellig = `${jahr}-${String(naechsterKst).padStart(2, "0")}-10`;

    // Nächster GewSt-Quartalstermin (15.02/05/08/11)
    const gewstMonate = [2, 5, 8, 11];
    const naechsterGewst =
      gewstMonate.find((m) => new Date(jahr, m - 1, 15) >= heute) ?? gewstMonate[0];
    const gewstFaellig = `${jahr}-${String(naechsterGewst).padStart(2, "0")}-15`;

    const grundlage = {
      rechnungIds: g.rechnungIds,
      dokumentIds: g.dokumentIds,
      nettoEinnahmen: g.nettoEinnahmen,
      nettoAusgaben: g.nettoAusgaben,
    };

    posten.push({
      id: `auto-kst-${jahr}`,
      art: "kst",
      titel: `Körperschaftsteuer ${jahr} (Rücklage)`,
      zeitraum: { jahr },
      faelligAm: kstFaellig,
      geschaetzterBetrag: kstYtd,
      status: "offen",
      automatisch: true,
      berechnungsgrundlage: grundlage,
      notiz: `${einstellungen.kstSatz} % auf bisher realisierten Gewinn (${formatBetrag(g.gewinn)}). Wächst mit jeder bezahlten Rechnung.`,
      erstelltAm: now,
    });

    posten.push({
      id: `auto-soli-${jahr}`,
      art: "soli",
      titel: `Solidaritätszuschlag ${jahr} (Rücklage)`,
      zeitraum: { jahr },
      faelligAm: kstFaellig,
      geschaetzterBetrag: soliYtd,
      status: "offen",
      automatisch: true,
      berechnungsgrundlage: grundlage,
      notiz: `${einstellungen.soliSatz} % auf die KSt-Rücklage.`,
      erstelltAm: now,
    });

    posten.push({
      id: `auto-gewst-${jahr}`,
      art: "gewst",
      titel: `Gewerbesteuer ${jahr} (Rücklage)`,
      zeitraum: { jahr },
      faelligAm: gewstFaellig,
      geschaetzterBetrag: gewstYtd,
      status: "offen",
      automatisch: true,
      berechnungsgrundlage: grundlage,
      notiz: `Hebesatz ${einstellungen.gewstHebesatz} % × Messzahl ${einstellungen.gewstMesszahl} % auf bisher realisierten Gewinn.`,
      erstelltAm: now,
    });
  }

  return posten;
}

function formatBetrag(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

// ---------- Aggregierte Kennzahlen ----------

export interface SteuerKennzahlen {
  naechsteFaelligkeit: SteuerPosten | null;
  offenSumme: number;
  bezahltJahrSumme: number;
  empfohleneRuecklage: number;
  gewinnYtd: number;
  projizierteJahressteuer: number;
}

export function berechneKennzahlen(
  posten: SteuerPosten[],
  rechnungen: Rechnung[],
  dokumente: Dokument[],
  einstellungen: SteuerEinstellungen,
  jahr: number,
): SteuerKennzahlen {
  const offene = posten
    .filter((p) => p.status !== "bezahlt")
    .sort((a, b) => a.faelligAm.localeCompare(b.faelligAm));

  const offenSumme = offene.reduce((s, p) => s + p.geschaetzterBetrag, 0);
  const bezahltJahrSumme = posten
    .filter((p) => p.status === "bezahlt" && p.bezahltAm && new Date(p.bezahltAm).getFullYear() === jahr)
    .reduce((s, p) => s + (p.tatsaechlicherBetrag ?? p.geschaetzterBetrag), 0);

  const g = gewinnYtd(rechnungen, dokumente, jahr);
  const empfohleneRuecklage = Math.max(0, g.gewinn * (einstellungen.ruecklageSatz / 100));

  const kstAnteil = einstellungen.kstSatz / 100;
  const soliAnteil = kstAnteil * (einstellungen.soliSatz / 100);
  const gewstAnteil = (einstellungen.gewstMesszahl / 100) * (einstellungen.gewstHebesatz / 100);
  const effektivSatz = kstAnteil + soliAnteil + gewstAnteil;
  const projizierteJahressteuer = Math.max(0, g.gewinn * effektivSatz);

  return {
    naechsteFaelligkeit: offene[0] ?? null,
    offenSumme,
    bezahltJahrSumme,
    empfohleneRuecklage,
    gewinnYtd: g.gewinn,
    projizierteJahressteuer,
  };
}

export const STEUER_ART_LABEL: Record<string, string> = {
  ust: "Umsatzsteuer",
  kst: "Körperschaftsteuer",
  soli: "Solidaritätszuschlag",
  gewst: "Gewerbesteuer",
  manuell: "Manuell",
};

export { periodeLabel, periodeKey };
