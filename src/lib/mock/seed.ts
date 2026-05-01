// Initial-Seed für den Mock-Modus.
//
// Enthält bewusst KEINE Beispiel-Kunden / -Aufträge / -Rechnungen mehr.
// Alle Geschäftsdaten-Listen starten leer — der User soll mit einer cleanen
// Anwendung beginnen. Erhalten bleiben ausschließlich Konfigurationsdaten:
// Firmendaten, SMTP, Nummernkreise, Vorlagen, Sicherheit, Theme, Backup.
//
// Beim Wechsel auf das Live-Backend (VITE_USE_MOCK=false) wird diese Datei
// nicht mehr verwendet — siehe BACKEND_INTEGRATION.md.

import type {
  Aktivitaet,
  Angebot,
  Ansprechpartner,
  AppearanceEinstellungen,
  BackupEintrag,
  BackupEinstellungen,
  Benachrichtigung,
  Dauerauftrag,
  DauerauftragEinstellungen,
  DauerauftragLauf,
  DauerauftragSonderposition,
  Dokument,
  EmailSignatur,
  EmailVersand,
  EmailVorlage,
  Firmendaten,
  GoogleDriveEinstellungen,
  Kunde,
  MahnEinstellungen,
  Notiz,
  Nummernkreise,
  SitzungEintrag,
  Objekt,
  Positionsvorlage,
  Rechnung,
  SicherheitsEinstellungen,
  SmtpEinstellungen,
  Textvorlage,
  Zahlungseingang,
  ZahlungsabgleichEinstellungen,
} from "@/lib/api/types";
import { STANDARD_MAHN_EINSTELLUNGEN, standardMahnVorlagen } from "@/lib/mahnung/defaults";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

const HEUTE = new Date().toISOString().slice(0, 10);

export function seed() {
  const kunden: Kunde[] = [];
  const ansprechpartner: Ansprechpartner[] = [];
  const objekte: Objekt[] = [];
  const angebote: Angebot[] = [];
  const rechnungen: Rechnung[] = [];
  const dokumente: Dokument[] = [];
  const notizen: Notiz[] = [];
  const aktivitaeten: Aktivitaet[] = [];
  const benachrichtigungen: Benachrichtigung[] = [];

  const positionsvorlagen: Positionsvorlage[] = [
    {
      id: uuid(),
      bezeichnung: "Unterhaltsreinigung pro m²",
      beschreibung: "Regelmäßige Unterhaltsreinigung Büroflächen",
      einheit: "m2",
      einzelpreisNetto: 0.85,
      steuersatz: 19,
    },
    {
      id: uuid(),
      bezeichnung: "Glasreinigung pauschal",
      beschreibung: "Glas- und Rahmenreinigung innen + außen",
      einheit: "pauschal",
      einzelpreisNetto: 250,
      steuersatz: 19,
    },
    {
      id: uuid(),
      bezeichnung: "Grundreinigung pro Stunde",
      beschreibung: "Grundreinigung nach Aufwand",
      einheit: "h",
      einzelpreisNetto: 38,
      steuersatz: 19,
    },
  ];

  const textvorlagen: Textvorlage[] = [
    {
      id: uuid(),
      zweck: "angebot_intro",
      bezeichnung: "Standard-Intro Angebot",
      inhalt:
        "Sehr geehrte/r {kunde.anrede} {kunde.nachname},\n\nvielen Dank für Ihr Interesse. Gerne unterbreiten wir Ihnen folgendes Angebot:",
    },
    {
      id: uuid(),
      zweck: "angebot_outro",
      bezeichnung: "Standard-Outro Angebot",
      inhalt:
        "Dieses Angebot ist 30 Tage gültig. Bei Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.\n\nMit freundlichen Grüßen",
    },
    {
      id: uuid(),
      zweck: "rechnung_intro",
      bezeichnung: "Standard-Intro Rechnung",
      inhalt:
        "Sehr geehrte/r {kunde.anrede} {kunde.nachname},\n\nfür die erbrachten Leistungen erlauben wir uns, Ihnen folgenden Betrag in Rechnung zu stellen:",
    },
    {
      id: uuid(),
      zweck: "rechnung_outro",
      bezeichnung: "Standard-Outro Rechnung",
      inhalt:
        "Bitte überweisen Sie den Betrag innerhalb von 14 Tagen auf das unten angegebene Konto.\n\nMit freundlichen Grüßen",
    },
    {
      id: uuid(),
      zweck: "email_angebot",
      bezeichnung: "E-Mail-Vorlage Angebot",
      inhalt:
        "Sehr geehrte/r {kunde.anrede} {kunde.nachname},\n\nim Anhang finden Sie unser Angebot {angebot.nummer}.\n\nMit freundlichen Grüßen",
    },
  ];

  const firmendaten: Firmendaten = {
    firmenname: "My Clean Center GmbH",
    rechtsform: "GmbH",
    slogan: "Gebäude- und Hausmeisterservice",
    strasse: "Gartenstr. 16",
    plz: "53757",
    ort: "St. Augustin",
    land: "Deutschland",
    telefon: "+49 (0) 2203 9429437 / +49 (0) 160 1827...",
    email: "info@my-cleancenter.de",
    webseite: "www.mycleancenter.de",
    ustId: "DE459095049",
    steuernummer: "",
    handelsregister: "Amtsgericht Siegburg, HRB 18975",
    geschaeftsfuehrer: "Raed Mustafa",
    bankName: "Sparkasse Köln Bonn",
    iban: "DE50 3705 0198 1936 3930 55",
    bic: "",
    standardSteuersatz: 19,
    standardZahlungszielTage: 14,
  };

  const smtp: SmtpEinstellungen = {
    server: "smtp.strato.de",
    port: 465,
    benutzer: "",
    passwortGesetzt: false,
    absenderName: "MCC Reinigungsservice",
    absenderEmail: "",
    ssl: true,
  };

  const nummernkreise: Nummernkreise = {
    kundePraefix: "K-{YYYY}-{####}",
    angebotPraefix: "AN-{YYYY}-{####}",
    rechnungPraefix: "RE-{YYYY}-{####}",
  };

  const sicherheit: SicherheitsEinstellungen = { autoLockMinuten: 30 };
  const appearance: AppearanceEinstellungen = { theme: "hell", akzentfarbe: "#1E3A5F" };
  const backup: BackupEinstellungen = {
    autoBackup: true,
    zeitpunkt: "02:00",
    behaltenAnzahl: 14,
    zielordner: "/var/lib/mcc/backups",
  };
  const backupHistorie: BackupEintrag[] = [];

  const googleDrive: GoogleDriveEinstellungen = {
    verbunden: false,
    rootOrdnerName: "mycleancenter.cm",
    unterordnerSchema: {
      rechnungen: "Rechnungen/{YYYY}/{MM}",
      angebote: "Angebote/{YYYY}/{MM}",
    },
    dateinameSchema: {
      rechnung: "{nummer} {kunde} {leistung} {MM}-{YYYY}",
      angebot: "{nummer} {kunde} {leistung} {MM}-{YYYY}",
    },
    autoUpload: true,
  };

  const sitzungen: SitzungEintrag[] = [
    {
      id: uuid(),
      hostname: "MacBook-Buero",
      ip: "192.168.1.42",
      letzteAktivitaet: new Date().toISOString(),
      istAktuellesGeraet: true,
    },
  ];

  const jetzt = new Date().toISOString();

  const emailVorlagen: EmailVorlage[] = [
    {
      id: uuid(),
      name: "Angebot Standard",
      kontext: "angebot",
      betreff: "Ihr Angebot {{angebot.nummer}} von {{firma.name}}",
      koerperHtml:
        '<p>Sehr geehrte Damen und Herren,</p>\n<p>vielen Dank für Ihre Anfrage. Im Anhang finden Sie unser Angebot <strong>{{angebot.nummer}}</strong> über <strong>{{angebot.summe}}</strong>.</p>\n<p>Das Angebot ist gültig bis zum {{angebot.gueltigBis}}.</p>\n<p>Bei Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.</p>\n<p>Mit freundlichen Grüßen</p>',
      istStandard: true,
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    },
    {
      id: uuid(),
      name: "Rechnung Standard",
      kontext: "rechnung",
      betreff: "Rechnung {{rechnung.nummer}} von {{firma.name}}",
      koerperHtml:
        '<p>Sehr geehrte Damen und Herren,</p>\n<p>im Anhang erhalten Sie unsere Rechnung <strong>{{rechnung.nummer}}</strong> über <strong>{{rechnung.summe}}</strong>.</p>\n<p>Wir bitten um Überweisung des Rechnungsbetrags bis zum <strong>{{rechnung.faellig}}</strong>.</p>\n<p>Mit freundlichen Grüßen</p>',
      istStandard: true,
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    },
    ...standardMahnVorlagen(jetzt, uuid),
  ];

  const emailSignaturen: EmailSignatur[] = [
    {
      id: uuid(),
      name: "Geschäftsführung",
      html:
        '<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:#1f2937">--<br/><strong>Raed Mustafa</strong> · Geschäftsführung<br/>My Clean Center GmbH<br/>Gartenstr. 16 · 53757 St. Augustin<br/>Tel: +49 (0) 2203 9429437<br/>E-Mail: info@my-cleancenter.de · www.mycleancenter.de</p>',
      istStandard: true,
      erstelltAm: jetzt,
    },
  ];

  const emailVersand: EmailVersand[] = [];

  const mahnung: MahnEinstellungen = STANDARD_MAHN_EINSTELLUNGEN;

  const dauerauftraege: Dauerauftrag[] = [];
  const dauerauftragLaeufe: DauerauftragLauf[] = [];
  const dauerauftragSonderpositionen: DauerauftragSonderposition[] = [];
  const zahlungseingaenge: Zahlungseingang[] = [];

  const dauerauftragEinstellungen: DauerauftragEinstellungen = {
    defaultModus: "entwurf",
    defaultStichtag: { typ: "monatstag", wert: 1 },
  };

  const zahlungsabgleich: ZahlungsabgleichEinstellungen = {
    autoZuordnenAbScore: 0, // 0 = aus; User aktiviert in Einstellungen
  };

  return {
    unlocked: false,
    masterPasswort: "040506",
    kunden,
    ansprechpartner,
    objekte,
    angebote,
    rechnungen,
    dokumente,
    notizen,
    aktivitaeten,
    benachrichtigungen,
    positionsvorlagen,
    textvorlagen,
    emailVorlagen,
    emailSignaturen,
    emailVersand,
    firmendaten,
    smtp,
    nummernkreise,
    sicherheit,
    appearance,
    backup,
    backupHistorie,
    googleDrive,
    sitzungen,
    mahnung,
    dauerauftraege,
    dauerauftragLaeufe,
    dauerauftragSonderpositionen,
    zahlungseingaenge,
    dauerauftragEinstellungen,
    zahlungsabgleich,
    zaehler: { kunde: 0, objekt: 0, angebot: 0, rechnung: 0, dauerauftrag: 0 },
  };
}

export type SeedDB = ReturnType<typeof seed>;

export { HEUTE };
