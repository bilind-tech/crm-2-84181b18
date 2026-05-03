// PDF-Generator für Angebote und Rechnungen.
// Layout 1:1 nach My-Clean-Center-Vorlage: schwarz/weiß, dünne graue Linien,
// Logo rechts oben, kompakter 4-spaltiger Footer.

import type { Angebot, Rechnung, Position, Kunde, Firmendaten, Ansprechpartner } from "@/lib/api/types";
import logoUrl from "@/assets/logo.png";
import { A4, createHotspotTracker, type RuntimeHotspot } from "./hotspotTracker";

// ───────── Mock-LRU-Cache (nur Lovable-Preview) ────────────────────────────
// Im Pi-Backend übernimmt der Disk-Cache (`backend/src/pdf/cache.ts`) diese
// Aufgabe. Hier vermeidet der LRU rein clientseitig wiederholtes pdfmake-
// Rendern, wenn dieselbe Beleg-Version mehrfach geöffnet wird.
const PDF_LRU_MAX = 50;
const pdfLru = new Map<string, { blob: Blob; hotspots: RuntimeHotspot[] }>();

const VOLATILE_PDF_KEYS = new Set(["aktualisiertAm", "updatedAt", "erstelltAm", "createdAt", "geaendertAm"]);
function semanticPdfKey(parts: unknown[]): string {
  return JSON.stringify(parts, (k, v) => (VOLATILE_PDF_KEYS.has(k) ? undefined : v));
}
function lruGet(key: string): { blob: Blob; hotspots: RuntimeHotspot[] } | null {
  const v = pdfLru.get(key);
  if (!v) return null;
  pdfLru.delete(key); pdfLru.set(key, v); // refresh recency
  return v;
}
function lruSet(key: string, value: { blob: Blob; hotspots: RuntimeHotspot[] }): void {
  pdfLru.set(key, value);
  while (pdfLru.size > PDF_LRU_MAX) {
    const firstKey = pdfLru.keys().next().value;
    if (firstKey === undefined) break;
    pdfLru.delete(firstKey);
  }
}

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

function header(firma: Firmendaten, logo: string | null) {
  return {
    margin: [55, 30, 55, 0] as [number, number, number, number],
    columns: [
      {
        width: "*",
        stack: [
          { text: absenderzeile(firma), fontSize: 8, color: COLOR_TEXT, decoration: "underline", margin: [0, 50, 0, 0] },
        ],
      },
      logo
        ? { width: 270, image: logo, fit: [270, 120], alignment: "right" }
        : { width: 270, text: (firma.firmenname || "MY CLEAN CENTER").toUpperCase(), bold: true, fontSize: 20, color: COLOR_TEXT, alignment: "right" },
    ],
  };
}

function footer(firma: Firmendaten) {
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

// ───────── Tabelle (4 Spalten, voller Rahmen — exakt nach Vorlage) ────────

function stundenText(p: Position): string {
  if (p.modus === "pauschal") return "";
  const menge = p.menge.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${menge} ${p.einheit}`;
}
function abrechnungsartText(p: Position): string {
  if (p.ausfuehrung && p.ausfuehrung.trim()) return p.ausfuehrung;
  if (p.modus === "pauschal") return "Pauschal";
  return `à ${eur(p.einzelpreisNetto)}`;
}

function leistungstabelle(positionen: Position[], totalsT: { netto: number; steuer: number; brutto: number }, steuersatz: number) {
  const headerRow = [
    { text: "Leistung", bold: true, fontSize: 10, color: COLOR_TEXT, margin: [0, 4, 0, 4] },
    { text: "Stunden", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "center", margin: [0, 4, 0, 4] },
    { text: "Abrechnungsart", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "center", margin: [0, 4, 0, 4] },
    { text: "Preis ohne MwSt.", bold: true, fontSize: 10, color: COLOR_TEXT, alignment: "right", margin: [0, 4, 0, 4] },
  ];
  const body: unknown[][] = [headerRow];
  positionen.forEach((p) => {
    body.push([
      { stack: [beschreibungBlock(p.beschreibung || "")], id: `pos:${p.id}` },
      { text: stundenText(p), fontSize: 10, alignment: "center" },
      { text: abrechnungsartText(p), fontSize: 10, alignment: "center" },
      { text: eur(summe(p)), fontSize: 10, alignment: "right" },
    ]);
  });
  body.push([
    { text: `Zzgl. gesetzlicher Mehrwertsteuer ${steuersatz}%`, colSpan: 3, fontSize: 10 },
    {},
    {},
    { text: eur(totalsT.steuer), fontSize: 10, alignment: "right" },
  ]);
  body.push([
    { text: "Gesamtbetrag inkl. MwSt.", colSpan: 3, fontSize: 10, bold: true },
    {},
    {},
    { text: eur(totalsT.brutto), fontSize: 10, alignment: "right", bold: true },
  ]);
  return {
    id: "tabelle",
    table: {
      headerRows: 1,
      keepWithHeaderRows: 1,
      dontBreakRows: true,
      widths: ["*", 60, 90, 85],
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

// ───────── Meta-Box ────────────────────────────────────────────────────────

function metaBox(meta: { label: string; wert: string }[], variant: "box" | "plain", headerNote?: string) {
  if (variant === "plain") {
    return {
      id: "meta",
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
  const dividerIndex = noteRowsCount; // Linie zwischen Note und Daten
  return {
    id: "meta",
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

// ───────── Doc-Bauer ───────────────────────────────────────────────────────

interface BuildOptions {
  intro?: string;
  outro?: string;
  materialBereitgestellt?: boolean;
}

export function defaultIntroAngebot(a: Angebot, opts: BuildOptions = {}) {
  if (opts.intro) return opts.intro;
  return `gerne unterbreiten wir Ihnen ein Angebot für „${a.titel}" und folgende Leistungen:`;
}
export function defaultOutroAngebot(a: Angebot, opts: BuildOptions = {}) {
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
export function defaultIntroRechnung(_r: Rechnung, opts: BuildOptions = {}) {
  if (opts.intro) return opts.intro;
  return `hiermit übersenden wir Ihnen die Rechnung für folgende Leistungen:`;
}
export function defaultOutroRechnung(_r: Rechnung, opts: BuildOptions = {}) {
  if (opts.outro) return opts.outro;
  const teile = [
    "Vielen Dank für Ihren Auftrag.",
    opts.materialBereitgestellt
      ? "Zugunsten der Reinigung werden Reinigungswerkzeuge und Reinigungsmittel von uns zur Verfügung gestellt."
      : null,
  ].filter(Boolean);
  return teile.join("\n\n");
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

async function resolveLogo(firma: Firmendaten, override: string | null): Promise<string | null> {
  if (override) return override;
  if (firma.logoUrl && firma.logoUrl.trim()) return firma.logoUrl;
  return await logoDataUrl();
}

async function buildDoc(
  ctx: PdfContext,
  titel: string,
  meta: { label: string; wert: string }[],
  metaVariant: "box" | "plain",
  metaNote: string | undefined,
  beleg: { positionen: Position[]; rabattGesamt: number; steuersatz: number },
  intro: string,
  outro: string,
  signatur: string[],
  logoOverride: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pageBreakBefore?: (currentNode: any) => boolean,
) {
  const logo = await resolveLogo(ctx.firma, logoOverride);
  const t = totals(beleg.positionen, beleg.rabattGesamt, beleg.steuersatz);
  return {
    pageSize: "A4" as const,
    pageMargins: [55, 155, 55, 100] as [number, number, number, number],
    defaultStyle: { font: "Roboto", fontSize: 10, color: COLOR_TEXT, lineHeight: 1.25 },
    header: header(ctx.firma, logo),
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
          metaBox(meta, metaVariant, metaNote),
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
  const cacheKey = "a:" + angebot.id + ":" + semanticPdfKey([angebot, kunde, firma, ansprechpartner ?? null]);
  const cached = lruGet(cacheKey);
  if (cached) return cached;
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
    undefined,
    { positionen: angebot.positionen, rabattGesamt: angebot.rabattGesamt, steuersatz: angebot.steuersatz },
    defaultIntroAngebot(angebot, opts),
    defaultOutroAngebot(angebot, opts),
    signaturFromFirma(effFirma),
    angebot.optionen?.logoOverride ?? null,
    tracker.pageBreakBefore,
  );
  const result = await renderPdf(doc, []);
  const out = { blob: result.blob, hotspots: tracker.build() };
  lruSet(cacheKey, out);
  return out;
}

export async function generateRechnungPdf(
  rechnung: Rechnung,
  kunde: Kunde,
  firma: Firmendaten,
  ansprechpartner?: Ansprechpartner,
): Promise<PdfBuildResult> {
  const cacheKey = "r:" + rechnung.id + ":" + semanticPdfKey([rechnung, kunde, firma, ansprechpartner ?? null]);
  const cached = lruGet(cacheKey);
  if (cached) return cached;
  const meta = [
    { label: "Rechnungsdatum:", wert: dt(rechnung.rechnungsdatum) },
  ];
  const opts: BuildOptions = {
    intro: rechnung.optionen?.eigenesIntro || rechnung.introText,
    outro: rechnung.optionen?.eigenesOutro || rechnung.outroText,
    materialBereitgestellt: rechnung.optionen?.materialBereitgestellt ?? true,
  };
  const effFirma = mergeFirma(firma, rechnung.optionen?.firmaOverride);
  const tracker = createHotspotTracker(A4);
  const t = totals(rechnung.positionen, rechnung.rabattGesamt, rechnung.steuersatz);
  // Tage zwischen Rechnungsdatum und Fälligkeit
  let tage = 14;
  if (rechnung.rechnungsdatum && rechnung.faelligkeitsdatum) {
    const d1 = new Date(rechnung.rechnungsdatum).getTime();
    const d2 = new Date(rechnung.faelligkeitsdatum).getTime();
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    if (diff > 0) tage = diff;
  }
  const zahlungsSatz = `Wir möchten Sie bitten, den Rechnungsbetrag in Höhe von ${eur(t.brutto)} innerhalb von ${tage} Tagen nach Rechnungszustellung auf unser unten genanntes Bankkonto zu überweisen.`;
  const baseOutro = opts.outro ? opts.outro : zahlungsSatz;
  const fullOutro = opts.outro
    ? baseOutro
    : [zahlungsSatz, opts.materialBereitgestellt ? "Zugunsten der Reinigung werden Reinigungswerkzeuge und Reinigungsmittel von uns zur Verfügung gestellt." : null].filter(Boolean).join("\n\n");
  const headerNote = "Bei Zahlung bitte\ndie Rechnungs-Nr. angeben";
  const doc = await buildDoc(
    { firma: effFirma, kunde, ansprechpartner },
    "Rechnung",
    meta,
    "box",
    headerNote,
    { positionen: rechnung.positionen, rabattGesamt: rechnung.rabattGesamt, steuersatz: rechnung.steuersatz },
    defaultIntroRechnung(rechnung, opts),
    fullOutro,
    signaturFromFirma(effFirma),
    rechnung.optionen?.logoOverride ?? null,
    tracker.pageBreakBefore,
  );
  const result = await renderPdf(doc, []);
  const out = { blob: result.blob, hotspots: tracker.build() };
  lruSet(cacheKey, out);
  return out;
}
