// Layout-Bauer für Belege — 1:1-Port aus src/lib/pdf/belegPdf.ts
// (selbe Struktur, selbe Margins, selbe Farben). Kein React/Browser-Import.

import type { ApiPosition, ApiAngebot, ApiRechnung } from "../belege/mappers.js";
import type { ApiKunde, ApiAnsprechpartner } from "../kunden/mappers.js";
import type { FirmaForPdf } from "./types.js";
import { DEFAULT_FONT } from "./printer.js";

function eur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}
function dt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00Z");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function summe(p: ApiPosition): number {
  if (p.modus === "pauschal") {
    return (p.pauschalpreisNetto ?? 0) * (1 - (p.rabatt || 0) / 100);
  }
  return p.menge * p.einzelpreisNetto * (1 - (p.rabatt || 0) / 100);
}

export function totals(positionen: ApiPosition[], rabattGesamt: number, steuersatz: number) {
  const nettoRoh = positionen.reduce((s, p) => s + summe(p), 0);
  const netto = nettoRoh * (1 - (rabattGesamt || 0) / 100);
  const steuer = netto * ((steuersatz || 0) / 100);
  return { netto, steuer, brutto: netto + steuer };
}

function beschreibungBlock(text: string): unknown {
  const zeilen = (text || "").split("\n");
  const items: unknown[] = [];
  const bullets: string[] = [];
  let titel: string | null = null;
  for (const z of zeilen) {
    const t = z.trim();
    if (!t) continue;
    const bm = t.match(/^[•\-*]\s+(.*)$/);
    if (bm) bullets.push(bm[1]);
    else if (!titel && bullets.length === 0) titel = t;
    else bullets.push(t);
  }
  if (titel) items.push({ text: titel, fontSize: 9, bold: true, margin: [0, 0, 0, 2] });
  if (bullets.length > 0) {
    items.push({ ul: bullets.map((b) => ({ text: b, fontSize: 9 })), margin: [0, 0, 0, 0] });
  } else if (!titel) {
    items.push({ text: text || "", fontSize: 9 });
  }
  return { stack: items };
}

function kundeAdresse(k: ApiKunde): string[] {
  const lines: string[] = [];
  if (k.firmenname) lines.push(k.firmenname);
  const person = [k.vorname, k.nachname].filter(Boolean).join(" ");
  if (person) lines.push(person);
  if (k.strasse) lines.push(k.strasse);
  const plzOrt = [k.plz, k.ort].filter(Boolean).join(" ");
  if (plzOrt) lines.push(plzOrt);
  if (k.land && k.land !== "Deutschland") lines.push(k.land);
  return lines;
}

function absenderzeile(f: FirmaForPdf): string {
  return `${f.firmenname} · ${f.strasse ?? ""} · ${f.plz ?? ""} ${f.ort ?? ""}`.trim();
}

function header(f: FirmaForPdf, logoDataUrl: string | null) {
  return {
    margin: [40, 30, 40, 0] as [number, number, number, number],
    columns: [
      logoDataUrl
        ? { image: logoDataUrl, width: 110 }
        : { text: f.firmenname.toUpperCase(), bold: true, fontSize: 18, color: "#1e3a8a" },
      {
        text: absenderzeile(f),
        alignment: "right" as const,
        fontSize: 8,
        color: "#475569",
        margin: [0, 24, 0, 0] as [number, number, number, number],
      },
    ],
  };
}

function footer(f: FirmaForPdf) {
  return function () {
    return {
      margin: [40, 0, 40, 20] as [number, number, number, number],
      columns: [
        {
          stack: [
            { text: f.firmenname, bold: true, fontSize: 8 },
            { text: f.strasse ?? "", fontSize: 7 },
            { text: `${f.plz ?? ""} ${f.ort ?? ""}`, fontSize: 7 },
          ],
        },
        {
          stack: [
            { text: "Bankverbindung", bold: true, fontSize: 8 },
            { text: f.bankName ?? "", fontSize: 7 },
            { text: `IBAN: ${f.iban ?? ""}`, fontSize: 7 },
            { text: `BIC: ${f.bic ?? ""}`, fontSize: 7 },
          ],
        },
        {
          stack: [
            { text: "Kontakt", bold: true, fontSize: 8 },
            { text: `Tel: ${f.telefon ?? ""}`, fontSize: 7 },
            { text: f.email ?? "", fontSize: 7 },
            { text: f.webseite ?? "", fontSize: 7 },
          ],
        },
        {
          stack: [
            { text: "Steuer & Register", bold: true, fontSize: 8 },
            { text: `USt-IdNr.: ${f.ustId ?? ""}`, fontSize: 7 },
            { text: f.handelsregister ?? "", fontSize: 7 },
            { text: `GF: ${f.geschaeftsfuehrer ?? ""}`, fontSize: 7 },
          ],
        },
      ],
      columnGap: 14,
      color: "#64748b",
    };
  };
}

function leistungstabelle(positionen: ApiPosition[]) {
  const hatPauschal = positionen.some((p) => p.modus === "pauschal");
  if (hatPauschal) {
    const body: unknown[][] = [
      [
        { text: "Ausführung", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9 },
        { text: "Leistung", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9 },
        { text: "Preis", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9, alignment: "right" },
      ],
    ];
    positionen.forEach((p) => {
      const ausf =
        p.ausfuehrung ?? (p.modus === "pauschal" ? "Pauschal" : `${p.menge.toLocaleString("de-DE")} ${p.einheit}`);
      body.push([
        { text: ausf, fontSize: 9, bold: true },
        beschreibungBlock(p.beschreibung || ""),
        { text: eur(summe(p)), fontSize: 9, alignment: "right", bold: true },
      ]);
    });
    return {
      table: { headerRows: 1, widths: [90, "*", 70], body },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0,
        hLineColor: () => "#e2e8f0",
        paddingTop: () => 8,
        paddingBottom: () => 8,
      },
    };
  }
  const body: unknown[][] = [
    [
      { text: "Pos.", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9 },
      { text: "Beschreibung", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9 },
      { text: "Menge", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9, alignment: "right" },
      { text: "Einheit", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9 },
      { text: "Einzelpreis", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9, alignment: "right" },
      { text: "Summe", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9, alignment: "right" },
    ],
  ];
  positionen.forEach((p, i) => {
    body.push([
      { text: String(i + 1), fontSize: 9 },
      beschreibungBlock(p.beschreibung || ""),
      { text: p.menge.toLocaleString("de-DE"), fontSize: 9, alignment: "right" },
      { text: p.einheit, fontSize: 9 },
      { text: eur(p.einzelpreisNetto), fontSize: 9, alignment: "right" },
      { text: eur(summe(p)), fontSize: 9, alignment: "right", bold: true },
    ]);
  });
  return {
    table: { headerRows: 1, widths: [22, "*", 40, 40, 60, 60], body },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => "#e2e8f0",
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
  };
}

function summenBlock(t: { netto: number; steuer: number; brutto: number }, steuersatz: number) {
  return {
    margin: [0, 8, 0, 0] as [number, number, number, number],
    columns: [
      { text: "" },
      {
        width: 220,
        table: {
          widths: ["*", "auto"],
          body: [
            [{ text: "Netto", fontSize: 9, color: "#475569" }, { text: eur(t.netto), fontSize: 9, alignment: "right" }],
            [
              { text: `MwSt ${steuersatz}%`, fontSize: 9, color: "#475569" },
              { text: eur(t.steuer), fontSize: 9, alignment: "right" },
            ],
            [
              { text: "Gesamt brutto", bold: true, fontSize: 11, color: "#1e3a8a" },
              { text: eur(t.brutto), bold: true, fontSize: 11, alignment: "right", color: "#1e3a8a" },
            ],
          ],
        },
        layout: {
          hLineWidth: (i: number) => (i === 2 ? 1 : 0),
          vLineWidth: () => 0,
          hLineColor: () => "#1e3a8a",
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
      },
    ],
  };
}

function anrede(k: ApiKunde, ap?: ApiAnsprechpartner): string {
  if (ap) {
    const name = ap.nachname?.trim() || "";
    if (ap.anrede === "herr") return `Sehr geehrter Herr ${name},`;
    if (ap.anrede === "frau") return `Sehr geehrte Frau ${name},`;
    if (ap.vorname || ap.nachname) return `Hallo ${[ap.vorname, ap.nachname].filter(Boolean).join(" ")},`;
  }
  if (k.anrede === "herr") return `Sehr geehrter Herr ${k.nachname ?? ""},`;
  if (k.anrede === "frau") return `Sehr geehrte Frau ${k.nachname ?? ""},`;
  return "Sehr geehrte Damen und Herren,";
}

function defaultIntroAngebot(a: ApiAngebot, intro?: string): string {
  if (intro) return intro;
  return `vielen Dank für Ihre Anfrage. Wir freuen uns, Ihnen folgendes Angebot „${a.titel}" unterbreiten zu dürfen:`;
}
function defaultOutroAngebot(a: ApiAngebot, outro?: string): string {
  if (outro) return outro;
  return [
    a.gueltigBis ? `Dieses Angebot ist gültig bis ${dt(a.gueltigBis)}.` : null,
    "Wir freuen uns auf Ihre Rückmeldung.",
    "Mit freundlichen Grüßen",
  ].filter(Boolean).join("\n\n");
}
function defaultIntroRechnung(_r: ApiRechnung, intro?: string): string {
  if (intro) return intro;
  return `wir bedanken uns für Ihren Auftrag und stellen die folgenden Leistungen in Rechnung:`;
}
function defaultOutroRechnung(r: ApiRechnung, outro?: string): string {
  if (outro) return outro;
  return [
    `Bitte überweisen Sie den Rechnungsbetrag bis zum ${dt(r.faelligkeitsdatum)} auf das untenstehende Konto.`,
    "Mit freundlichen Grüßen",
  ].join("\n\n");
}

interface BuildArgs {
  firma: FirmaForPdf;
  kunde: ApiKunde;
  ansprechpartner?: ApiAnsprechpartner;
  logoDataUrl: string | null;
  titel: string;
  meta: { label: string; wert: string }[];
  positionen: ApiPosition[];
  rabattGesamt: number;
  steuersatz: number;
  intro: string;
  outro: string;
}

function buildDoc(args: BuildArgs) {
  const t = totals(args.positionen, args.rabattGesamt, args.steuersatz);
  return {
    pageSize: "A4" as const,
    pageMargins: [40, 90, 40, 110] as [number, number, number, number],
    defaultStyle: { font: DEFAULT_FONT, fontSize: 10, color: "#0f172a" },
    header: header(args.firma, args.logoDataUrl),
    footer: footer(args.firma),
    content: [
      {
        margin: [0, 10, 0, 0],
        columns: [
          {
            stack: [
              { text: absenderzeile(args.firma), fontSize: 7, color: "#64748b", decoration: "underline" },
              { text: "\n" },
              ...kundeAdresse(args.kunde).map((l) => ({ text: l, fontSize: 10 })),
            ],
          },
          {
            width: 200,
            stack: args.meta.map((m) => ({
              columns: [
                { text: m.label, fontSize: 9, color: "#64748b" },
                { text: m.wert, fontSize: 9, alignment: "right", bold: true },
              ],
              margin: [0, 1, 0, 1] as [number, number, number, number],
            })),
          },
        ],
      },
      { text: args.titel, fontSize: 18, bold: true, color: "#1e3a8a", margin: [0, 24, 0, 12] },
      { text: anrede(args.kunde, args.ansprechpartner), margin: [0, 0, 0, 8] },
      { text: args.intro, margin: [0, 0, 0, 14] },
      leistungstabelle(args.positionen),
      summenBlock(t, args.steuersatz),
      { text: args.outro, margin: [0, 20, 0, 0] },
      { text: args.firma.geschaeftsfuehrer ?? "", margin: [0, 24, 0, 0], italics: true },
    ],
  };
}

export function angebotDocDef(args: {
  angebot: ApiAngebot;
  kunde: ApiKunde;
  firma: FirmaForPdf;
  ansprechpartner?: ApiAnsprechpartner;
  logoDataUrl: string | null;
}) {
  const { angebot, kunde, firma, ansprechpartner, logoDataUrl } = args;
  const opts = (angebot.optionen ?? {}) as {
    eigenesIntro?: string;
    eigenesOutro?: string;
  };
  const intro = defaultIntroAngebot(angebot, opts.eigenesIntro || angebot.introText);
  const outro = defaultOutroAngebot(angebot, opts.eigenesOutro || angebot.outroText);
  const meta: { label: string; wert: string }[] = [
    { label: "Angebot-Nr.", wert: angebot.nummer },
    { label: "Datum", wert: dt(angebot.erstelltAm) },
    ...(angebot.gueltigBis ? [{ label: "Gültig bis", wert: dt(angebot.gueltigBis) }] : []),
    { label: "Kunden-Nr.", wert: kunde.nummer },
  ];
  return buildDoc({
    firma, kunde, ansprechpartner, logoDataUrl,
    titel: `Angebot ${angebot.nummer}`,
    meta,
    positionen: angebot.positionen,
    rabattGesamt: angebot.rabattGesamt,
    steuersatz: angebot.steuersatz,
    intro, outro,
  });
}

export function rechnungDocDef(args: {
  rechnung: ApiRechnung;
  kunde: ApiKunde;
  firma: FirmaForPdf;
  ansprechpartner?: ApiAnsprechpartner;
  logoDataUrl: string | null;
}) {
  const { rechnung, kunde, firma, ansprechpartner, logoDataUrl } = args;
  const opts = (rechnung.optionen ?? {}) as {
    eigenesIntro?: string;
    eigenesOutro?: string;
  };
  const intro = defaultIntroRechnung(rechnung, opts.eigenesIntro || rechnung.introText);
  const outro = defaultOutroRechnung(rechnung, opts.eigenesOutro || rechnung.outroText);
  const meta: { label: string; wert: string }[] = [
    { label: "Rechnung-Nr.", wert: rechnung.nummer },
    { label: "Rechnungsdatum", wert: dt(rechnung.rechnungsdatum) },
    { label: "Fällig am", wert: dt(rechnung.faelligkeitsdatum) },
    { label: "Kunden-Nr.", wert: kunde.nummer },
  ];
  return buildDoc({
    firma, kunde, ansprechpartner, logoDataUrl,
    titel: `Rechnung ${rechnung.nummer}`,
    meta,
    positionen: rechnung.positionen,
    rabattGesamt: rechnung.rabattGesamt,
    steuersatz: rechnung.steuersatz,
    intro, outro,
  });
}
