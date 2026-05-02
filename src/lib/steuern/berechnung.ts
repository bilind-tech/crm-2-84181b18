// Berechnungs-Engine für das Steuer-Modul.
// Reines Frontend — bezieht Daten aus React-Query (Rechnungen, Dokumente).

import type { Rechnung, Dokument } from "@/lib/api/types";
import { summenRechnung } from "@/lib/mock/backend";
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
  const ust = aggregiereUst(rechnungen, dokumente, einstellungen.ustRhythmus);
  for (const u of ust) {
    if (u.zeitraum.jahr !== jahr) continue;
    const zahllast = u.ust - u.vorsteuer;
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
        : zahllast <= 0.005
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
        : undefined,
      erstelltAm: now,
    });
  }

  // --- Jahressteuern KSt + Soli + GewSt: 4 Quartals-Vorauszahlungen ---
  const g = gewinnYtd(rechnungen, dokumente, jahr);

  // Jahres-Hochrechnung: YTD linear auf 365 Tage hochrechnen
  const jahresStart = new Date(jahr, 0, 1);
  const heuteOderJahresende = heute.getFullYear() === jahr ? heute : new Date(jahr, 11, 31);
  const tageVergangen = Math.max(
    1,
    Math.floor((heuteOderJahresende.getTime() - jahresStart.getTime()) / 86_400_000) + 1,
  );
  const tageImJahr = ((jahr % 4 === 0 && jahr % 100 !== 0) || jahr % 400 === 0) ? 366 : 365;
  const hochrechnungsFaktor = Math.min(4, tageImJahr / tageVergangen); // cap bei ×4 (Q1)
  const prognoseGewinn = Math.max(0, g.gewinn * hochrechnungsFaktor);

  if (prognoseGewinn > 0) {
    const kstJahr = prognoseGewinn * (einstellungen.kstSatz / 100);
    const soliJahr = kstJahr * (einstellungen.soliSatz / 100);
    const gewstJahr =
      prognoseGewinn * (einstellungen.gewstMesszahl / 100) * (einstellungen.gewstHebesatz / 100);

    // Quartals-Termine: KSt+Soli am 10.03/06/09/12, GewSt am 15.02/05/08/11
    const kstTermine: Array<[1 | 2 | 3 | 4, string]> = [
      [1, "03-10"], [2, "06-10"], [3, "09-10"], [4, "12-10"],
    ];
    const gewstTermine: Array<[1 | 2 | 3 | 4, string]> = [
      [1, "02-15"], [2, "05-15"], [3, "08-15"], [4, "11-15"],
    ];

    const hochrechnungsNotiz =
      hochrechnungsFaktor > 1.05
        ? ` (Hochrechnung aus YTD × ${hochrechnungsFaktor.toFixed(2)})`
        : "";

    for (const [q, md] of kstTermine) {
      const faellig = `${jahr}-${md}`;
      const istVergangen = new Date(faellig) < heute;
      posten.push({
        id: `auto-kst-${jahr}-Q${q}`,
        art: "kst",
        titel: `Körperschaftsteuer Q${q} ${jahr}`,
        zeitraum: { jahr, quartal: q },
        faelligAm: faellig,
        geschaetzterBetrag: kstJahr / 4,
        status: istVergangen ? "ueberfaellig" : "offen",
        automatisch: true,
        berechnungsgrundlage: {
          rechnungIds: g.rechnungIds,
          dokumentIds: g.dokumentIds,
          nettoEinnahmen: g.nettoEinnahmen,
          nettoAusgaben: g.nettoAusgaben,
        },
        notiz: `Jahres-KSt geschätzt ${kstJahr.toFixed(2)} €${hochrechnungsNotiz} — 1/4 fällig.`,
        erstelltAm: now,
      });
      posten.push({
        id: `auto-soli-${jahr}-Q${q}`,
        art: "soli",
        titel: `Solidaritätszuschlag Q${q} ${jahr}`,
        zeitraum: { jahr, quartal: q },
        faelligAm: faellig,
        geschaetzterBetrag: soliJahr / 4,
        status: istVergangen ? "ueberfaellig" : "offen",
        automatisch: true,
        berechnungsgrundlage: {
          rechnungIds: g.rechnungIds,
          dokumentIds: g.dokumentIds,
        },
        notiz: `${einstellungen.soliSatz}% der KSt — 1/4 fällig.`,
        erstelltAm: now,
      });
    }

    for (const [q, md] of gewstTermine) {
      const faellig = `${jahr}-${md}`;
      const istVergangen = new Date(faellig) < heute;
      posten.push({
        id: `auto-gewst-${jahr}-Q${q}`,
        art: "gewst",
        titel: `Gewerbesteuer Q${q} ${jahr}`,
        zeitraum: { jahr, quartal: q },
        faelligAm: faellig,
        geschaetzterBetrag: gewstJahr / 4,
        status: istVergangen ? "ueberfaellig" : "offen",
        automatisch: true,
        berechnungsgrundlage: {
          rechnungIds: g.rechnungIds,
          dokumentIds: g.dokumentIds,
          nettoEinnahmen: g.nettoEinnahmen,
          nettoAusgaben: g.nettoAusgaben,
        },
        notiz: `Hebesatz Sankt Augustin ${einstellungen.gewstHebesatz}% — Jahres-GewSt geschätzt ${gewstJahr.toFixed(2)} €${hochrechnungsNotiz}.`,
        erstelltAm: now,
      });
    }
  }

  return posten;
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
