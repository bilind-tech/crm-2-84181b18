// Layout-Bauer für Belege — 1:1-Port aus src/lib/pdf/belegPdf.ts
// Schwarz/weiß, dünne graue Linien, Logo rechts, kompakter 4-spaltiger Footer.

import type { ApiPosition, ApiAngebot, ApiRechnung } from "../belege/mappers.js";
import type { ApiKunde, ApiAnsprechpartner } from "../kunden/mappers.js";
import type { FirmaForPdf } from "./types.js";
import { DEFAULT_FONT } from "./printer.js";

const COLOR_TEXT = "#000000";
const COLOR_MUTED = "#555555";
const COLOR_LINE = "#bdbdbd";

function eur(n: number): string {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}
function dt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.includes("T") ? iso : iso + "T00:00:00Z");
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function summe(p: ApiPosition): number {
  if (p.modus === "pauschal") return (p.pauschalpreisNetto ?? 0) * (1 - (p.rabatt || 0) / 100);
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
  const plainLines: string[] = [];
  let titel: string | null = null;
  for (const z of zeilen) {
    const t = z.trim();
    if (!t) continue;
    const bm = t.match(/^[•\-*]\s+(.*)$/);
    if (bm) bullets.push(bm[1]);
    else if (!titel) titel = t;
    else plainLines.push(t);
  }
  if (titel) items.push({ text: titel, fontSize: 10, bold: true, margin: [0, 0, 0, 2] });
  for (const line of plainLines) {
    items.push({ text: line, fontSize: 10, margin: [0, 0, 0, 0] });
  }
  if (bullets.length > 0) {
    items.push({ ul: bullets.map((b) => ({ text: b, fontSize: 10 })), margin: [0, 0, 0, 0] });
  }
  if (items.length === 0) items.push({ text: text || "", fontSize: 10 });
  return { stack: items };
}

function kundeAdresse(k: ApiKunde, ap?: ApiAnsprechpartner): string[] {
  const lines: string[] = [];
  if (k.firmenname) lines.push(k.firmenname);
  const apPerson = ap ? [ap.vorname, ap.nachname].filter(Boolean).join(" ").trim() : "";
  const person = apPerson || [k.vorname, k.nachname].filter(Boolean).join(" ");
  if (person) lines.push(person);
  if (k.strasse) lines.push(k.strasse);
  const plzOrt = [k.plz, k.ort].filter(Boolean).join(" ");
  if (plzOrt) lines.push(plzOrt);
  if (k.land && k.land !== "Deutschland") lines.push(k.land);
  return lines;
}

function absenderzeile(f: FirmaForPdf): string {
  const teile = [f.firmenname, f.strasse, `${f.plz ?? ""} ${f.ort ?? ""}`.trim()].filter(Boolean);
  return teile.join(" – ");
}

function header(f: FirmaForPdf, logoDataUrl: string | null) {
  return {
    margin: [55, 30, 55, 0] as [number, number, number, number],
    columns: [
      {
        width: "*",
        stack: [
          { text: absenderzeile(f), fontSize: 7, color: COLOR_TEXT, decoration: "underline", margin: [0, 50, 0, 0], noWrap: true },
        ],
      },
      logoDataUrl
        ? { width: 270, image: logoDataUrl, fit: [270, 120], alignment: "right" }
        : { width: 270, text: "" },
    ],
  };
}

function footer(f: FirmaForPdf) {
  return function () {
    const cell = (lines: (string | null | undefined)[]) => ({
      stack: lines.filter(Boolean).map((l) => ({ text: l as string, fontSize: 7, color: COLOR_TEXT })),
    });
    return {
      margin: [55, 0, 55, 12] as [number, number, number, number],
      stack: [
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 485, y2: 0, lineWidth: 0.5, lineColor: COLOR_LINE }] },
        {
          margin: [0, 8, 0, 0] as [number, number, number, number],
          columns: [
            cell([
              f.firmenname,
              f.geschaeftsfuehrer ? `Geschäftsführer: ${f.geschaeftsfuehrer}` : null,
              [f.strasse, [f.plz, f.ort].filter(Boolean).join(" ")].filter(Boolean).join(" - "),
            ]),
            cell(["Bank", f.bankName, f.iban]),
            cell([f.telefon, f.email]),
            cell([f.handelsregister, f.ustId ? `USt-ID: ${f.ustId}` : null, f.webseite]),
          ],
          columnGap: 12,
        },
      ],
    };
  };
}

function hasStundenPositionen(positionen: ApiPosition[]): boolean {
  return positionen.some((p) => p.modus === "stunden");
}

function stundenText(p: ApiPosition): string {
  if (p.modus !== "stunden") return "";
  const menge = p.menge.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${menge} Std.`;
}
function abrechnungsartText(p: ApiPosition): string {
  if (p.ausfuehrung && p.ausfuehrung.trim()) return p.ausfuehrung;
  if (p.modus === "stunden") return "Stundensatz";
  if (p.modus === "einzel") return "Einzelposition";
  return "Pauschal";
}

function leistungstabelle(positionen: ApiPosition[], totalsT: { netto: number; steuer: number; brutto: number }, steuersatz: number) {
  const showStunden = hasStundenPositionen(positionen);
  const colCount = showStunden ? 4 : 3;

  const headerRow: unknown[] = [
    { text: "Leistung", bold: true, fontSize: 10, color: COLOR_TEXT, margin: [0, 4, 0, 4] },
  ];
  if (showStunden) {
    headerRow.push({ text: "Stunden", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "center", margin: [0, 4, 0, 4] });
  }
  headerRow.push(
    { text: "Abrechnungsart", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "center", margin: [0, 4, 0, 4] },
    { text: "Preis (netto)", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "right", margin: [0, 4, 0, 4] },
  );

  const body: unknown[][] = [headerRow];
  positionen.forEach((p) => {
    const row: unknown[] = [{ stack: [beschreibungBlock(p.beschreibung || "")] }];
    if (showStunden) row.push({ text: stundenText(p), fontSize: 10, alignment: "center" });
    row.push(
      { text: abrechnungsartText(p), fontSize: 10, alignment: "center" },
      { text: eur(summe(p)), fontSize: 10, alignment: "right" },
    );
    body.push(row);
  });

  const spanCols = colCount - 1;
  const spanFiller = Array.from({ length: spanCols - 1 }, () => ({}));
  body.push([
    { text: `Zzgl. gesetzlicher Mehrwertsteuer ${steuersatz}%`, colSpan: spanCols, fontSize: 10 },
    ...spanFiller,
    { text: eur(totalsT.steuer), fontSize: 10, alignment: "right" },
  ]);
  body.push([
    { text: "Gesamtbetrag inkl. MwSt.", colSpan: spanCols, fontSize: 10, bold: true },
    ...spanFiller,
    { text: eur(totalsT.brutto), fontSize: 10, alignment: "right", bold: true },
  ]);

  const widths = showStunden ? ["*", 60, 90, 85] : ["*", 110, 95];

  return {
    table: {
      headerRows: 1,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths,
      body,
    },
    layout: {
      hLineWidth: () => 0.6,
      vLineWidth: () => 0.6,
      hLineColor: () => COLOR_TEXT,
      vLineColor: () => COLOR_TEXT,
      paddingTop: () => 8,
      paddingBottom: () => 8,
      paddingLeft: () => 8,
      paddingRight: () => 8,
    },
  };
}

function metaBox(meta: { label: string; wert: string }[], variant: "box" | "plain", headerNote?: string) {
  if (variant === "plain") {
    return {
      width: 210,
      stack: meta.map((m) => ({
        text: `${m.label}: ${m.wert}`,
        fontSize: 10,
        alignment: "right",
        margin: [0, 0, 0, 2],
      })),
    };
  }
  const body: unknown[][] = [];
  let noteRowsCount = 0;
  if (headerNote) {
    const noteLines = headerNote.split("\n");
    noteLines.forEach((line, idx) => {
      const isLast = idx === noteLines.length - 1;
      body.push([
        {
          text: line,
          fontSize: 9.5,
          bold: true,
          colSpan: 2,
          border: [false, false, false, false],
          margin: [0, 0, 0, isLast ? 2 : 0],
          lineHeight: 1.15,
        },
        {},
      ]);
      noteRowsCount++;
    });
  }
  meta.forEach((m) => {
    body.push([
      { text: m.label, fontSize: 9.5, border: [false, false, false, false], margin: [0, 1, 8, 1], lineHeight: 1.2 },
      { text: m.wert, fontSize: 9.5, alignment: "right", border: [false, false, false, false], margin: [0, 1, 0, 1], lineHeight: 1.2 },
    ]);
  });
  const dividerIndex = noteRowsCount;
  return {
    width: 235,
    table: {
      widths: ["auto", "*"],
      body,
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[][] } }) => {
        if (i === 0 || i === node.table.body.length) return 0.6;
        if (i === dividerIndex && noteRowsCount > 0) return 0.4;
        return 0;
      },
      vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => (i === 0 || i === node.table.widths.length ? 0.6 : 0),
      hLineColor: () => COLOR_TEXT,
      vLineColor: () => COLOR_TEXT,
      paddingTop: () => 2,
      paddingBottom: () => 2,
      paddingLeft: () => 8,
      paddingRight: () => 8,
    },
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
  return `gerne unterbreiten wir Ihnen ein Angebot für „${a.titel}" und folgende Leistungen:`;
}
function defaultOutroAngebot(a: ApiAngebot, outro?: string): string {
  if (outro) return outro;
  return [
    a.gueltigBis ? `Dieses Angebot ist gültig bis ${dt(a.gueltigBis)}.` : null,
    "Sofern Sie Interesse an dem Angebot haben, bestätigen Sie uns dies.",
    "Über eine Rückmeldung Ihrerseits würden wir uns freuen. Sollten Sie zu diesem Angebot noch Fragen haben, sind wir für Sie jederzeit telefonisch oder auch per E-Mail zu erreichen.",
  ].filter(Boolean).join("\n\n");
}
function defaultIntroRechnung(_r: ApiRechnung, intro?: string): string {
  if (intro) return intro;
  return `hiermit übersenden wir Ihnen die Rechnung für folgende Leistungen:`;
}


function signaturFromFirma(f: FirmaForPdf): string[] {
  const lines: string[] = [];
  if (f.geschaeftsfuehrer) {
    lines.push(f.geschaeftsfuehrer);
    lines.push("Geschäftsführer");
  }
  return lines;
}

interface BuildArgs {
  firma: FirmaForPdf;
  kunde: ApiKunde;
  ansprechpartner?: ApiAnsprechpartner;
  logoDataUrl: string | null;
  titel: string;
  meta: { label: string; wert: string }[];
  metaVariant: "box" | "plain";
  metaNote?: string;
  positionen: ApiPosition[];
  rabattGesamt: number;
  steuersatz: number;
  intro: string;
  outro: string;
}

function buildDoc(args: BuildArgs) {
  const t = totals(args.positionen, args.rabattGesamt, args.steuersatz);
  const signatur = signaturFromFirma(args.firma);
  return {
    pageSize: "A4" as const,
    pageMargins: [55, 155, 55, 100] as [number, number, number, number],
    defaultStyle: { font: DEFAULT_FONT, fontSize: 10, color: COLOR_TEXT, lineHeight: 1.25 },
    header: header(args.firma, args.logoDataUrl),
    footer: footer(args.firma),
    content: [
      {
        columns: [
          {
            width: "*",
            stack: kundeAdresse(args.kunde, args.ansprechpartner).map((l, i) => ({
              text: l,
              fontSize: 10,
              bold: i === 0,
            })),
          },
          metaBox(args.meta, args.metaVariant, args.metaNote),
        ],
        columnGap: 20,
      },
      { text: args.titel, fontSize: 22, bold: true, color: COLOR_TEXT, margin: [0, 30, 0, 14] },
      {
        stack: [
          { text: anrede(args.kunde, args.ansprechpartner), margin: [0, 0, 0, 8] },
          { text: args.intro, margin: [0, 0, 0, 14] },
        ],
        unbreakable: true,
      },
      leistungstabelle(args.positionen, t, args.steuersatz),
      {
        stack: [
          { text: args.outro, margin: [0, 16, 0, 0] },
          { text: "Mit freundlichen Grüßen", margin: [0, 18, 0, 0] },
          ...signatur.map((s) => ({ text: s, margin: [0, 0, 0, 0], color: COLOR_MUTED })),
        ],
        unbreakable: true,
      },
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
  const opts = (angebot.optionen ?? {}) as { eigenesIntro?: string; eigenesOutro?: string };
  const intro = defaultIntroAngebot(angebot, opts.eigenesIntro || angebot.introText);
  const outro = defaultOutroAngebot(angebot, opts.eigenesOutro || angebot.outroText);
  const meta: { label: string; wert: string }[] = [
    { label: "Angebot-Nr.", wert: angebot.nummer },
    { label: "Angebotsdatum", wert: dt(angebot.erstelltAm) },
    ...(angebot.gueltigBis ? [{ label: "Gültig bis", wert: dt(angebot.gueltigBis) }] : []),
  ];
  return buildDoc({
    firma, kunde, ansprechpartner, logoDataUrl,
    titel: `Angebot ${angebot.titel || ""}`.trim(),
    meta,
    metaVariant: "plain",
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
  const opts = (rechnung.optionen ?? {}) as { eigenesIntro?: string; eigenesOutro?: string };
  const intro = defaultIntroRechnung(rechnung, opts.eigenesIntro || rechnung.introText);
  const t = totals(rechnung.positionen, rechnung.rabattGesamt, rechnung.steuersatz);
  let tage = 14;
  if (rechnung.rechnungsdatum && rechnung.faelligkeitsdatum) {
    const d1 = new Date(rechnung.rechnungsdatum.includes("T") ? rechnung.rechnungsdatum : rechnung.rechnungsdatum + "T00:00:00Z").getTime();
    const d2 = new Date(rechnung.faelligkeitsdatum.includes("T") ? rechnung.faelligkeitsdatum : rechnung.faelligkeitsdatum + "T00:00:00Z").getTime();
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diff > 0) tage = diff;
  }
  const zahlungsSatz = `Wir möchten Sie bitten, den Rechnungsbetrag in Höhe von ${eur(t.brutto)} innerhalb von ${tage} Tagen nach Rechnungszustellung auf unser unten genanntes Bankkonto zu überweisen.`;
  const customOutro = opts.eigenesOutro || rechnung.outroText;
  const outro = customOutro ? customOutro : zahlungsSatz;
  const meta: { label: string; wert: string }[] = [
    { label: "Rechnung-Nr.:", wert: rechnung.nummer },
    { label: "Rechnungsdatum:", wert: dt(rechnung.rechnungsdatum) },
  ];
  const metaNote = "Bei Zahlung bitte\ndie Rechnungs-Nr. angeben";
  return buildDoc({
    firma, kunde, ansprechpartner, logoDataUrl,
    titel: "Rechnung",
    meta,
    metaVariant: "box",
    metaNote,
    positionen: rechnung.positionen,
    rabattGesamt: rechnung.rabattGesamt,
    steuersatz: rechnung.steuersatz,
    intro, outro,
  });
}
