// Werkzeug-PDFs: schlanke Stub-Layouts mit pdfmake.
// Echtes Layout passiert, sobald die Original-Vorlagen vorliegen — das hier
// liefert sofort ein verwendbares, sauberes Protokoll im My-Clean-Center-Look.

import logoUrl from "@/assets/logo.png";
import type { Firmendaten, Kunde, Objekt } from "@/lib/api/types";

// pdfmake hat unvollständige Typen — wir nutzen any-Casts wie in belegPdf.ts.
/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyPdfMake = any;
let pdfMakeInstance: AnyPdfMake = null;

async function getPdfMake(): Promise<AnyPdfMake> {
  if (pdfMakeInstance) return pdfMakeInstance;
  const pmMod: any = await import("pdfmake/build/pdfmake");
  const pm: AnyPdfMake = pmMod?.default ?? pmMod;
  const vfsMod: any = await import("pdfmake/build/vfs_fonts");
  const vfsData =
    vfsMod?.default?.vfs ??
    vfsMod?.vfs ??
    vfsMod?.pdfMake?.vfs ??
    vfsMod?.default?.pdfMake?.vfs ??
    (vfsMod?.default && typeof vfsMod.default === "object"
      ? vfsMod.default
      : null) ??
    (typeof vfsMod === "object" && !("default" in vfsMod) ? vfsMod : null);
  if (vfsData) {
    if (typeof pm.addVirtualFileSystem === "function")
      pm.addVirtualFileSystem(vfsData);
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

export function kundeName(k?: Kunde): string {
  if (!k) return "—";
  if (k.typ === "firma" && k.firmenname) return k.firmenname;
  return [k.vorname, k.nachname].filter(Boolean).join(" ") || k.nummer;
}

function kundenBlock(k?: Kunde, o?: Objekt): string {
  if (!k) return "";
  const lines: string[] = [kundeName(k)];
  if (o) lines.push(`Objekt: ${o.name}`);
  const adr = o
    ? [o.strasse, [o.plz, o.ort].filter(Boolean).join(" ")]
    : [k.strasse, [k.plz, k.ort].filter(Boolean).join(" ")];
  for (const l of adr) if (l) lines.push(l);
  return lines.join("\n");
}

function firmaBlock(f?: Firmendaten): string {
  if (!f) return "";
  const lines = [
    f.firmenname,
    f.strasse,
    [f.plz, f.ort].filter(Boolean).join(" "),
    f.telefon ? `Tel: ${f.telefon}` : "",
    f.email ?? "",
  ].filter(Boolean);
  return lines.join("\n");
}

const sharedStyles = {
  h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
  meta: { fontSize: 9, color: "#666" },
  label: { fontSize: 9, color: "#666", margin: [0, 6, 0, 2] as [number, number, number, number] },
  block: { fontSize: 10, lineHeight: 1.3 },
  sectionTitle: {
    fontSize: 11,
    bold: true,
    margin: [0, 12, 0, 6] as [number, number, number, number],
  },
};

async function buildHeader(titel: string, untertitel: string, firma?: Firmendaten) {
  const logo = await logoDataUrl();
  return {
    columns: [
      {
        width: "*",
        stack: [
          { text: titel, style: "h1" },
          { text: untertitel, style: "meta" },
        ],
      },
      logo
        ? { image: logo, width: 90, alignment: "right" as const }
        : {
            width: 90,
            text: firma?.firmenname ?? "",
            alignment: "right" as const,
            bold: true,
          },
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Übergabe-/Abnahmeprotokoll
// ─────────────────────────────────────────────────────────────────────────────

export type ProtokollArt = "uebergabe" | "abnahme" | "beides";

export interface UebergabeprotokollData {
  art: ProtokollArt;
  datum: string; // YYYY-MM-DD
  uhrzeit: string; // HH:MM
  vertreterAuftraggeber: string;
  vertreterAuftragnehmer: string;
  leistungsumfang: string;
  bemerkungen: string;
  ohneVorbehalt: boolean;
  kunde?: Kunde;
  objekt?: Objekt;
  firma?: Firmendaten;
}

const PROTOKOLL_ART_LABEL: Record<ProtokollArt, string> = {
  uebergabe: "Übergabeprotokoll",
  abnahme: "Abnahmeprotokoll",
  beides: "Übergabe- und Abnahmeprotokoll",
};

export async function generateUebergabeprotokollPdf(
  data: UebergabeprotokollData,
): Promise<Blob> {
  const titel = PROTOKOLL_ART_LABEL[data.art];
  const header = await buildHeader(
    titel,
    `Datum: ${formatDatum(data.datum)} · Uhrzeit: ${data.uhrzeit}`,
    data.firma,
  );

  const doc = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 60],
    content: [
      header,
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: "Auftragnehmer", style: "label" },
              { text: firmaBlock(data.firma), style: "block" },
            ],
          },
          {
            width: "*",
            stack: [
              { text: "Auftraggeber", style: "label" },
              { text: kundenBlock(data.kunde, data.objekt), style: "block" },
            ],
          },
        ],
        columnGap: 16,
      },
      { text: "Leistungsumfang", style: "sectionTitle" },
      { text: data.leistungsumfang || "—", style: "block" },
      { text: "Mängel / Bemerkungen", style: "sectionTitle" },
      { text: data.bemerkungen || "Keine.", style: "block" },
      { text: "Ergebnis", style: "sectionTitle" },
      {
        text: data.ohneVorbehalt
          ? "Die Leistung wird ohne Vorbehalt abgenommen."
          : "Die Leistung wird mit den oben genannten Vorbehalten / Mängeln abgenommen.",
        style: "block",
      },
      { text: "Anwesende Personen", style: "sectionTitle" },
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: "Auftraggeber", style: "label" },
              {
                text: data.vertreterAuftraggeber || "—",
                style: "block",
                margin: [0, 0, 0, 30],
              },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5 }] },
              { text: "Unterschrift Auftraggeber", style: "meta" },
            ],
          },
          {
            width: "*",
            stack: [
              { text: "Auftragnehmer", style: "label" },
              {
                text: data.vertreterAuftragnehmer || "—",
                style: "block",
                margin: [0, 0, 0, 30],
              },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5 }] },
              { text: "Unterschrift Auftragnehmer", style: "meta" },
            ],
          },
        ],
        columnGap: 24,
      },
    ],
    styles: sharedStyles,
    defaultStyle: { fontSize: 10, color: "#111" },
  };

  return await renderToBlob(doc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Schlüsselübergabe
// ─────────────────────────────────────────────────────────────────────────────

export type SchluesselRichtung = "ausgabe" | "ruecknahme";

export interface SchluesselZeile {
  bezeichnung: string;
  anzahl: number;
  schluesselNr: string;
  bemerkung: string;
}

export interface SchluesseluebergabeData {
  richtung: SchluesselRichtung;
  datum: string;
  uhrzeit: string;
  schluessel: SchluesselZeile[];
  pfandEur?: number;
  vertreterAuftraggeber: string;
  vertreterAuftragnehmer: string;
  bestaetigt: boolean;
  kunde?: Kunde;
  objekt?: Objekt;
  firma?: Firmendaten;
}

export async function generateSchluesseluebergabePdf(
  data: SchluesseluebergabeData,
): Promise<Blob> {
  const titel =
    data.richtung === "ausgabe"
      ? "Schlüsselübergabe — Ausgabe"
      : "Schlüsselübergabe — Rücknahme";
  const header = await buildHeader(
    titel,
    `Datum: ${formatDatum(data.datum)} · Uhrzeit: ${data.uhrzeit}`,
    data.firma,
  );

  const tabelle = {
    table: {
      headerRows: 1,
      widths: ["*", 40, 80, "*"],
      body: [
        [
          { text: "Bezeichnung", bold: true },
          { text: "Anzahl", bold: true, alignment: "right" as const },
          { text: "Schlüssel-Nr.", bold: true },
          { text: "Bemerkung", bold: true },
        ],
        ...(data.schluessel.length > 0
          ? data.schluessel
          : [
              {
                bezeichnung: "—",
                anzahl: 0,
                schluesselNr: "",
                bemerkung: "",
              } as SchluesselZeile,
            ]
        ).map((z) => [
          z.bezeichnung || "—",
          { text: String(z.anzahl ?? 0), alignment: "right" as const },
          z.schluesselNr || "—",
          z.bemerkung || "",
        ]),
      ],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0,
      hLineColor: () => "#ccc",
    },
    margin: [0, 6, 0, 0] as [number, number, number, number],
  };

  const doc = {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 60],
    content: [
      header,
      {
        columns: [
          {
            width: "*",
            stack: [
              { text: "Auftragnehmer", style: "label" },
              { text: firmaBlock(data.firma), style: "block" },
            ],
          },
          {
            width: "*",
            stack: [
              { text: "Auftraggeber", style: "label" },
              { text: kundenBlock(data.kunde, data.objekt), style: "block" },
            ],
          },
        ],
        columnGap: 16,
      },
      { text: "Übergebene Schlüssel", style: "sectionTitle" },
      tabelle,
      data.pfandEur && data.pfandEur > 0
        ? {
            text: `Hinterlegtes Pfand: ${data.pfandEur.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR`,
            style: "block",
            margin: [0, 8, 0, 0],
          }
        : { text: "" },
      { text: "Bestätigung", style: "sectionTitle" },
      {
        text: data.bestaetigt
          ? data.richtung === "ausgabe"
            ? "Der Auftraggeber bestätigt den Erhalt der oben genannten Schlüssel."
            : "Der Auftragnehmer bestätigt die Rückgabe der oben genannten Schlüssel."
          : "Empfang/Rückgabe noch nicht bestätigt.",
        style: "block",
      },
      { text: " ", margin: [0, 12, 0, 0] },
      {
        columns: [
          {
            width: "*",
            stack: [
              {
                text: data.vertreterAuftraggeber || "—",
                style: "block",
                margin: [0, 0, 0, 30],
              },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5 }] },
              { text: "Unterschrift Auftraggeber", style: "meta" },
            ],
          },
          {
            width: "*",
            stack: [
              {
                text: data.vertreterAuftragnehmer || "—",
                style: "block",
                margin: [0, 0, 0, 30],
              },
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.5 }] },
              { text: "Unterschrift Auftragnehmer", style: "meta" },
            ],
          },
        ],
        columnGap: 24,
      },
    ],
    styles: sharedStyles,
    defaultStyle: { fontSize: 10, color: "#111" },
  };

  return await renderToBlob(doc);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function renderToBlob(doc: any): Promise<Blob> {
  const pm = await getPdfMake();
  const pdfDoc = pm.createPdf(doc);
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
  return blob;
}

function formatDatum(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
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

export function safeFilename(s: string): string {
  return s
    .replace(/[ä]/gi, "ae")
    .replace(/[ö]/gi, "oe")
    .replace(/[ü]/gi, "ue")
    .replace(/[ß]/gi, "ss")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}
