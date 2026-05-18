// Backend-Port der Mahn-Regeln (1:1 zu src/lib/mahnung/regeln.ts).
// Kanonische Quelle der Wahrheit für die Mahn-Automatik.
import type { ApiRechnung } from "../belege/mappers.js";

export type MahnStufe = 1 | 2 | 3;

export interface MahnStufeConfig {
  stufe: MahnStufe;
  bezeichnung: string;
  tageNachVorgaenger: number;
  gebuehr: number;
  fristTage: number;
  emailVorlageId?: string | null;
}

export interface MahnEinstellungenBackend {
  modus: "aus" | "vorschlag" | "auto";
  cronZeit: string;
  nurAnWerktagen: boolean;
  benachrichtigungBeiVorschlag: boolean;
  benachrichtigungBeiAutoversand: boolean;
  stufen: MahnStufeConfig[];
}

export interface MahnVorgang {
  stufe: number;
  versendetAm: string;
  neueFrist: string;
  gebuehr: number;
  emailVersandId?: string | null;
}

export interface MahnZustand {
  istMahnfaehig: boolean;
  tageUeberfaellig: number;
  letzteVersendeteStufe: 0 | MahnStufe;
  empfohleneStufe: MahnStufe | null;
  istInkassoReif: boolean;
  istPausiert: boolean;
  pausiertBis?: string;
  offenEUR: number;
  letzteFrist?: string;
}

function tageDifferenz(a: string, b: string): number {
  const dA = new Date(a + "T00:00:00").getTime();
  const dB = new Date(b + "T00:00:00").getTime();
  return Math.round((dA - dB) / 86_400_000);
}

export function heuteISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function summeBruttoEUR(r: ApiRechnung): number {
  let netto = 0;
  let brutto = 0;
  const rabattGesamt = r.rabattGesamt ?? 0;
  for (const p of r.positionen ?? []) {
    const nettoBase =
      p.modus === "pauschal" && p.pauschalpreisNetto != null
        ? p.pauschalpreisNetto
        : p.menge * p.einzelpreisNetto;
    const nachPos = nettoBase * (1 - (p.rabatt || 0) / 100);
    const nachGes = nachPos * (1 - rabattGesamt / 100);
    netto += nachGes;
    brutto += nachGes * (1 + (p.steuersatz || 0) / 100);
  }
  return Math.round(brutto * 100) / 100;
}

export function bestimmeMahnZustand(
  rechnung: ApiRechnung,
  einstellungen: MahnEinstellungenBackend,
  heute: string = heuteISO(),
): MahnZustand {
  const brutto = summeBruttoEUR(rechnung);
  const bezahlt = (rechnung.zahlungen ?? []).reduce((acc, z) => acc + (z.betrag || 0), 0);
  const offen = Math.max(0, brutto - bezahlt);
  const tageUeberfaellig = tageDifferenz(heute, rechnung.faelligkeitsdatum);

  const istMahnfaehig =
    rechnung.status !== "entwurf" &&
    rechnung.status !== "storniert" &&
    rechnung.status !== "bezahlt" &&
    offen > 0.005;

  const mahnungen = ((rechnung.mahnungen as MahnVorgang[] | undefined) ?? [])
    .slice()
    .sort((a, b) => a.stufe - b.stufe);
  const letzte = mahnungen[mahnungen.length - 1];
  const letzteVersendeteStufe = (letzte?.stufe ?? 0) as 0 | MahnStufe;

  const istInkassoReif = letzteVersendeteStufe === 3;
  const istPausiert = !!(rechnung.mahnPausiertBis && rechnung.mahnPausiertBis > heute);

  let empfohleneStufe: MahnStufe | null = null;
  if (istMahnfaehig && !istInkassoReif && !istPausiert) {
    const naechsteStufe = (letzteVersendeteStufe + 1) as MahnStufe;
    const config = einstellungen.stufen.find((c) => c.stufe === naechsteStufe);
    if (config) {
      const referenzDatum = letzte?.neueFrist ?? rechnung.faelligkeitsdatum;
      const tageSeitReferenz = tageDifferenz(heute, referenzDatum);
      if (naechsteStufe === 1) {
        if (tageSeitReferenz >= config.tageNachVorgaenger) empfohleneStufe = 1;
      } else {
        if (tageSeitReferenz >= config.tageNachVorgaenger) empfohleneStufe = naechsteStufe;
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
    pausiertBis: rechnung.mahnPausiertBis ?? undefined,
    offenEUR: offen,
    letzteFrist: letzte?.neueFrist,
  };
}

export function berechneNeueFrist(stufe: MahnStufeConfig, heute: string = heuteISO()): string {
  const d = new Date(heute + "T00:00:00");
  d.setDate(d.getDate() + stufe.fristTage);
  return d.toISOString().slice(0, 10);
}

/** Standard-Stufen-Setup, abgeleitet aus den Settings-Werten (Mahnungs-Schema). */
export function defaultStufen(opts: {
  stufe1Tage: number;
  stufe2Tage: number;
  stufe3Tage: number;
  gebuehrStufe2: number;
  gebuehrStufe3: number;
  emailVorlageStufe1?: string | null;
  emailVorlageStufe2?: string | null;
  emailVorlageStufe3?: string | null;
}): MahnStufeConfig[] {
  return [
    {
      stufe: 1,
      bezeichnung: "Zahlungserinnerung",
      tageNachVorgaenger: opts.stufe1Tage,
      gebuehr: 0,
      fristTage: 7,
      emailVorlageId: opts.emailVorlageStufe1 ?? null,
    },
    {
      stufe: 2,
      bezeichnung: "1. Mahnung",
      tageNachVorgaenger: opts.stufe2Tage,
      gebuehr: opts.gebuehrStufe2,
      fristTage: 7,
      emailVorlageId: opts.emailVorlageStufe2 ?? null,
    },
    {
      stufe: 3,
      bezeichnung: "Letzte Mahnung",
      tageNachVorgaenger: opts.stufe3Tage,
      gebuehr: opts.gebuehrStufe3,
      fristTage: 7,
      emailVorlageId: opts.emailVorlageStufe3 ?? null,
    },
  ];
}
