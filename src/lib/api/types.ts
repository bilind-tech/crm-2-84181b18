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

export type PositionModus = "einzel" | "pauschal";

export interface Position {
  id: ID;
  beschreibung: string;
  menge: number;
  einheit: Einheit;
  einzelpreisNetto: number;
  steuersatz: number; // %
  rabatt: number; // %
  /** „einzel" = Menge × Einzelpreis (Default). „pauschal" = ein großer Block + ein Festpreis. */
  modus?: PositionModus;
  /** Pauschalpreis (netto), nur relevant wenn modus = "pauschal". */
  pauschalpreisNetto?: number;
  /** Optionaler Frequenz-Tag der Ausführung (z. B. „Mo–Fr · 5× wöchentlich"). Wird im PDF in Spalte „Ausführung" gerendert. */
  ausfuehrung?: string;
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
  /** Detail-Konfiguration für „Wiederkehrend": Rhythmus + Wochentage. Optional. */
  wiederkehrendDetails?: WiederkehrendDetails;
  /** Per-Beleg Logo-Override (Data-URL). Wenn gesetzt, statt Standard-Logo verwenden. */
  logoOverride?: string;
  /** Per-Beleg Firmendaten-Override. Felder, die hier gesetzt sind, überschreiben die globalen Firmendaten im PDF. */
  firmaOverride?: Partial<Firmendaten>;
}

export type WiederkehrendRhythmus = "woechentlich" | "monatlich" | "quartalsweise" | "jaehrlich";

export interface WiederkehrendDetails {
  rhythmus: WiederkehrendRhythmus;
  /** Wochentage 0=So, 1=Mo, … 6=Sa. Mehrfach-Auswahl. Nur für Rhythmus „woechentlich" wirklich sinnvoll, kann aber überall mitgeschickt werden. */
  wochentage: number[];
  /** Häufigkeit pro Monat (z. B. 2 = „2× monatlich"). Nur informativ, optional. */
  proMonat?: number;
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
  /** Vom Backend gesetzt: ID des Dauerauftrags, zu dem diese Rechnung gehört (Auto-Verknüpfung). */
  dauerauftragId?: ID;
  /** Nur in der Server-Antwort (nicht persistiert): Info zu einem neu erzeugten Dauerauftrag, für Toast-Feedback. */
  dauerauftragNeu?: { id: ID; nummer: string };
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
  /** USt-Satz des Belegs in % (für Vorsteuer-Berechnung). Default 19. */
  ustSatz?: number;
  hochgeladenAm: ISODateTime;
  /** Wenn aus einer Handy-Scan-Session stammend */
  quelle?: "upload" | "drag-drop" | "handy-scan";
  /** Bis wann das Dokument zu erledigen ist (z.B. Belege ans Steuerbüro). */
  faelligAm?: ISODate;
  /** Wann als erledigt markiert. */
  erledigtAm?: ISODateTime;
  /** Status der Drive-Synchronisation. */
  drive?: DriveSyncInfo;
}

// ---------- Upload-Session (Handy-Scan-Brücke) ----------

export interface UploadSession {
  id: ID;
  /** Zufälliger Token, in URL und Header genutzt. */
  token: string;
  erstelltAm: ISODateTime;
  ablaufAm: ISODateTime;
  beendet: boolean;
  /** Dokumente, die in dieser Session hochgeladen wurden (Referenz auf dokumente). */
  dokumentIds: ID[];
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
  zeitpunkt: string; // "03:00"
  /** Legacy-Feld für Abwärtskompatibilität (entspricht behaltenDaily). */
  behaltenAnzahl: number;
  /** Wie viele Tages-Backups maximal aufgehoben werden (Rotation). */
  behaltenDaily: number;
  /** Wie viele Wochen-Backups maximal aufgehoben werden (Sonntags). */
  behaltenWeekly: number;
  /** Wie viele Monats-Backups maximal aufgehoben werden (1. d. Monats). */
  behaltenMonthly: number;
  zielordner: string; // Pi-Pfad
  /** Wenn true, werden Backups zusätzlich nach Google Drive gespiegelt. */
  driveSpiegel: boolean;
}

// ---------- Google Drive ----------

/** Konfiguration der Google-Drive-Anbindung. OAuth-Token wird nur im Pi-Backend
 *  AES-GCM verschlüsselt gespeichert und nie an das Frontend zurückgegeben. */
export interface GoogleDriveEinstellungen {
  /** True sobald OAuth erfolgreich. */
  verbunden: boolean;
  /** Konto-Mail des verbundenen Google-Accounts. */
  kontoEmail?: string;
  /** Zeitpunkt der erfolgreichen Verbindung. */
  verbundenAm?: ISODateTime;
  /** Name des Drive-Root-Ordners (default "mycleancenter.cm"). */
  rootOrdnerName: string;
  /** Drive-Folder-ID des Root-Ordners. Wird vom Backend nach Erstellung gesetzt. */
  rootOrdnerId?: string;
  /** Pfad-Templates relativ zum Root für die Unterordner. */
  unterordnerSchema: {
    rechnungen: string; // z. B. "Rechnungen/{YYYY}/{MM}"
    angebote: string;   // z. B. "Angebote/{YYYY}/{MM}"
  };
  /** Templates für die Dateinamen ohne Endung. */
  dateinameSchema: {
    rechnung: string; // "{nummer} {kunde} {leistung} {MM}-{YYYY}"
    angebot: string;
  };
  /** Wenn true, läuft der Upload automatisch ohne User-Klick. */
  autoUpload: boolean;
  /** Zeitpunkt der letzten erfolgreichen Synchronisation. */
  letzteSynchronisation?: ISODateTime;
  /** Letzte Fehlermeldung — leer wenn alles ok. */
  letzterFehler?: string;
}

export type BackupKategorie =
  | "daily"
  | "weekly"
  | "monthly"
  | "manuell"
  | "manual"
  | "pre-restore"
  | "pre-update";

export type BackupAusloeser = "auto" | "manuell" | "vor-restore" | "vor-update";

/** Eintrag in der Backup-Historie. Mock liefert simulierte Daten.
 *  WICHTIG: Ein Eintrag gilt nur als "fertig", wenn `abgeschlossenAm !== null`
 *  UND `status === "erfolg"`. Solange `status === "in_arbeit"` läuft das Backup. */
export interface BackupEintrag {
  id: ID;
  /** Legacy-Feld — entspricht zeitpunktStart. */
  zeitpunkt: ISODateTime;
  /** Wann das Backup gestartet wurde. */
  zeitpunktStart: ISODateTime;
  /** Wann das Backup abgeschlossen wurde. null solange noch in Arbeit. */
  abgeschlossenAm: ISODateTime | null;
  kategorie: BackupKategorie;
  ausloeser: BackupAusloeser;
  groesseBytes: number;
  status: "in_arbeit" | "erfolg" | "fehler";
  fehler?: string;
  /** Pfad/Dateiname auf dem Pi (z.B. "data-2026-05-02.sqlite.gz"). */
  dateiname: string;
  /** Optional: Drive-Spiegel-Status. */
  driveStatus?: "pending" | "synced" | "error";
}

// ---------- System / Updates ----------

/** System- und Versions-Info des laufenden CRM. */
export interface SystemInfo {
  appName: string;
  version: string;
  installedAt: ISODateTime;
  node: string;
  sqlite: string;
  hardware: string;
}

/** Ergebnis der Validierung eines hochgeladenen Update-Pakets (vor Install). */
export interface UpdatePackageInfo {
  /** Eindeutige ID dieses Upload-Vorgangs (für nachfolgendes /install). */
  uploadId: ID;
  fileName: string;
  sizeBytes: number;
  /** Aus package.json extrahierte Version, leer bei ungültigem Paket. */
  version: string;
  pendingMigrations: string[];
  warnings: string[];
  valide: boolean;
  fehlerGrund?: string;
}

export type UpdateStepId =
  | "entpacken"
  | "backup"
  | "quarantaene"
  | "install"
  | "migrations"
  | "neustart"
  | "smoketest"
  | "rollback";

export interface UpdateStepStatus {
  id: UpdateStepId;
  label: string;
  status: "wartet" | "laeuft" | "ok" | "fehler";
  /** Optionaler Live-Detail-Text, z.B. "45 / 120 Pakete". */
  detail?: string;
  fehlerGrund?: string;
}

export interface UpdateLauf {
  id: ID;
  von: string;
  zu: string;
  startetAm: ISODateTime;
  beendetAm: ISODateTime | null;
  status: "laeuft" | "erfolg" | "fehler" | "rollback";
  steps: UpdateStepStatus[];
  /** Bei Fehler: Schritt der fehlgeschlagen ist. */
  fehlgeschlagenBei?: UpdateStepId;
}

export interface InstallierteVersion {
  version: string;
  installedAt: ISODateTime;
  istAktiv: boolean;
  rollbackVerfuegbar: boolean;
}

/** Aktive Sitzung / Gerät im LAN. Pi-Backend liefert echte Daten. */
export interface SitzungEintrag {
  id: ID;
  hostname: string;
  ip: string;
  letzteAktivitaet: ISODateTime;
  istAktuellesGeraet: boolean;
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

// ---------- Dauerauftrag-Einstellungen (continued) ----------

export interface DauerauftragEinstellungen {
  defaultModus: DauerauftragModus;
  /** Standard-Stichtag für neue DAs. */
  defaultStichtag: DauerauftragStichtag;
}
