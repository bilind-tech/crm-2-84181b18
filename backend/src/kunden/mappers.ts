// Mapper zwischen DB-Zeilen (snake_case) und API-Typen (camelCase) für Step 3.
// Tags / reinigungstage werden als JSON-Strings persistiert.

export interface DbKunde {
  id: string;
  nummer: string;
  kuerzel: string | null;
  typ: string;
  anrede: string | null;
  firmenname: string | null;
  vorname: string | null;
  nachname: string | null;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  telefon: string | null;
  mobil: string | null;
  email: string | null;
  webseite: string | null;
  ust_id: string | null;
  steuernummer: string | null;
  zahlungsziel_tage: number;
  standard_steuersatz: number;
  standard_rabatt: number;
  notizen: string | null;
  tags: string;
  status: string;
  archiviert: number;
  erstellt_am: string;
  geaendert_am: string;
}

export interface ApiKunde {
  id: string;
  nummer: string;
  kuerzel?: string;
  typ: string;
  anrede?: string;
  firmenname?: string;
  vorname?: string;
  nachname?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  telefon?: string;
  mobil?: string;
  email?: string;
  webseite?: string;
  ustId?: string;
  steuernummer?: string;
  zahlungszielTage: number;
  standardSteuersatz: number;
  standardRabatt: number;
  notizen?: string;
  tags: string[];
  status: string;
  archiviert: boolean;
  erstelltAm: string;
  geaendertAm: string;
}

function parseTags(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function isoFromSqlite(s: string): string {
  // SQLite datetime('now') liefert "YYYY-MM-DD HH:MM:SS" (UTC) — als ISO hochwerten.
  return s.includes("T") ? s : s.replace(" ", "T") + "Z";
}

export function kundeRowToApi(r: DbKunde): ApiKunde {
  return {
    id: r.id,
    nummer: r.nummer,
    kuerzel: r.kuerzel ?? undefined,
    typ: r.typ,
    anrede: r.anrede ?? undefined,
    firmenname: r.firmenname ?? undefined,
    vorname: r.vorname ?? undefined,
    nachname: r.nachname ?? undefined,
    strasse: r.strasse ?? undefined,
    plz: r.plz ?? undefined,
    ort: r.ort ?? undefined,
    land: r.land ?? undefined,
    telefon: r.telefon ?? undefined,
    mobil: r.mobil ?? undefined,
    email: r.email ?? undefined,
    webseite: r.webseite ?? undefined,
    ustId: r.ust_id ?? undefined,
    steuernummer: r.steuernummer ?? undefined,
    zahlungszielTage: r.zahlungsziel_tage,
    standardSteuersatz: r.standard_steuersatz,
    standardRabatt: r.standard_rabatt,
    notizen: r.notizen ?? undefined,
    tags: parseTags(r.tags),
    status: r.status,
    archiviert: r.archiviert === 1,
    erstelltAm: isoFromSqlite(r.erstellt_am),
    geaendertAm: isoFromSqlite(r.geaendert_am),
  };
}

export interface DbAnsprechpartner {
  id: string;
  kunde_id: string;
  anrede: string | null;
  vorname: string | null;
  nachname: string | null;
  position: string | null;
  abteilung: string | null;
  telefon: string | null;
  mobil: string | null;
  email: string | null;
  notiz: string | null;
  primaer: number;
  erstellt_am: string;
}

export interface ApiAnsprechpartner {
  id: string;
  kundeId: string;
  anrede?: string;
  vorname?: string;
  nachname?: string;
  position?: string;
  abteilung?: string;
  telefon?: string;
  mobil?: string;
  email?: string;
  notiz?: string;
  primaer: boolean;
}

export function ansprechpartnerRowToApi(r: DbAnsprechpartner): ApiAnsprechpartner {
  return {
    id: r.id,
    kundeId: r.kunde_id,
    anrede: r.anrede ?? undefined,
    vorname: r.vorname ?? undefined,
    nachname: r.nachname ?? undefined,
    position: r.position ?? undefined,
    abteilung: r.abteilung ?? undefined,
    telefon: r.telefon ?? undefined,
    mobil: r.mobil ?? undefined,
    email: r.email ?? undefined,
    notiz: r.notiz ?? undefined,
    primaer: r.primaer === 1,
  };
}

export interface DbObjekt {
  id: string;
  nummer: string;
  kunde_id: string;
  name: string;
  typ: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  land: string | null;
  qm_gesamt: number | null;
  qm_zu_reinigen: number | null;
  stockwerke: number | null;
  raeume: number | null;
  frequenz: string;
  reinigungstage: string;
  uhrzeit_von: string | null;
  uhrzeit_bis: string | null;
  zugangsinfo: string | null;
  alarm_info: string | null;
  ansprechpartner_vor_ort_id: string | null;
  notizen: string | null;
  status: string;
  archiviert: number;
  erstellt_am: string;
  geaendert_am: string;
}

export interface ApiObjekt {
  id: string;
  nummer: string;
  kundeId: string;
  name: string;
  typ: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  qmGesamt?: number;
  qmZuReinigen?: number;
  stockwerke?: number;
  raeume?: number;
  frequenz: string;
  reinigungstage: string[];
  uhrzeitVon?: string;
  uhrzeitBis?: string;
  zugangsinfo?: string;
  alarmInfo?: string;
  ansprechpartnerVorOrtId?: string;
  notizen?: string;
  status: string;
  archiviert: boolean;
  erstelltAm: string;
  geaendertAm: string;
}

export function objektRowToApi(r: DbObjekt): ApiObjekt {
  return {
    id: r.id,
    nummer: r.nummer,
    kundeId: r.kunde_id,
    name: r.name,
    typ: r.typ,
    strasse: r.strasse ?? undefined,
    plz: r.plz ?? undefined,
    ort: r.ort ?? undefined,
    land: r.land ?? undefined,
    qmGesamt: r.qm_gesamt ?? undefined,
    qmZuReinigen: r.qm_zu_reinigen ?? undefined,
    stockwerke: r.stockwerke ?? undefined,
    raeume: r.raeume ?? undefined,
    frequenz: r.frequenz,
    reinigungstage: parseTags(r.reinigungstage),
    uhrzeitVon: r.uhrzeit_von ?? undefined,
    uhrzeitBis: r.uhrzeit_bis ?? undefined,
    zugangsinfo: r.zugangsinfo ?? undefined,
    alarmInfo: r.alarm_info ?? undefined,
    ansprechpartnerVorOrtId: r.ansprechpartner_vor_ort_id ?? undefined,
    notizen: r.notizen ?? undefined,
    status: r.status,
    archiviert: r.archiviert === 1,
    erstelltAm: isoFromSqlite(r.erstellt_am),
    geaendertAm: isoFromSqlite(r.geaendert_am),
  };
}

export interface DbNotiz {
  id: string;
  kunde_id: string | null;
  objekt_id: string | null;
  angebot_id: string | null;
  rechnung_id: string | null;
  text: string;
  autor_id: string | null;
  erstellt_am: string;
}

export interface ApiNotiz {
  id: string;
  kundeId?: string;
  objektId?: string;
  angebotId?: string;
  rechnungId?: string;
  text: string;
  autorId?: string;
  erstelltAm: string;
}

export function notizRowToApi(r: DbNotiz): ApiNotiz {
  return {
    id: r.id,
    kundeId: r.kunde_id ?? undefined,
    objektId: r.objekt_id ?? undefined,
    angebotId: r.angebot_id ?? undefined,
    rechnungId: r.rechnung_id ?? undefined,
    text: r.text,
    autorId: r.autor_id ?? undefined,
    erstelltAm: isoFromSqlite(r.erstellt_am),
  };
}
