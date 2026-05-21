// Mapper für Step-4-Belege: Angebot, Rechnung, Position, Zahlung.
// Geld liegt in der DB als Cent (INTEGER), an der API-Grenze als Euro-Decimal (number).

function isoFromSqlite(s: string): string {
  return s.includes("T") ? s : s.replace(" ", "T") + "Z";
}

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export const ctToEuro = (c: number | null | undefined): number =>
  c == null ? 0 : Math.round(c) / 100;

export const euroToCt = (e: number | null | undefined): number =>
  e == null ? 0 : Math.round(e * 100);

// ---------- Position ----------
export interface DbPosition {
  id: string;
  sort: number;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreis_netto_ct: number;
  steuersatz: number;
  rabatt: number;
  modus: string;
  pauschalpreis_netto_ct: number | null;
  ausfuehrung: string | null;
}

export interface ApiPosition {
  id: string;
  beschreibung: string;
  menge: number;
  einheit: string;
  einzelpreisNetto: number;
  steuersatz: number;
  rabatt: number;
  modus: "einzel" | "pauschal" | "stunden";
  pauschalpreisNetto?: number;
  ausfuehrung?: string;
}

export function positionRowToApi(r: DbPosition): ApiPosition {
  return {
    id: r.id,
    beschreibung: r.beschreibung,
    menge: r.menge,
    einheit: r.einheit,
    einzelpreisNetto: ctToEuro(r.einzelpreis_netto_ct),
    steuersatz: r.steuersatz,
    rabatt: r.rabatt,
    modus: (r.modus === "pauschal" ? "pauschal" : r.modus === "stunden" ? "stunden" : "einzel"),
    pauschalpreisNetto: r.pauschalpreis_netto_ct == null ? undefined : ctToEuro(r.pauschalpreis_netto_ct),
    ausfuehrung: r.ausfuehrung ?? undefined,
  };
}

// ---------- Angebot ----------
export interface DbAngebot {
  id: string;
  nummer: string;
  kunde_id: string;
  objekt_id: string | null;
  ansprechpartner_id: string | null;
  titel: string;
  intro_text: string | null;
  outro_text: string | null;
  rabatt_gesamt: number;
  steuersatz: number;
  gueltig_bis: string | null;
  notizen: string | null;
  status: string;
  versendet_am: string | null;
  archiviert: number;
  optionen: string | null;
  drive: string | null;
  erstellt_am: string;
  geaendert_am: string;
}

export interface ApiAngebot {
  id: string;
  nummer: string;
  kundeId: string;
  objektId?: string;
  ansprechpartnerId?: string;
  titel: string;
  introText?: string;
  outroText?: string;
  positionen: ApiPosition[];
  rabattGesamt: number;
  steuersatz: number;
  gueltigBis?: string;
  notizen?: string;
  status: string;
  versendetAm?: string;
  archiviert: boolean;
  optionen?: unknown;
  drive?: unknown;
  erstelltAm: string;
  geaendertAm: string;
}

export function angebotRowToApi(r: DbAngebot, positionen: ApiPosition[]): ApiAngebot {
  return {
    id: r.id,
    nummer: r.nummer,
    kundeId: r.kunde_id,
    objektId: r.objekt_id ?? undefined,
    ansprechpartnerId: r.ansprechpartner_id ?? undefined,
    titel: r.titel,
    introText: r.intro_text ?? undefined,
    outroText: r.outro_text ?? undefined,
    positionen,
    rabattGesamt: r.rabatt_gesamt,
    steuersatz: r.steuersatz,
    gueltigBis: r.gueltig_bis ?? undefined,
    notizen: r.notizen ?? undefined,
    status: r.status,
    versendetAm: r.versendet_am ? isoFromSqlite(r.versendet_am) : undefined,
    archiviert: r.archiviert === 1,
    optionen: parseJson(r.optionen, undefined as unknown),
    drive: parseJson(r.drive, undefined as unknown),
    erstelltAm: isoFromSqlite(r.erstellt_am),
    geaendertAm: isoFromSqlite(r.geaendert_am),
  };
}

// ---------- Rechnung ----------
export interface DbRechnung {
  id: string;
  nummer: string;
  kunde_id: string;
  objekt_id: string | null;
  ansprechpartner_id: string | null;
  quell_angebot_id: string | null;
  titel: string;
  intro_text: string | null;
  outro_text: string | null;
  rabatt_gesamt: number;
  steuersatz: number;
  rechnungsdatum: string;
  faelligkeitsdatum: string;
  leistungsmonat: string | null;
  notizen: string | null;
  status: string;
  versendet_am: string | null;
  archiviert: number;
  optionen: string | null;
  drive: string | null;
  mahnungen: string;
  mahn_pausiert_bis: string | null;
  inkasso_markiert: number;
  dauerauftrag_id: string | null;
  erstellt_am: string;
  geaendert_am: string;
}

export interface ApiZahlung {
  id: string;
  rechnungId: string;
  datum: string;
  betrag: number;
  methode: string;
  referenz?: string;
  notiz?: string;
}

export interface DbZahlung {
  id: string;
  rechnung_id: string;
  datum: string;
  betrag_ct: number;
  methode: string;
  referenz: string | null;
  notiz: string | null;
  erstellt_am: string;
}

export function zahlungRowToApi(r: DbZahlung): ApiZahlung {
  return {
    id: r.id,
    rechnungId: r.rechnung_id,
    datum: r.datum,
    betrag: ctToEuro(r.betrag_ct),
    methode: r.methode,
    referenz: r.referenz ?? undefined,
    notiz: r.notiz ?? undefined,
  };
}

export interface ApiRechnung {
  id: string;
  nummer: string;
  kundeId: string;
  objektId?: string;
  ansprechpartnerId?: string;
  quellAngebotId?: string;
  titel: string;
  introText?: string;
  outroText?: string;
  positionen: ApiPosition[];
  rabattGesamt: number;
  steuersatz: number;
  rechnungsdatum: string;
  faelligkeitsdatum: string;
  leistungsmonat?: string;
  notizen?: string;
  status: string;
  versendetAm?: string;
  archiviert: boolean;
  zahlungen: ApiZahlung[];
  optionen?: unknown;
  drive?: unknown;
  mahnungen?: unknown[];
  mahnPausiertBis?: string;
  inkassoMarkiert?: boolean;
  dauerauftragId?: string;
  erstelltAm: string;
  geaendertAm: string;
}

export function rechnungRowToApi(
  r: DbRechnung,
  positionen: ApiPosition[],
  zahlungen: ApiZahlung[],
): ApiRechnung {
  return {
    id: r.id,
    nummer: r.nummer,
    kundeId: r.kunde_id,
    objektId: r.objekt_id ?? undefined,
    ansprechpartnerId: r.ansprechpartner_id ?? undefined,
    quellAngebotId: r.quell_angebot_id ?? undefined,
    titel: r.titel,
    introText: r.intro_text ?? undefined,
    outroText: r.outro_text ?? undefined,
    positionen,
    rabattGesamt: r.rabatt_gesamt,
    steuersatz: r.steuersatz,
    rechnungsdatum: r.rechnungsdatum,
    faelligkeitsdatum: r.faelligkeitsdatum,
    leistungsmonat: r.leistungsmonat ?? undefined,
    notizen: r.notizen ?? undefined,
    status: r.status,
    versendetAm: r.versendet_am ? isoFromSqlite(r.versendet_am) : undefined,
    archiviert: r.archiviert === 1,
    zahlungen,
    optionen: parseJson(r.optionen, undefined as unknown),
    drive: parseJson(r.drive, undefined as unknown),
    mahnungen: parseJson(r.mahnungen, [] as unknown[]),
    mahnPausiertBis: r.mahn_pausiert_bis ?? undefined,
    inkassoMarkiert: r.inkasso_markiert === 1,
    dauerauftragId: r.dauerauftrag_id ?? undefined,
    erstelltAm: isoFromSqlite(r.erstellt_am),
    geaendertAm: isoFromSqlite(r.geaendert_am),
  };
}
