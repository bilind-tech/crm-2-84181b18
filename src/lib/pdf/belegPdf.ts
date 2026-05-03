// PDF-Generator für Angebote und Rechnungen.
// Layout 1:1 nach My-Clean-Center-Vorlage: schwarz/weiß, dünne graue Linien,
// Logo rechts oben, kompakter 4-spaltiger Footer.

import type { Angebot, Rechnung, Position, Kunde, Firmendaten, Ansprechpartner } from "@/lib/api/types";
import logoUrl from "@/assets/logo.png";
import { A4, createHotspotTracker, type RuntimeHotspot } from "./hotspotTracker";

export interface PdfBuildResult {
  blob: Blob;
  hotspots: RuntimeHotspot[];
}

// pdfmake-Typen sind unvollständig — wir nutzen any-Cast für Doc-Definitionen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPdfMake = any;
let pdfMakeInstance: AnyPdfMake = null;

async function getPdfMake(): Promise<AnyPdfMake> {
  if (pdfMakeInstance) return pdfMakeInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pmMod: any = await import("pdfmake/build/pdfmake");
  const pm: AnyPdfMake = pmMod?.default ?? pmMod;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vfsMod: any = await import("pdfmake/build/vfs_fonts");
  const vfsData =
    vfsMod?.default?.vfs ??
    vfsMod?.vfs ??
    vfsMod?.pdfMake?.vfs ??
    vfsMod?.default?.pdfMake?.vfs ??
    (vfsMod?.default && typeof vfsMod.default === "object" ? vfsMod.default : null) ??
    (typeof vfsMod === "object" && !("default" in vfsMod) ? vfsMod : null);
  if (vfsData) {
    if (typeof pm.addVirtualFileSystem === "function") pm.addVirtualFileSystem(vfsData);
    else pm.vfs = vfsData;
  }
  pdfMakeInstance = pm;
  return pm;
}

async function logoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ───────── Helpers ─────────────────────────────────────────────────────────

const COLOR_TEXT = "#000000";
const COLOR_MUTED = "#555555";
const COLOR_LINE = "#bdbdbd";

function eur(n: number) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}
function dt(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function summe(p: Position) {
  if (p.modus === "pauschal") return (p.pauschalpreisNetto ?? 0) * (1 - p.rabatt / 100);
  return p.menge * p.einzelpreisNetto * (1 - p.rabatt / 100);
}
function totals(positionen: Position[], rabattGesamt: number, steuersatz: number) {
  const nettoRoh = positionen.reduce((s, p) => s + summe(p), 0);
  const netto = nettoRoh * (1 - rabattGesamt / 100);
  const steuer = netto * (steuersatz / 100);
  return { netto, steuer, brutto: netto + steuer };
}

function beschreibungBlock(text: string): unknown {
  const zeilen = text.split("\n");
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
  if (titel) items.push({ text: titel, fontSize: 10, bold: true, margin: [0, 0, 0, 2] });
  if (bullets.length > 0) {
    items.push({ ul: bullets.map((b) => ({ text: b, fontSize: 10 })), margin: [0, 0, 0, 0] });
  } else if (!titel) {
    items.push({ text, fontSize: 10 });
  }
  return { stack: items };
}

function kundeAdresse(k: Kunde) {
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

function absenderzeile(f: Firmendaten) {
  const teile = [f.firmenname, f.strasse, `${f.plz ?? ""} ${f.ort ?? ""}`.trim()].filter(Boolean);
  return teile.join(" – ");
}

function anrede(k: Kunde, ap?: Ansprechpartner) {
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

// ───────── Header / Footer ─────────────────────────────────────────────────

function header(absender: string, logo: string | null) {
  return {
    margin: [55, 35, 55, 0] as [number, number, number, number],
    columns: [
      {
        width: "*",
        stack: [
          { text: absender, fontSize: 8, color: COLOR_TEXT, decoration: "underline", margin: [0, 22, 0, 0] },
        ],
      },
      logo
        ? { width: 150, image: logo, fit: [150, 70], alignment: "right" }
        : { width: 150, text: "MY CLEAN CENTER", bold: true, fontSize: 16, color: COLOR_TEXT, alignment: "right" },
    ],
  };
}

function footer(firma: Firmendaten) {
  return function () {
    const cell = (lines: (string | null | undefined)[]) => ({
      stack: lines.filter(Boolean).map((l) => ({ text: l as string, fontSize: 7, color: COLOR_TEXT })),
    });
    return {
      margin: [55, 0, 55, 25] as [number, number, number, number],
      stack: [
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 485, y2: 0, lineWidth: 0.5, lineColor: COLOR_LINE }] },
        {
          margin: [0, 8, 0, 0] as [number, number, number, number],
          columns: [
            cell([
              firma.firmenname,
              firma.geschaeftsfuehrer ? `Geschäftsführer: ${firma.geschaeftsfuehrer}` : null,
              [firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(" ")].filter(Boolean).join(" - "),
            ]),
            cell(["Bank", firma.bankName, firma.iban]),
            cell([firma.telefon, firma.email]),
            cell([firma.handelsregister, firma.ustId ? `USt-ID: ${firma.ustId}` : null, firma.webseite]),
          ],
          columnGap: 12,
        },
      ],
    };
  };
}

// ───────── Tabelle (Pauschal & klassisch) ──────────────────────────────────

function pauschalTabelle(positionen: Position[], totalsT: { netto: number; steuer: number; brutto: number }, steuersatz: number) {
  const headerRow = [
    { text: "Ausführung", bold: true, fontSize: 10, color: COLOR_TEXT, margin: [0, 4, 0, 4] },
    { text: "Leistung", bold: true, fontSize: 10, color: COLOR_TEXT, margin: [0, 4, 0, 4] },
    { text: "Preis ohne MwSt.", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "right", margin: [0, 4, 0, 4] },
  ];
  const body: unknown[][] = [headerRow];
  positionen.forEach((p) => {
    const ausf = p.ausfuehrung ?? (p.modus === "pauschal" ? "Pauschal" : `${p.menge.toLocaleString("de-DE")} ${p.einheit}`);
    body.push([
      { text: ausf, fontSize: 10, id: `pos:${p.id}` },
      beschreibungBlock(p.beschreibung || ""),
      { text: eur(summe(p)), fontSize: 10, alignment: "right" },
    ]);
  });
  // Summenzeilen direkt in die Tabelle (entspricht Vorlage)
  body.push([
    { text: `Zzgl. Gesetzlicher Mehrwertsteuer ${steuersatz}%`, colSpan: 2, fontSize: 10 },
    {},
    { text: eur(totalsT.steuer), fontSize: 10, alignment: "right" },
  ]);
  body.push([
    { text: "Gesamtbetrag inkl. MwSt.", colSpan: 2, fontSize: 10, bold: true },
    {},
    { text: eur(totalsT.brutto), fontSize: 10, alignment: "right", bold: true },
  ]);
  const totalRows = body.length;
  return {
    id: "tabelle",
    table: {
      headerRows: 1,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: [95, "*", 90],
      body,
    },
    layout: {
      hLineWidth: (i: number) => (i === 0 || i === totalRows ? 0.7 : 0.4),
      vLineWidth: () => 0.4,
      hLineColor: () => COLOR_LINE,
      vLineColor: () => COLOR_LINE,
      paddingTop: () => 8,
      paddingBottom: () => 8,
      paddingLeft: () => 6,
      paddingRight: () => 6,
    },
  };
}

function klassischTabelle(positionen: Position[], totalsT: { netto: number; steuer: number; brutto: number }, steuersatz: number) {
  const headerRow = [
    { text: "Pos.", bold: true, fontSize: 10, color: COLOR_TEXT, margin: [0, 4, 0, 4] },
    { text: "Beschreibung", bold: true, fontSize: 10, color: COLOR_TEXT, margin: [0, 4, 0, 4] },
    { text: "Menge", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "right", margin: [0, 4, 0, 4] },
    { text: "Einheit", bold: true, fontSize: 10, color: COLOR_TEXT, margin: [0, 4, 0, 4] },
    { text: "Einzelpreis", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "right", margin: [0, 4, 0, 4] },
    { text: "Summe", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "right", margin: [0, 4, 0, 4] },
  ];
  const body: unknown[][] = [headerRow];
  positionen.forEach((p, i) => {
    body.push([
      { text: String(i + 1), fontSize: 10, id: `pos:${p.id}` },
      beschreibungBlock(p.beschreibung || ""),
      { text: p.menge.toLocaleString("de-DE"), fontSize: 10, alignment: "right" },
      { text: p.einheit, fontSize: 10 },
      { text: eur(p.einzelpreisNetto), fontSize: 10, alignment: "right" },
      { text: eur(summe(p)), fontSize: 10, alignment: "right" },
    ]);
  });
  body.push([
    { text: "Netto", colSpan: 5, fontSize: 10, alignment: "right" },
    {}, {}, {}, {},
    { text: eur(totalsT.netto), fontSize: 10, alignment: "right" },
  ]);
  body.push([
    { text: `MwSt ${steuersatz}%`, colSpan: 5, fontSize: 10, alignment: "right" },
    {}, {}, {}, {},
    { text: eur(totalsT.steuer), fontSize: 10, alignment: "right" },
  ]);
  body.push([
    { text: "Gesamtbetrag inkl. MwSt.", colSpan: 5, fontSize: 10, alignment: "right", bold: true },
    {}, {}, {}, {},
    { text: eur(totalsT.brutto), fontSize: 10, alignment: "right", bold: true },
  ]);
  const totalRows = body.length;
  return {
    id: "tabelle",
    table: {
      headerRows: 1,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: [22, "*", 38, 38, 60, 60],
      body,
    },
    layout: {
      hLineWidth: (i: number) => (i === 0 || i === totalRows ? 0.7 : 0.4),
      vLineWidth: () => 0.4,
      hLineColor: () => COLOR_LINE,
      vLineColor: () => COLOR_LINE,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      paddingLeft: () => 5,
      paddingRight: () => 5,
    },
  };
}

function leistungstabelle(positionen: Position[], totalsT: { netto: number; steuer: number; brutto: number }, steuersatz: number) {
  const hatPauschal = positionen.some((p) => p.modus === "pauschal");
  return hatPauschal
    ? pauschalTabelle(positionen, totalsT, steuersatz)
    : klassischTabelle(positionen, totalsT, steuersatz);
}

// ───────── Meta-Box ────────────────────────────────────────────────────────

function metaBox(meta: { label: string; wert: string }[], variant: "box" | "plain") {
  if (variant === "plain") {
    return {
      id: "meta",
      width: 200,
      stack: meta.map((m) => ({
        text: `${m.label}: ${m.wert}`,
        fontSize: 10,
        alignment: "right",
        margin: [0, 0, 0, 2],
      })),
    };
  }
  return {
    id: "meta",
    width: 230,
    table: {
      widths: ["auto", "*"],
      body: meta.map((m) => [
        { text: m.label, fontSize: 10, border: [false, false, false, false], margin: [0, 1, 8, 1] },
        { text: m.wert, fontSize: 10, alignment: "right", border: [false, false, false, false], margin: [0, 1, 0, 1] },
      ]),
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0.7 : 0),
      vLineWidth: (i: number, node: { table: { widths: unknown[] } }) => (i === 0 || i === node.table.widths.length ? 0.7 : 0),
      hLineColor: () => COLOR_TEXT,
      vLineColor: () => COLOR_TEXT,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      paddingLeft: () => 8,
      paddingRight: () => 8,
    },
  };
}

// ───────── Doc-Bauer ───────────────────────────────────────────────────────

interface BuildOptions {
  intro?: string;
  outro?: string;
  materialBereitgestellt?: boolean;
}

function defaultIntroAngebot(a: Angebot, opts: BuildOptions) {
  if (opts.intro) return opts.intro;
  return `gerne unterbreiten wir Ihnen ein Angebot für „${a.titel}" und folgende Leistungen:`;
}
function defaultOutroAngebot(a: Angebot, opts: BuildOptions) {
  if (opts.outro) return opts.outro;
  const teile = [
    opts.materialBereitgestellt
      ? "Zugunsten der Reinigung werden Reinigungswerkzeuge und Reinigungsmittel von uns zur Verfügung gestellt."
      : null,
    a.gueltigBis ? `Dieses Angebot ist gültig bis ${dt(a.gueltigBis)}.` : null,
    "Sofern Sie Interesse an dem Angebot haben, bestätigen Sie uns dies.",
    "Über eine Rückmeldung Ihrerseits würden wir uns freuen. Sollten Sie zu diesem Angebot noch Fragen haben, sind wir für Sie jederzeit telefonisch oder auch per E-Mail zu erreichen.",
  ].filter(Boolean);
  return teile.join("\n\n");
}
function defaultIntroRechnung(_r: Rechnung, opts: BuildOptions) {
  if (opts.intro) return opts.intro;
  return `hiermit übersenden wir Ihnen die Rechnung für folgende Leistungen:`;
}
function defaultOutroRechnung(r: Rechnung, opts: BuildOptions) {
  if (opts.outro) return opts.outro;
  const teile = [
    `Wir möchten Sie bitten, den Rechnungsbetrag innerhalb von ${ziel(r)} Tagen nach Rechnungszustellung auf unser unten genanntes Bankkonto zu überweisen.`,
    opts.materialBereitgestellt
      ? "Zugunsten der Reinigung werden Reinigungswerkzeuge und Reinigungsmittel von uns zur Verfügung gestellt."
      : null,
  ].filter(Boolean);
  return teile.join("\n\n");
}
function ziel(r: Rechnung): number {
  if (!r.rechnungsdatum || !r.faelligkeitsdatum) return 14;
  const a = new Date(r.rechnungsdatum).getTime();
  const b = new Date(r.faelligkeitsdatum).getTime();
  const d = Math.round((b - a) / 86400000);
  return d > 0 ? d : 14;
}

interface PdfContext {
  firma: Firmendaten;
  kunde: Kunde;
  ansprechpartner?: Ansprechpartner;
}

function mergeFirma(firma: Firmendaten, override?: Partial<Firmendaten>): Firmendaten {
  if (!override) return firma;
  const merged: Firmendaten = { ...firma };
  for (const k of Object.keys(override) as (keyof Firmendaten)[]) {
    const v = override[k];
    if (v !== undefined && v !== null && v !== "") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[k] = v;
    }
  }
  return merged;
}

async function buildDoc(
  ctx: PdfContext,
  titel: string,
  meta: { label: string; wert: string }[],
  metaVariant: "box" | "plain",
  beleg: { positionen: Position[]; rabattGesamt: number; steuersatz: number },
  intro: string,
  outro: string,
  signatur: string[],
  logoOverride: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pageBreakBefore?: (currentNode: any) => boolean,
) {
  const logo = logoOverride ?? (await logoDataUrl());
  const t = totals(beleg.positionen, beleg.rabattGesamt, beleg.steuersatz);
  return {
    pageSize: "A4" as const,
    pageMargins: [55, 110, 55, 130] as [number, number, number, number],
    defaultStyle: { font: "Roboto", fontSize: 10, color: COLOR_TEXT, lineHeight: 1.25 },
    header: header(absenderzeile(ctx.firma), logo),
    footer: footer(ctx.firma),
    pageBreakBefore,
    content: [
      {
        margin: [0, 0, 0, 0],
        columns: [
          {
            id: "kunde",
            width: "*",
            stack: kundeAdresse(ctx.kunde).map((l, i) => ({
              text: l,
              fontSize: 10,
              bold: i === 0,
            })),
          },
          metaBox(meta, metaVariant),
        ],
        columnGap: 20,
      },
      { id: "titel", text: titel, fontSize: 22, bold: true, color: COLOR_TEXT, margin: [0, 30, 0, 14] },
      {
        stack: [
          { id: "anrede", text: anrede(ctx.kunde, ctx.ansprechpartner), margin: [0, 0, 0, 8] },
          { id: "intro", text: intro, margin: [0, 0, 0, 14] },
        ],
        unbreakable: true,
      },
      leistungstabelle(beleg.positionen, t, beleg.steuersatz),
      {
        id: "outro",
        stack: [
          { text: outro, margin: [0, 16, 0, 0] },
          { text: "Mit freundlichen Grüßen", margin: [0, 18, 0, 0] },
          ...signatur.map((s) => ({ text: s, margin: [0, 0, 0, 0], color: COLOR_MUTED })),
        ],
        unbreakable: true,
      },
    ],
  };
}

async function renderPdf(doc: unknown, hotspots: RuntimeHotspot[]): Promise<PdfBuildResult> {
  const pdfMake = await getPdfMake();
  const pdfDoc = pdfMake.createPdf(doc);
  const result: Blob | unknown = await new Promise<Blob>((resolve, reject) => {
    try {
      const ret = pdfDoc.getBlob((b: Blob) => resolve(b));
      if (ret && typeof (ret as Promise<Blob>).then === "function") {
        (ret as Promise<Blob>).then(resolve, reject);
      }
    } catch (err) {
      reject(err);
    }
  });
  const blob = result as Blob;
  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error("PDF konnte nicht erzeugt werden (leerer Blob).");
  }
  return { blob, hotspots };
}

function signaturFromFirma(f: Firmendaten): string[] {
  const lines: string[] = [];
  if (f.geschaeftsfuehrer) {
    lines.push(f.geschaeftsfuehrer);
    lines.push("Geschäftsführer");
  }
  return lines;
}

export async function generateAngebotPdf(
  angebot: Angebot,
  kunde: Kunde,
  firma: Firmendaten,
  ansprechpartner?: Ansprechpartner,
): Promise<PdfBuildResult> {
  const meta = [
    { label: "Angebot-Nr.", wert: angebot.nummer },
    { label: "Angebotsdatum", wert: dt(angebot.erstelltAm) },
    angebot.gueltigBis ? { label: "Gültig bis", wert: dt(angebot.gueltigBis) } : null,
  ].filter(Boolean) as { label: string; wert: string }[];
  const opts: BuildOptions = {
    intro: angebot.optionen?.eigenesIntro || angebot.introText,
    outro: angebot.optionen?.eigenesOutro || angebot.outroText,
    materialBereitgestellt: angebot.optionen?.materialBereitgestellt ?? true,
  };
  const effFirma = mergeFirma(firma, angebot.optionen?.firmaOverride);
  const tracker = createHotspotTracker(A4);
  const doc = await buildDoc(
    { firma: effFirma, kunde, ansprechpartner },
    `Angebot ${angebot.titel || ""}`.trim(),
    meta,
    "plain",
    { positionen: angebot.positionen, rabattGesamt: angebot.rabattGesamt, steuersatz: angebot.steuersatz },
    defaultIntroAngebot(angebot, opts),
    defaultOutroAngebot(angebot, opts),
    signaturFromFirma(effFirma),
    angebot.optionen?.logoOverride ?? null,
    tracker.pageBreakBefore,
  );
  const result = await renderPdf(doc, []);
  return { blob: result.blob, hotspots: tracker.build() };
}

export async function generateRechnungPdf(
  rechnung: Rechnung,
  kunde: Kunde,
  firma: Firmendaten,
  ansprechpartner?: Ansprechpartner,
): Promise<PdfBuildResult> {
  const meta = [
    { label: "Rechnung-Nr.", wert: rechnung.nummer },
    { label: "Rechnungsdatum", wert: dt(rechnung.rechnungsdatum) },
    { label: "Fällig am", wert: dt(rechnung.faelligkeitsdatum) },
  ];
  const opts: BuildOptions = {
    intro: rechnung.optionen?.eigenesIntro || rechnung.introText,
    outro: rechnung.optionen?.eigenesOutro || rechnung.outroText,
    materialBereitgestellt: rechnung.optionen?.materialBereitgestellt ?? true,
  };
  const effFirma = mergeFirma(firma, rechnung.optionen?.firmaOverride);
  const tracker = createHotspotTracker(A4);
  const doc = await buildDoc(
    { firma: effFirma, kunde, ansprechpartner },
    "Rechnung",
    meta,
    "box",
    { positionen: rechnung.positionen, rabattGesamt: rechnung.rabattGesamt, steuersatz: rechnung.steuersatz },
    defaultIntroRechnung(rechnung, opts),
    defaultOutroRechnung(rechnung, opts),
    signaturFromFirma(effFirma),
    rechnung.optionen?.logoOverride ?? null,
    tracker.pageBreakBefore,
  );
  const result = await renderPdf(doc, []);
  return { blob: result.blob, hotspots: tracker.build() };
}
