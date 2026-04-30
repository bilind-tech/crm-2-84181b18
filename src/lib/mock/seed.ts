// Seed-Daten für den Mock-Modus.
// Gibt 1–2 Beispiele pro Entität, damit alle Bildschirme sofort etwas zeigen.

import type {
  Aktivitaet,
  Angebot,
  Ansprechpartner,
  AppearanceEinstellungen,
  BackupEinstellungen,
  Benachrichtigung,
  Dokument,
  Firmendaten,
  Kunde,
  Notiz,
  Nummernkreise,
  Objekt,
  Positionsvorlage,
  Rechnung,
  SicherheitsEinstellungen,
  SmtpEinstellungen,
  Textvorlage,
} from "@/lib/api/types";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}

const NOW = new Date().toISOString();
const HEUTE = NOW.slice(0, 10);

function vorTagen(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function dateMinusTage(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function datePlusTage(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function seed() {
  const k1: Kunde = {
    id: uuid(),
    nummer: "K-2025-001",
    typ: "firma",
    firmenname: "Müller GmbH",
    vorname: "Stefan",
    nachname: "Müller",
    anrede: "herr",
    strasse: "Hauptstraße 12",
    plz: "10115",
    ort: "Berlin",
    land: "Deutschland",
    telefon: "+49 30 12345678",
    email: "kontakt@mueller-gmbh.de",
    webseite: "https://mueller-gmbh.de",
    ustId: "DE123456789",
    zahlungszielTage: 14,
    standardSteuersatz: 19,
    standardRabatt: 0,
    notizen: "Langjähriger A-Kunde, sehr zuverlässig.",
    tags: ["A-Kunde", "Region Nord"],
    status: "aktiv",
    archiviert: false,
    erstelltAm: vorTagen(120),
    geaendertAm: NOW,
  };
  const k2: Kunde = {
    id: uuid(),
    nummer: "K-2025-002",
    typ: "privat",
    vorname: "Anna",
    nachname: "Schmidt",
    anrede: "frau",
    strasse: "Lindenweg 4",
    plz: "20095",
    ort: "Hamburg",
    land: "Deutschland",
    telefon: "+49 40 987654",
    email: "anna.schmidt@example.com",
    zahlungszielTage: 14,
    standardSteuersatz: 19,
    standardRabatt: 0,
    tags: [],
    status: "aktiv",
    archiviert: false,
    erstelltAm: vorTagen(60),
    geaendertAm: NOW,
  };

  const ap1: Ansprechpartner = {
    id: uuid(),
    kundeId: k1.id,
    anrede: "frau",
    vorname: "Petra",
    nachname: "Weber",
    position: "Facility Managerin",
    telefon: "+49 30 12345679",
    email: "p.weber@mueller-gmbh.de",
    primaer: true,
  };

  const o1: Objekt = {
    id: uuid(),
    nummer: "OBJ-0001",
    kundeId: k1.id,
    name: "Bürohaus Hauptstraße",
    typ: "buero",
    strasse: "Hauptstraße 12",
    plz: "10115",
    ort: "Berlin",
    land: "Deutschland",
    qmGesamt: 1200,
    qmZuReinigen: 980,
    stockwerke: 4,
    raeume: 32,
    frequenz: "woechentlich",
    reinigungstage: ["mo", "mi", "fr"],
    uhrzeitVon: "18:00",
    uhrzeitBis: "22:00",
    zugangsinfo: "Schlüssel beim Pförtner. Code Alarm: 1234*.",
    ansprechpartnerVorOrtId: ap1.id,
    status: "aktiv",
    archiviert: false,
    erstelltAm: vorTagen(110),
    geaendertAm: NOW,
  };
  const o2: Objekt = {
    id: uuid(),
    nummer: "OBJ-0002",
    kundeId: k2.id,
    name: "Privatwohnung Lindenweg",
    typ: "wohnen",
    strasse: "Lindenweg 4",
    plz: "20095",
    ort: "Hamburg",
    qmGesamt: 95,
    qmZuReinigen: 95,
    stockwerke: 1,
    raeume: 4,
    frequenz: "14taegig",
    reinigungstage: ["di"],
    status: "aktiv",
    archiviert: false,
    erstelltAm: vorTagen(50),
    geaendertAm: NOW,
  };

  const a1: Angebot = {
    id: uuid(),
    nummer: "AN-2025-001",
    kundeId: k1.id,
    objektId: o1.id,
    titel: "Unterhaltsreinigung Bürohaus 2025",
    introText:
      "Sehr geehrte Frau Weber,\nvielen Dank für Ihre Anfrage. Wir freuen uns, Ihnen folgendes Angebot unterbreiten zu dürfen:",
    outroText:
      "Das Angebot ist 30 Tage gültig. Bei Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.",
    positionen: [
      {
        id: uuid(),
        beschreibung: "Unterhaltsreinigung Büroflächen",
        menge: 980,
        einheit: "m2",
        einzelpreisNetto: 0.85,
        steuersatz: 19,
        rabatt: 0,
      },
      {
        id: uuid(),
        beschreibung: "Sanitärreinigung pauschal",
        menge: 1,
        einheit: "pauschal",
        einzelpreisNetto: 120,
        steuersatz: 19,
        rabatt: 0,
      },
    ],
    rabattGesamt: 0,
    steuersatz: 19,
    gueltigBis: datePlusTage(30),
    status: "versendet",
    versendetAm: vorTagen(22),
    archiviert: false,
    erstelltAm: vorTagen(25),
    geaendertAm: vorTagen(22),
  };

  const r1: Rechnung = {
    id: uuid(),
    nummer: "RE-2025-001",
    kundeId: k1.id,
    objektId: o1.id,
    titel: "Reinigung Februar 2025",
    positionen: [
      {
        id: uuid(),
        beschreibung: "Unterhaltsreinigung Februar",
        menge: 1,
        einheit: "pauschal",
        einzelpreisNetto: 953,
        steuersatz: 19,
        rabatt: 0,
      },
    ],
    rabattGesamt: 0,
    steuersatz: 19,
    rechnungsdatum: dateMinusTage(45),
    faelligkeitsdatum: dateMinusTage(31),
    status: "versendet",
    versendetAm: vorTagen(45),
    archiviert: false,
    zahlungen: [],
    erstelltAm: vorTagen(45),
    geaendertAm: vorTagen(45),
  };
  const r2: Rechnung = {
    id: uuid(),
    nummer: "RE-2025-002",
    kundeId: k2.id,
    objektId: o2.id,
    titel: "Wohnungsreinigung März",
    positionen: [
      {
        id: uuid(),
        beschreibung: "Komplettreinigung Wohnung 95 m²",
        menge: 1,
        einheit: "pauschal",
        einzelpreisNetto: 180,
        steuersatz: 19,
        rabatt: 0,
      },
    ],
    rabattGesamt: 0,
    steuersatz: 19,
    rechnungsdatum: dateMinusTage(20),
    faelligkeitsdatum: datePlusTage(7),
    status: "versendet",
    versendetAm: vorTagen(20),
    archiviert: false,
    zahlungen: [
      {
        id: uuid(),
        rechnungId: "",
        datum: dateMinusTage(15),
        betrag: 100,
        methode: "ueberweisung",
        referenz: "Anzahlung",
      },
    ],
    erstelltAm: vorTagen(20),
    geaendertAm: vorTagen(15),
  };
  // Fix Rechnungs-ID-Verweis
  r2.zahlungen.forEach((z) => (z.rechnungId = r2.id));

  const dok1: Dokument = {
    id: uuid(),
    titel: "Reinigungsvertrag Müller GmbH",
    typ: "vertrag",
    kundeId: k1.id,
    objektId: o1.id,
    dateiname: "vertrag-mueller.pdf",
    mimeType: "application/pdf",
    groesseBytes: 245_000,
    url: "",
    dokumentdatum: dateMinusTage(120),
    steuerrelevant: false,
    hochgeladenAm: vorTagen(120),
  };

  const notiz1: Notiz = {
    id: uuid(),
    kundeId: k1.id,
    titel: "Telefonat mit Frau Weber",
    inhalt: "Möchte zusätzlich Glasreinigung 1× pro Quartal. Angebot vorbereiten.",
    erstelltAm: vorTagen(5),
  };

  const aktivitaeten: Aktivitaet[] = [
    {
      id: uuid(),
      zeitpunkt: vorTagen(0),
      typ: "system",
      beschreibung: "System bereit. Mock-Daten geladen.",
    },
    {
      id: uuid(),
      zeitpunkt: vorTagen(20),
      typ: "rechnung_versendet",
      beschreibung: "Rechnung RE-2025-002 an Anna Schmidt versendet",
      entitaet: { typ: "rechnung", id: r2.id },
    },
    {
      id: uuid(),
      zeitpunkt: vorTagen(22),
      typ: "angebot_versendet",
      beschreibung: "Angebot AN-2025-001 an Müller GmbH versendet",
      entitaet: { typ: "angebot", id: a1.id },
    },
  ];

  const benachrichtigungen: Benachrichtigung[] = [
    {
      id: uuid(),
      zeitpunkt: vorTagen(1),
      typ: "warnung",
      titel: "Rechnung überfällig",
      text: `Rechnung ${r1.nummer} ist seit 31 Tagen überfällig.`,
      link: { route: "/rechnungen/$id", params: { id: r1.id } },
      gelesen: false,
    },
    {
      id: uuid(),
      zeitpunkt: vorTagen(0),
      typ: "info",
      titel: "Willkommen",
      text: "MCC ist startklar. Mock-Daten wurden geladen.",
      gelesen: false,
    },
  ];

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

  return {
    unlocked: false,
    masterPasswort: "040506",
    kunden: [k1, k2],
    ansprechpartner: [ap1],
    objekte: [o1, o2],
    angebote: [a1],
    rechnungen: [r1, r2],
    dokumente: [dok1],
    notizen: [notiz1],
    aktivitaeten,
    benachrichtigungen,
    positionsvorlagen,
    textvorlagen,
    firmendaten,
    smtp,
    nummernkreise,
    sicherheit,
    appearance,
    backup,
    zaehler: { kunde: 2, objekt: 2, angebot: 1, rechnung: 2 },
  };
}

export type SeedDB = ReturnType<typeof seed>;

// Re-export für Konsistenz
export { HEUTE };
