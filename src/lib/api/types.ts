// Zentrale TypeScript-Typen für das gesamte CRM.
// Diese Typen sind der Vertrag zwischen Frontend und Pi-Backend.
// Änderungen hier müssen in API_SPEC.md gespiegelt werden.

export type ID = string;
export type ISODate = string; // "YYYY-MM-DD"
export type ISODateTime = string; // ISO 8601

// ---------- Stammdaten ----------

export type KundeTyp = "firma" | "privat";
export type KundeStatus = "aktiv" | "inaktiv" | "interessent";

export interface Kunde {
  id: ID;
  nummer: string; // z.B. "K-2025-001"
  /** 3–4-stelliges Kürzel. Wenn gesetzt, werden Rechnungen/Angebote als "{KÜRZEL}-{YYYY}-{MM}-{##}" nummeriert. */
  kuerzel?: string;
  typ: KundeTyp;
  anrede?: "herr" | "frau" | "divers" | "keine";
  firmenname?: string;
  vorname?: string;
  nachname?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string; // default "Deutschland"
  telefon?: string;
  mobil?: string;
  email?: string;
  webseite?: string;
  ustId?: string;
  steuernummer?: string;
  zahlungszielTage: number; // default 14
  standardSteuersatz: number; // default 19
  standardRabatt: number; // %
  notizen?: string;
  tags: string[];
  status: KundeStatus;
  archiviert: boolean;
  erstelltAm: ISODateTime;
  geaendertAm: ISODateTime;
}

export interface Ansprechpartner {
  id: ID;
  kundeId: ID;
  anrede?: "herr" | "frau" | "divers" | "keine";
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

// ---------- Objekte ----------

export type ObjektTyp =
  | "buero"
  | "wohnen"
  | "gewerbe"
  | "industrie"
  | "medizin"
  | "bildung"
  | "sonstiges";
export type Reinigungsfrequenz =
  | "taeglich"
  | "woechentlich"
  | "14taegig"
  | "monatlich"
  | "quartalsweise"
  | "auf_abruf";
export type Wochentag = "mo" | "di" | "mi" | "do" | "fr" | "sa" | "so";
export type ObjektStatus = "aktiv" | "pausiert" | "beendet";

export interface Objekt {
  id: ID;
  nummer: string;
  kundeId: ID;
  name: string;
  typ: ObjektTyp;
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  qmGesamt?: number;
  qmZuReinigen?: number;
  stockwerke?: number;
  raeume?: number;
  frequenz: Reinigungsfrequenz;
  reinigungstage: Wochentag[];
  uhrzeitVon?: string; // "08:00"
  uhrzeitBis?: string; // "12:00"
  zugangsinfo?: string;
  alarmInfo?: string;
  ansprechpartnerVorOrtId?: ID;
  notizen?: string;
  status: ObjektStatus;
  archiviert: boolean;
  erstelltAm: ISODateTime;
  geaendertAm: ISODateTime;
}

// ---------- Angebote / Rechnungen ----------

export type Einheit = "stk" | "h" | "m2" | "pauschal" | "tag" | "monat";

export interface Position {
  id: ID;
  beschreibung: string;
  menge: number;
  einheit: Einheit;
  einzelpreisNetto: number;
  steuersatz: number; // %
  rabatt: number; // %
}

export type AngebotStatus =
  | "entwurf"
  | "versendet"
  | "angenommen"
  | "abgelehnt"
  | "abgelaufen";

export interface BelegOptionen {
  /** Standardsatz „Reinigungsmittel & Werkzeuge werden bereitgestellt" einfügen */
  materialBereitgestellt: boolean;
  /** Standard-Anschreiben aus Textvorlagen verwenden */
  standardAnschreiben: boolean;
  /** Eigener Einleitungstext (überschreibt Vorlage wenn gesetzt) */
  eigenesIntro?: string;
  /** Eigener Schlusstext */
  eigenesOutro?: string;
  /** Wiederkehrend / Dauerauftrag */
  wiederkehrend: boolean;
}

/** Status der automatischen Google-Drive-Synchronisation eines PDFs. Wird vom Pi-Backend gesetzt. */
export interface DriveSyncInfo {
  /** Drive File-ID, sobald hochgeladen. */
  fileId?: string;
  /** Webview-Link auf Drive (https://drive.google.com/...). */
  webViewLink?: string;
  /** Zeitpunkt des letzten erfolgreichen Uploads. */
  syncedAt?: ISODateTime;
  /** Letzte Fehlermeldung, falls Upload fehlgeschlagen ist. */
  error?: string;
  /** Ordnername im Drive (z. B. "2026/05"). Nur informativ. */
  ordner?: string;
}

export interface Angebot {
  id: ID;
  nummer: string; // "AN-2025-001"
  kundeId: ID;
  objektId?: ID;
  ansprechpartnerId?: ID;
  titel: string;
  introText?: string;
  outroText?: string;
  positionen: Position[];
  rabattGesamt: number; // %
  steuersatz: number;
  gueltigBis?: ISODate;
  notizen?: string;
  status: AngebotStatus;
  versendetAm?: ISODateTime;
  archiviert: boolean;
  optionen?: BelegOptionen;
  /** Status der Drive-Synchronisation des PDFs. */
  drive?: DriveSyncInfo;
  erstelltAm: ISODateTime;
  geaendertAm: ISODateTime;
}

export type RechnungStatus =
  | "entwurf"
  | "versendet"
  | "teilbezahlt"
  | "bezahlt"
  | "ueberfaellig"
  | "storniert";

export type Zahlungsmethode =
  | "ueberweisung"
  | "bar"
  | "karte"
  | "paypal"
  | "sepa"
  | "sonstiges";

export interface Zahlung {
  id: ID;
  rechnungId: ID;
  datum: ISODate;
  betrag: number;
  methode: Zahlungsmethode;
  referenz?: string;
  notiz?: string;
}

export interface Rechnung {
  id: ID;
  nummer: string; // "RE-2025-001"
  kundeId: ID;
  objektId?: ID;
  ansprechpartnerId?: ID;
  quellAngebotId?: ID;
  titel: string;
  introText?: string;
  outroText?: string;
  positionen: Position[];
  rabattGesamt: number;
  steuersatz: number;
  rechnungsdatum: ISODate;
  faelligkeitsdatum: ISODate;
  notizen?: string;
  status: RechnungStatus;
  versendetAm?: ISODateTime;
  archiviert: boolean;
  zahlungen: Zahlung[];
  optionen?: BelegOptionen;
  /** Versendete Mahnungen, chronologisch (älteste zuerst). */
  mahnungen?: MahnVorgang[];
  /** Mahnverfahren bis zu diesem Datum pausieren (z.B. mündliche Zahlungszusage). */
  mahnPausiertBis?: ISODate;
  /** True wenn manuell „inkasso-reif" markiert (nach Stufe 3). */
  inkassoMarkiert?: boolean;
  /** Status der Drive-Synchronisation des PDFs. */
  drive?: DriveSyncInfo;
  erstelltAm: ISODateTime;
  geaendertAm: ISODateTime;
}

// ---------- Mahnwesen ----------

export type MahnStufe = 1 | 2 | 3;

export interface MahnVorgang {
  id: ID;
  rechnungId: ID;
  stufe: MahnStufe;
  versendetAm: ISODateTime;
  /** Neue Zahlungsfrist, die in dieser Mahnung gesetzt wurde. */
  neueFrist: ISODate;
  /** Mahngebühr in EUR (separat von der Rechnungssumme). */
  gebuehr: number;
  /** Verknüpfung zu EmailVersand-Eintrag für Audit-Trail. */
  emailVersandId?: ID;
}

export interface MahnStufeConfig {
  stufe: MahnStufe;
  bezeichnung: string;
  /** Tage nach Vorgänger (Stufe 1: Tage nach Fälligkeit). */
  tageNachVorgaenger: number;
  gebuehr: number;
  /** Neue Frist in Tagen ab Versand. */
  fristTage: number;
  /** Optional zugeordnete E-Mail-Vorlage. */
  emailVorlageId?: ID;
}

export interface MahnEinstellungen {
  autoVorschlagAktiv: boolean;
  /** Genau drei Stufen, sortiert nach stufe asc. */
  stufen: MahnStufeConfig[];
}

// ---------- Dokumente ----------

export type DokumentTyp =
  | "beleg"
  | "vertrag"
  | "angebot"
  | "rechnung"
  | "protokoll"
  | "bild"
  | "sonstiges";

export interface Dokument {
  id: ID;
  titel: string;
  beschreibung?: string;
  typ: DokumentTyp;
  kundeId?: ID;
  objektId?: ID;
  dateiname: string;
  mimeType: string;
  groesseBytes: number;
  url: string; // im Mock: data:URL oder Platzhalter; im Live-Modus: vom Backend
  dokumentdatum?: ISODate;
  betrag?: number;
  steuerrelevant: boolean;
  hochgeladenAm: ISODateTime;
}

// ---------- Notizen / Aktivitäten / Benachrichtigungen ----------

export interface Notiz {
  id: ID;
  kundeId?: ID;
  objektId?: ID;
  titel: string;
  inhalt: string;
  erstelltAm: ISODateTime;
}

export type AktivitaetTyp =
  | "kunde_angelegt"
  | "kunde_geaendert"
  | "objekt_angelegt"
  | "angebot_angelegt"
  | "angebot_versendet"
  | "angebot_in_rechnung_umgewandelt"
  | "rechnung_angelegt"
  | "rechnung_versendet"
  | "zahlung_erfasst"
  | "dokument_hochgeladen"
  | "einstellung_geaendert"
  | "backup_erstellt"
  | "dauerauftrag_angelegt"
  | "dauerauftrag_lauf_erzeugt"
  | "zahlungseingang_zugeordnet"
  | "zahlungseingang_importiert"
  | "system";

export interface Aktivitaet {
  id: ID;
  zeitpunkt: ISODateTime;
  typ: AktivitaetTyp;
  beschreibung: string;
  entitaet?: { typ: string; id: ID };
}

export type BenachrichtigungTyp = "info" | "warnung" | "fehler" | "erfolg";

export interface Benachrichtigung {
  id: ID;
  zeitpunkt: ISODateTime;
  typ: BenachrichtigungTyp;
  titel: string;
  text: string;
  link?: { route: string; params?: Record<string, string> };
  gelesen: boolean;
}

// ---------- Vorlagen / Einstellungen ----------

export interface Positionsvorlage {
  id: ID;
  bezeichnung: string;
  beschreibung: string;
  einheit: Einheit;
  einzelpreisNetto: number;
  steuersatz: number;
}

export type TextvorlageZweck =
  | "angebot_intro"
  | "angebot_outro"
  | "rechnung_intro"
  | "rechnung_outro"
  | "email_angebot"
  | "email_rechnung";

export interface Textvorlage {
  id: ID;
  zweck: TextvorlageZweck;
  bezeichnung: string;
  inhalt: string; // mit Platzhaltern wie {kunde.name}
}

export interface Firmendaten {
  firmenname: string;
  rechtsform?: string;
  slogan?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  telefon?: string;
  email?: string;
  webseite?: string;
  ustId?: string;
  steuernummer?: string;
  handelsregister?: string;
  geschaeftsfuehrer?: string;
  bankName?: string;
  iban?: string;
  bic?: string;
  logoUrl?: string;
  standardSteuersatz: number;
  standardZahlungszielTage: number;
}

export interface SmtpEinstellungen {
  server: string;
  port: number;
  benutzer: string;
  // Passwort wird im Pi-Backend verschlüsselt gespeichert; nie im Klartext zurückgeliefert.
  passwortGesetzt: boolean;
  absenderName: string;
  absenderEmail: string;
  ssl: boolean;
}

// ---------- E-Mail (Vorlagen, Signaturen, Versand) ----------

export type EmailKontext = "angebot" | "rechnung" | "mahnung" | "allgemein";

export interface EmailVorlage {
  id: ID;
  name: string;
  kontext: EmailKontext;
  betreff: string; // mit {{platzhalter}}
  koerperHtml: string; // HTML-Body mit Platzhaltern
  istStandard: boolean;
  erstelltAm: ISODateTime;
  aktualisiertAm: ISODateTime;
}

export interface EmailSignatur {
  id: ID;
  name: string;
  html: string;
  istStandard: boolean;
  erstelltAm: ISODateTime;
}

export type EmailVersandStatus = "queued" | "sending" | "sent" | "failed";

export interface EmailAnhang {
  name: string;
  sizeBytes: number;
  /** Im Mock: nur Metadaten. Backend bekommt das echte PDF zur Sendezeit. */
  kind: "pdf-beleg" | "datei";
}

export interface EmailVersand {
  id: ID;
  belegTyp: "angebot" | "rechnung" | "allgemein";
  belegId?: ID;
  kundeId?: ID;
  empfaenger: string[];
  cc: string[];
  bcc: string[];
  betreff: string;
  koerperHtml: string;
  vorlageId?: ID;
  signaturId?: ID;
  anhaenge: EmailAnhang[];
  status: EmailVersandStatus;
  versendetAm?: ISODateTime;
  fehlerGrund?: string;
  messageId?: string;
}

export interface Nummernkreise {
  kundePraefix: string; // z.B. "K-{YYYY}-{####}"
  angebotPraefix: string; // "AN-{YYYY}-{####}"
  rechnungPraefix: string; // "RE-{YYYY}-{####}"
}

export interface SicherheitsEinstellungen {
  autoLockMinuten: number;
}

export interface AppearanceEinstellungen {
  theme: "system" | "hell" | "dunkel";
  akzentfarbe: string; // hex
}

export interface BackupEinstellungen {
  autoBackup: boolean;
  zeitpunkt: string; // "02:00"
  behaltenAnzahl: number;
  zielordner: string; // Pi-Pfad
}

// ---------- Dashboard ----------

export interface DashboardKennzahlen {
  aktiveKunden: number;
  aktiveObjekte: number;
  offeneAngebote: number;
  offeneRechnungen: number;
  ausstehendEUR: number;
}

export interface UmsatzPunkt {
  monat: string; // "2025-04"
  netto: number;
  brutto: number;
}

export interface Warnung {
  id: ID;
  schwere: "info" | "warnung" | "fehler";
  text: string;
  link?: { route: string; params?: Record<string, string> };
}

export interface SuchTreffer {
  id: ID;
  typ: "kunde" | "objekt" | "angebot" | "rechnung" | "dokument" | "notiz";
  titel: string;
  untertitel?: string;
  link: { route: string; params?: Record<string, string> };
}

// ---------- Daueraufträge (wiederkehrende Rechnungen) ----------

export type DauerauftragFrequenz = "monatlich" | "quartalsweise" | "halbjaehrlich" | "jaehrlich";
export type DauerauftragModus = "entwurf" | "vollautomatisch";
export type DauerauftragStatus = "aktiv" | "pausiert" | "beendet";

export interface DauerauftragStichtag {
  typ: "monatstag" | "monatsletzter" | "quartalstag";
  /** Tag im Monat (1–28). Bei „monatsletzter" ignoriert. */
  wert?: number;
}

export interface Dauerauftrag {
  id: ID;
  nummer: string; // "DA-2026-001"
  kundeId: ID;
  objektId?: ID;
  ansprechpartnerId?: ID;
  bezeichnung: string;
  frequenz: DauerauftragFrequenz;
  stichtag: DauerauftragStichtag;
  laufzeitVon: ISODate;
  /** Optional, leer = unbefristet. */
  laufzeitBis?: ISODate;
  positionen: Position[];
  rabattGesamt: number;
  steuersatz: number;
  /** Betreff-Vorlage mit Platzhaltern wie {{lauf.zeitraum}}. */
  betreffVorlage: string;
  /** Intro-/Anschreiben-Vorlage mit Platzhaltern. */
  textVorlage: string;
  modus: DauerauftragModus;
  /** Empfänger für Vollautomatik (sonst Standard-E-Mail des Kunden). */
  emailEmpfaenger?: string[];
  status: DauerauftragStatus;
  /** Pausiert bis (inklusive) — Läufe in der Pause werden übersprungen. */
  pausiertBis?: ISODate;
  letzteAusfuehrung?: ISODate;
  notizen?: string;
  erstelltAm: ISODateTime;
  geaendertAm: ISODateTime;
}

export type DauerauftragLaufStatus = "geplant" | "erzeugt" | "uebersprungen" | "fehler";

export interface DauerauftragLauf {
  id: ID;
  dauerauftragId: ID;
  /** Eindeutiger Schlüssel pro DA: "2026-04" / "2026-Q2" / "2026-H1" / "2026". */
  periode: string;
  geplantFuer: ISODate;
  ausgefuehrtAm?: ISODateTime;
  rechnungId?: ID;
  status: DauerauftragLaufStatus;
  fehlerGrund?: string;
}

export interface DauerauftragSonderposition {
  id: ID;
  dauerauftragId: ID;
  /** Periode-Schlüssel, dem die Sonderposition zugeordnet ist. */
  fuerPeriode: string;
  position: Position;
  /** Sobald ein Lauf erzeugt wurde, wird sie verbraucht. */
  verbrauchtAm?: ISODateTime;
}

// ---------- Zahlungseingänge & Abgleich ----------

export type ZahlungseingangStatus = "offen" | "zugeordnet" | "teilweise" | "ignoriert";

export interface ZahlungseingangZuordnung {
  rechnungId: ID;
  /** FK auf erzeugte `Zahlung` (in der Rechnung gespeichert). */
  zahlungId: ID;
  /** Anteilig zugeordneter Betrag (für Sammelüberweisungen-Splits). */
  betrag: number;
  /** Optional: Score, mit dem zugeordnet wurde (für spätere Statistik). */
  score?: number;
}

export interface Zahlungseingang {
  id: ID;
  buchungsdatum: ISODate;
  /** Immer positiv. Lastschriften/Ausgänge werden beim Import herausgefiltert. */
  betrag: number;
  waehrung: "EUR";
  verwendungszweck: string;
  senderName?: string;
  senderIban?: string;
  status: ZahlungseingangStatus;
  zuordnungen: ZahlungseingangZuordnung[];
  importQuelle: "manuell" | "csv";
  importiertAm: ISODateTime;
}

export interface ZahlungsabgleichEinstellungen {
  /** Score-Schwelle, ab der ein Eingang ohne Klick zugeordnet wird (0 = aus). */
  autoZuordnenAbScore: number;
}

export interface DauerauftragEinstellungen {
  defaultModus: DauerauftragModus;
  /** Standard-Stichtag für neue DAs. */
  defaultStichtag: DauerauftragStichtag;
}
