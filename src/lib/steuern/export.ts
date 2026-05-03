// Steuerberater-Export: erzeugt CSV-Dateien (Einnahmen, Ausgaben, USt-Übersicht,
// Gewinn) und packt sie als ZIP. Reines Frontend — nutzt JSZip.

import JSZip from "jszip";
import type { Rechnung, Dokument, Kunde } from "@/lib/api/types";
import { summenRechnung } from "@/lib/belege/summen";
import { aggregiereUst, gewinnYtd } from "./berechnung";
import type { UstRhythmus } from "./types";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[";\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const head = headers.map(csvEscape).join(";");
  const body = rows
    .map((r) => headers.map((h) => csvEscape(r[h])).join(";"))
    .join("\n");
  return "\uFEFF" + head + "\n" + body + "\n"; // BOM für Excel
}

function bezahltDatum(r: Rechnung): string | null {
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

function kundeLabel(k: Kunde | undefined): string {
  if (!k) return "—";
  return k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim() || k.nummer;
}

export interface ExportInput {
  jahr: number;
  rhythmus: UstRhythmus;
  rechnungen: Rechnung[];
  dokumente: Dokument[];
  kunden: Kunde[];
}

export async function buildSteuerExport(input: ExportInput): Promise<Blob> {
  const { jahr, rhythmus, rechnungen, dokumente, kunden } = input;
  const kundenMap = new Map(kunden.map((k) => [k.id, k]));
  const zip = new JSZip();

  // --- Einnahmen (bezahlte Rechnungen) ---
  const einnahmenRows = rechnungen
    .filter(istVollBezahlt)
    .map((r) => ({ r, datum: bezahltDatum(r) }))
    .filter((x) => x.datum && new Date(x.datum).getFullYear() === jahr)
    .sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? ""))
    .map(({ r, datum }) => {
      const s = summenRechnung(r.positionen, r.rabattGesamt);
      // USt nach Satz aufteilen
      let ust19 = 0;
      let ust7 = 0;
      for (const p of r.positionen) {
        const netto =
          p.modus === "pauschal"
            ? p.pauschalpreisNetto ?? 0
            : p.menge * p.einzelpreisNetto * (1 - (p.rabatt ?? 0) / 100);
        const stUst = netto * (p.steuersatz / 100);
        if (Math.abs(p.steuersatz - 19) < 0.5) ust19 += stUst;
        else if (Math.abs(p.steuersatz - 7) < 0.5) ust7 += stUst;
      }
      return {
        Datum: datum,
        Belegnummer: r.nummer,
        Kunde: kundeLabel(kundenMap.get(r.kundeId)),
        Titel: r.titel ?? "",
        "Netto EUR": s.netto.toFixed(2),
        "USt 19% EUR": ust19.toFixed(2),
        "USt 7% EUR": ust7.toFixed(2),
        "Brutto EUR": s.brutto.toFixed(2),
      };
    });

  zip.file(
    `einnahmen-${jahr}.csv`,
    toCsv(einnahmenRows, [
      "Datum",
      "Belegnummer",
      "Kunde",
      "Titel",
      "Netto EUR",
      "USt 19% EUR",
      "USt 7% EUR",
      "Brutto EUR",
    ]),
  );

  // --- Ausgaben (steuerrelevante Dokumente) ---
  const ausgabenRows = dokumente
    .filter((d) => d.steuerrelevant && d.betrag && d.dokumentdatum)
    .filter((d) => new Date(d.dokumentdatum!).getFullYear() === jahr)
    .sort((a, b) => (a.dokumentdatum ?? "").localeCompare(b.dokumentdatum ?? ""))
    .map((d) => {
      const satz = (d.ustSatz ?? 19) / 100;
      const brutto = d.betrag ?? 0;
      const netto = brutto / (1 + satz);
      const vorsteuer = brutto - netto;
      return {
        Datum: d.dokumentdatum,
        Titel: d.titel,
        Lieferant: d.beschreibung ?? "",
        "Brutto EUR": brutto.toFixed(2),
        "USt-Satz %": (d.ustSatz ?? 19).toString(),
        "Vorsteuer EUR": vorsteuer.toFixed(2),
        "Netto EUR": netto.toFixed(2),
      };
    });

  zip.file(
    `ausgaben-${jahr}.csv`,
    toCsv(ausgabenRows, [
      "Datum",
      "Titel",
      "Lieferant",
      "Brutto EUR",
      "USt-Satz %",
      "Vorsteuer EUR",
      "Netto EUR",
    ]),
  );

  // --- USt-Übersicht pro Periode ---
  const ust = aggregiereUst(rechnungen, dokumente, rhythmus).filter(
    (u) => u.zeitraum.jahr === jahr,
  );
  const ustRows = ust.map((u) => ({
    Periode:
      u.zeitraum.monat
        ? `${u.zeitraum.jahr}-${String(u.zeitraum.monat).padStart(2, "0")}`
        : u.zeitraum.quartal
        ? `${u.zeitraum.jahr}-Q${u.zeitraum.quartal}`
        : `${u.zeitraum.jahr}`,
    "USt EUR": u.ust.toFixed(2),
    "Vorsteuer EUR": u.vorsteuer.toFixed(2),
    "Zahllast EUR": (u.ust - u.vorsteuer).toFixed(2),
  }));

  zip.file(
    `ust-uebersicht-${jahr}.csv`,
    toCsv(ustRows, ["Periode", "USt EUR", "Vorsteuer EUR", "Zahllast EUR"]),
  );

  // --- Gewinn-Übersicht ---
  const g = gewinnYtd(rechnungen, dokumente, jahr);
  const gewinnRows = [
    {
      Jahr: jahr,
      "Netto-Einnahmen EUR": g.nettoEinnahmen.toFixed(2),
      "Netto-Ausgaben EUR": g.nettoAusgaben.toFixed(2),
      "Gewinn EUR": g.gewinn.toFixed(2),
    },
  ];
  zip.file(
    `gewinn-${jahr}.csv`,
    toCsv(gewinnRows, [
      "Jahr",
      "Netto-Einnahmen EUR",
      "Netto-Ausgaben EUR",
      "Gewinn EUR",
    ]),
  );

  // --- README ---
  zip.file(
    "README.txt",
    [
      `Steuer-Export ${jahr} — My Clean Center`,
      "",
      "Enthaltene Dateien:",
      `- einnahmen-${jahr}.csv     — Bezahlte Ausgangsrechnungen (Datum = Zahlungseingang)`,
      `- ausgaben-${jahr}.csv      — Steuerrelevante Belege (Datum = Belegdatum)`,
      `- ust-uebersicht-${jahr}.csv — USt-Zahllast pro Voranmeldungs-Periode`,
      `- gewinn-${jahr}.csv        — Netto-Einnahmen, Netto-Ausgaben, Gewinn`,
      "",
      "Trennzeichen: ;   Encoding: UTF-8 mit BOM (Excel-kompatibel).",
      "Hinweis: Schätzungen — keine Steuerberatung. Mit Steuerberater abstimmen.",
    ].join("\n"),
  );

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
