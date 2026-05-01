// PDF-Generator für Angebote und Rechnungen.
// Layout angelehnt an die Mustervorlage von My Clean Center GmbH.
// pdfmake läuft rein im Browser (kein Server-Roundtrip nötig).

import type { Angebot, Rechnung, Position, Kunde, Firmendaten, Ansprechpartner } from "@/lib/api/types";
import logoUrl from "@/assets/logo.png";

// pdfmake-Typen sind unvollständig — wir benutzen any-Cast, um Layout-Definitionen frei zu halten.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPdfMake = any;
let pdfMakeInstance: AnyPdfMake = null;

async function getPdfMake(): Promise<AnyPdfMake> {
  if (pdfMakeInstance) return pdfMakeInstance;
  // Dynamische Imports — pdfmake darf nicht im SSR-Bundle landen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pm: any = (await import("pdfmake/build/pdfmake")).default;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vfs: any = await import("pdfmake/build/vfs_fonts");
  const vfsData = vfs?.default?.vfs ?? vfs?.vfs ?? vfs?.pdfMake?.vfs ?? vfs?.default?.pdfMake?.vfs;
  if (vfsData) pm.vfs = vfsData;
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

function eur(n: number) {
  return n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });
}
function dt(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function summe(p: Position) {
  if (p.modus === "pauschal") {
    return (p.pauschalpreisNetto ?? 0) * (1 - p.rabatt / 100);
  }
  return p.menge * p.einzelpreisNetto * (1 - p.rabatt / 100);
}
function totals(positionen: Position[], rabattGesamt: number, steuersatz: number) {
  const nettoRoh = positionen.reduce((s, p) => s + summe(p), 0);
  const netto = nettoRoh * (1 - rabattGesamt / 100);
  const steuer = netto * (steuersatz / 100);
  return { netto, steuer, brutto: netto + steuer };
}

/** Wandelt einen Beschreibungstext in pdfmake-Stack: Erste Nicht-Bullet-Zeile fett, Bullets als Liste. */
function beschreibungBlock(text: string): unknown {
  const zeilen = text.split("\n");
  const items: unknown[] = [];
  const bullets: string[] = [];
  let titel: string | null = null;
  for (const z of zeilen) {
    const t = z.trim();
    if (!t) continue;
    const bm = t.match(/^[•\-*]\s+(.*)$/);
    if (bm) {
      bullets.push(bm[1]);
    } else if (!titel && bullets.length === 0) {
      titel = t;
    } else {
      // Zwischenzeile ohne Bullet → als eigene Bullet-freie Zeile
      bullets.push(t);
    }
  }
  if (titel) items.push({ text: titel, fontSize: 9, bold: true, margin: [0, 0, 0, 2] });
  if (bullets.length > 0) {
    items.push({ ul: bullets.map((b) => ({ text: b, fontSize: 9 })), margin: [0, 0, 0, 0] });
  } else if (!titel) {
    items.push({ text, fontSize: 9 });
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

interface PdfContext {
  firma: Firmendaten;
  kunde: Kunde;
  ansprechpartner?: Ansprechpartner;
}

function header(absenderzeile: string, logo: string | null) {
  return {
    margin: [40, 30, 40, 0] as [number, number, number, number],
    columns: [
      logo
        ? { image: logo, width: 110, margin: [0, 0, 0, 0] as [number, number, number, number] }
        : { text: "MY CLEAN CENTER", bold: true, fontSize: 18, color: "#1e3a8a" },
      {
        text: absenderzeile,
        alignment: "right" as const,
        fontSize: 8,
        color: "#475569",
        margin: [0, 24, 0, 0] as [number, number, number, number],
      },
    ],
  };
}

function footer(firma: Firmendaten) {
  return function () {
    return {
      margin: [40, 0, 40, 20] as [number, number, number, number],
      columns: [
        {
          stack: [
            { text: firma.firmenname, bold: true, fontSize: 8 },
            { text: firma.strasse ?? "", fontSize: 7 },
            { text: `${firma.plz ?? ""} ${firma.ort ?? ""}`, fontSize: 7 },
          ],
        },
        {
          stack: [
            { text: "Bankverbindung", bold: true, fontSize: 8 },
            { text: firma.bankName ?? "", fontSize: 7 },
            { text: `IBAN: ${firma.iban ?? ""}`, fontSize: 7 },
            { text: `BIC: ${firma.bic ?? ""}`, fontSize: 7 },
          ],
        },
        {
          stack: [
            { text: "Kontakt", bold: true, fontSize: 8 },
            { text: `Tel: ${firma.telefon ?? ""}`, fontSize: 7 },
            { text: firma.email ?? "", fontSize: 7 },
            { text: firma.webseite ?? "", fontSize: 7 },
          ],
        },
        {
          stack: [
            { text: "Steuer & Register", bold: true, fontSize: 8 },
            { text: `USt-IdNr.: ${firma.ustId ?? ""}`, fontSize: 7 },
            { text: firma.handelsregister ?? "", fontSize: 7 },
            { text: `GF: ${firma.geschaeftsfuehrer ?? ""}`, fontSize: 7 },
          ],
        },
      ],
      columnGap: 14,
      color: "#64748b",
    };
  };
}

function leistungstabelle(positionen: Position[]) {
  const hatPauschal = positionen.some((p) => p.modus === "pauschal");

  if (hatPauschal) {
    // Layout im Stil des Beispiels: Ausführung | Leistung | Preis
    const body: unknown[][] = [
      [
        { text: "Ausführung", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9 },
        { text: "Leistung", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9 },
        { text: "Preis", bold: true, fillColor: "#1e3a8a", color: "#fff", fontSize: 9, alignment: "right" },
      ],
    ];
    positionen.forEach((p) => {
      const ausf =
        p.ausfuehrung ??
        (p.modus === "pauschal"
          ? "Pauschal"
          : `${p.menge.toLocaleString("de-DE")} ${p.einheit}`);
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

  // Klassisches Layout (alle Positionen sind Einzelpositionen)
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

function absenderzeile(f: Firmendaten) {
  return `${f.firmenname} · ${f.strasse ?? ""} · ${f.plz ?? ""} ${f.ort ?? ""}`;
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

interface BuildOptions {
  intro?: string;
  outro?: string;
  materialBereitgestellt?: boolean;
}

function defaultIntroAngebot(a: Angebot, opts: BuildOptions) {
  if (opts.intro) return opts.intro;
  return `vielen Dank für Ihre Anfrage. Wir freuen uns, Ihnen folgendes Angebot „${a.titel}" unterbreiten zu dürfen:`;
}
function defaultOutroAngebot(a: Angebot, opts: BuildOptions) {
  if (opts.outro) return opts.outro;
  const teile = [
    a.gueltigBis ? `Dieses Angebot ist gültig bis ${dt(a.gueltigBis)}.` : null,
    opts.materialBereitgestellt
      ? "Zugunsten der Reinigung werden Reinigungswerkzeuge und Reinigungsmittel von uns zur Verfügung gestellt."
      : null,
    "Wir freuen uns auf Ihre Rückmeldung.",
    "Mit freundlichen Grüßen",
  ].filter(Boolean);
  return teile.join("\n\n");
}

function defaultIntroRechnung(r: Rechnung, opts: BuildOptions) {
  if (opts.intro) return opts.intro;
  return `wir bedanken uns für Ihren Auftrag und stellen die folgenden Leistungen in Rechnung:`;
}
function defaultOutroRechnung(r: Rechnung, opts: BuildOptions) {
  if (opts.outro) return opts.outro;
  const teile = [
    `Bitte überweisen Sie den Rechnungsbetrag bis zum ${dt(r.faelligkeitsdatum)} auf das untenstehende Konto.`,
    opts.materialBereitgestellt
      ? "Zugunsten der Reinigung werden Reinigungswerkzeuge und Reinigungsmittel von uns zur Verfügung gestellt."
      : null,
    "Mit freundlichen Grüßen",
  ].filter(Boolean);
  return teile.join("\n\n");
}

async function buildDoc(
  ctx: PdfContext,
  titel: string,
  meta: { label: string; wert: string }[],
  beleg: { positionen: Position[]; rabattGesamt: number; steuersatz: number },
  intro: string,
  outro: string,
) {
  const logo = await logoDataUrl();
  const t = totals(beleg.positionen, beleg.rabattGesamt, beleg.steuersatz);
  return {
    pageSize: "A4" as const,
    pageMargins: [40, 90, 40, 110] as [number, number, number, number],
    defaultStyle: { font: "Roboto", fontSize: 10, color: "#0f172a" },
    header: header(absenderzeile(ctx.firma), logo),
    footer: footer(ctx.firma),
    content: [
      {
        margin: [0, 10, 0, 0],
        columns: [
          {
            stack: [
              { text: absenderzeile(ctx.firma), fontSize: 7, color: "#64748b", decoration: "underline" },
              { text: "\n" },
              ...kundeAdresse(ctx.kunde).map((l) => ({ text: l, fontSize: 10 })),
            ],
          },
          {
            width: 200,
            stack: meta.map((m) => ({
              columns: [
                { text: m.label, fontSize: 9, color: "#64748b" },
                { text: m.wert, fontSize: 9, alignment: "right", bold: true },
              ],
              margin: [0, 1, 0, 1] as [number, number, number, number],
            })),
          },
        ],
      },
      { text: titel, fontSize: 18, bold: true, color: "#1e3a8a", margin: [0, 24, 0, 12] },
      { text: anrede(ctx.kunde, ctx.ansprechpartner), margin: [0, 0, 0, 8] },
      { text: intro, margin: [0, 0, 0, 14] },
      leistungstabelle(beleg.positionen),
      summenBlock(t, beleg.steuersatz),
      { text: outro, margin: [0, 20, 0, 0] },
      { text: ctx.firma.geschaeftsfuehrer ?? "", margin: [0, 24, 0, 0], italics: true },
    ],
  };
}

export async function generateAngebotPdf(angebot: Angebot, kunde: Kunde, firma: Firmendaten, ansprechpartner?: Ansprechpartner): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const meta = [
    { label: "Angebot-Nr.", wert: angebot.nummer },
    { label: "Datum", wert: dt(angebot.erstelltAm) },
    angebot.gueltigBis ? { label: "Gültig bis", wert: dt(angebot.gueltigBis) } : null,
    { label: "Kunden-Nr.", wert: kunde.nummer },
  ].filter(Boolean) as { label: string; wert: string }[];
  const opts: BuildOptions = {
    intro: angebot.optionen?.eigenesIntro || angebot.introText,
    outro: angebot.optionen?.eigenesOutro || angebot.outroText,
    materialBereitgestellt: angebot.optionen?.materialBereitgestellt ?? true,
  };
  const doc = await buildDoc(
    { firma, kunde, ansprechpartner },
    `Angebot ${angebot.nummer}`,
    meta,
    { positionen: angebot.positionen, rabattGesamt: angebot.rabattGesamt, steuersatz: angebot.steuersatz },
    defaultIntroAngebot(angebot, opts),
    defaultOutroAngebot(angebot, opts),
  );
  return new Promise<Blob>((resolve) => {
    pdfMake.createPdf(doc).getBlob((blob: Blob) => resolve(blob));
  });
}

export async function generateRechnungPdf(rechnung: Rechnung, kunde: Kunde, firma: Firmendaten, ansprechpartner?: Ansprechpartner): Promise<Blob> {
  const pdfMake = await getPdfMake();
  const meta = [
    { label: "Rechnung-Nr.", wert: rechnung.nummer },
    { label: "Rechnungsdatum", wert: dt(rechnung.rechnungsdatum) },
    { label: "Fällig am", wert: dt(rechnung.faelligkeitsdatum) },
    { label: "Kunden-Nr.", wert: kunde.nummer },
  ];
  const opts: BuildOptions = {
    intro: rechnung.optionen?.eigenesIntro || rechnung.introText,
    outro: rechnung.optionen?.eigenesOutro || rechnung.outroText,
    materialBereitgestellt: rechnung.optionen?.materialBereitgestellt ?? true,
  };
  const doc = await buildDoc(
    { firma, kunde, ansprechpartner },
    `Rechnung ${rechnung.nummer}`,
    meta,
    { positionen: rechnung.positionen, rabattGesamt: rechnung.rabattGesamt, steuersatz: rechnung.steuersatz },
    defaultIntroRechnung(rechnung, opts),
    defaultOutroRechnung(rechnung, opts),
  );
  return new Promise<Blob>((resolve) => {
    pdfMake.createPdf(doc).getBlob((blob: Blob) => resolve(blob));
  });
}
