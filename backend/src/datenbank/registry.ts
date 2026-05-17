// Zentrale Registry für die generische /datenbank-API.
// Definiert pro Tabelle:
//   - sqlTable: physischer Tabellenname
//   - label: deutscher Anzeigename
//   - listColumns: Spalten für die Listenansicht (in der Reihenfolge)
//   - searchColumns: Spalten, in denen die Volltext-Suche (LIKE) sucht
//   - dateColumn: Hauptdatum für from/to-Filter
//   - editable: Whitelist der per PATCH bearbeitbaren Spalten + Typ
//   - pdfDocumentIdColumn: optional — Spalte mit FK auf dokumente.id
//   - hasGeloeschtAm: ob die Tabelle bereits soft-delete-fähig ist
//
// "id"-Spalte ist immer Text-PK. Hart-Löschen kaskadiert über ON DELETE
// CASCADE/SET NULL aus dem Schema; zusätzliche manuelle Cleanups stehen
// in hardDeleteSql.

export type DbFieldType =
  | "text"
  | "longtext"
  | "number"
  | "boolean"
  | "date"
  | "datetime";

export interface DbFieldDef {
  column: string;
  label: string;
  type: DbFieldType;
}

export interface DbTableDef {
  key: string;                          // URL-Slug
  sqlTable: string;
  label: string;
  icon?: string;                        // lucide name (vom Frontend gerendert)
  listColumns: { column: string; label: string; type?: DbFieldType }[];
  searchColumns: string[];
  dateColumn?: string;
  kundeColumn?: string;                 // für Kunden-Filter
  editable: DbFieldDef[];
  pdfDocumentIdColumn?: string;
  hasGeloeschtAm: boolean;
  // SQL, das vor dem physischen DELETE läuft (alle Statements, ; getrennt).
  // Verfügbare Bind: :id
  hardDeleteExtra?: string[];
}

export const REGISTRY: DbTableDef[] = [
  {
    key: "kunde",
    sqlTable: "kunde",
    label: "Kunden",
    icon: "Users",
    listColumns: [
      { column: "nummer", label: "Nr." },
      { column: "firmenname", label: "Firma" },
      { column: "nachname", label: "Nachname" },
      { column: "vorname", label: "Vorname" },
      { column: "ort", label: "Ort" },
      { column: "status", label: "Status" },
      { column: "erstellt_am", label: "Erstellt", type: "datetime" },
    ],
    searchColumns: ["nummer", "firmenname", "nachname", "vorname", "email", "ort"],
    dateColumn: "erstellt_am",
    editable: [
      { column: "firmenname", label: "Firmenname", type: "text" },
      { column: "vorname", label: "Vorname", type: "text" },
      { column: "nachname", label: "Nachname", type: "text" },
      { column: "email", label: "E-Mail", type: "text" },
      { column: "telefon", label: "Telefon", type: "text" },
      { column: "strasse", label: "Straße", type: "text" },
      { column: "plz", label: "PLZ", type: "text" },
      { column: "ort", label: "Ort", type: "text" },
      { column: "kuerzel", label: "Kürzel", type: "text" },
      { column: "status", label: "Status", type: "text" },
    ],
    hasGeloeschtAm: true,
  },
  {
    key: "objekt",
    sqlTable: "objekt",
    label: "Objekte",
    icon: "Building2",
    listColumns: [
      { column: "nummer", label: "Nr." },
      { column: "name", label: "Name" },
      { column: "kunde_id", label: "Kunde" },
      { column: "ort", label: "Ort" },
      { column: "erstellt_am", label: "Erstellt", type: "datetime" },
    ],
    searchColumns: ["nummer", "name", "ort", "strasse"],
    dateColumn: "erstellt_am",
    kundeColumn: "kunde_id",
    editable: [
      { column: "name", label: "Name", type: "text" },
      { column: "strasse", label: "Straße", type: "text" },
      { column: "plz", label: "PLZ", type: "text" },
      { column: "ort", label: "Ort", type: "text" },
      { column: "notizen", label: "Notizen", type: "longtext" },
    ],
    hasGeloeschtAm: true,
  },
  {
    key: "ansprechpartner",
    sqlTable: "ansprechpartner",
    label: "Ansprechpartner",
    icon: "UserRound",
    listColumns: [
      { column: "nachname", label: "Nachname" },
      { column: "vorname", label: "Vorname" },
      { column: "kunde_id", label: "Kunde" },
      { column: "email", label: "E-Mail" },
      { column: "telefon", label: "Telefon" },
    ],
    searchColumns: ["nachname", "vorname", "email", "telefon"],
    kundeColumn: "kunde_id",
    editable: [
      { column: "vorname", label: "Vorname", type: "text" },
      { column: "nachname", label: "Nachname", type: "text" },
      { column: "email", label: "E-Mail", type: "text" },
      { column: "telefon", label: "Telefon", type: "text" },
      { column: "position", label: "Position", type: "text" },
      { column: "mobil", label: "Mobil", type: "text" },
      { column: "abteilung", label: "Abteilung", type: "text" },
      { column: "notiz", label: "Notiz", type: "longtext" },
    ],
    hasGeloeschtAm: true,
  },
  {
    key: "notiz",
    sqlTable: "notiz",
    label: "Notizen",
    icon: "StickyNote",
    listColumns: [
      { column: "text", label: "Inhalt" },
      { column: "kunde_id", label: "Kunde" },
      { column: "objekt_id", label: "Objekt" },
      { column: "erstellt_am", label: "Erstellt", type: "datetime" },
    ],
    searchColumns: ["text"],
    dateColumn: "erstellt_am",
    kundeColumn: "kunde_id",
    editable: [
      { column: "text", label: "Inhalt", type: "longtext" },
    ],
    hasGeloeschtAm: true,
  },
  {
    key: "angebot",
    sqlTable: "angebot",
    label: "Angebote",
    icon: "FileText",
    listColumns: [
      { column: "nummer", label: "Nr." },
      { column: "titel", label: "Titel" },
      { column: "kunde_id", label: "Kunde" },
      { column: "status", label: "Status" },
      { column: "geaendert_am", label: "Geändert", type: "datetime" },
    ],
    searchColumns: ["nummer", "titel"],
    dateColumn: "erstellt_am",
    kundeColumn: "kunde_id",
    editable: [
      { column: "titel", label: "Titel", type: "text" },
      { column: "intro_text", label: "Intro", type: "longtext" },
      { column: "outro_text", label: "Outro", type: "longtext" },
      { column: "notizen", label: "Notizen", type: "longtext" },
      { column: "status", label: "Status", type: "text" },
      { column: "gueltig_bis", label: "Gültig bis", type: "date" },
    ],
    hasGeloeschtAm: true,
    hardDeleteExtra: [
      "DELETE FROM email_versand WHERE beleg_art='angebot' AND beleg_id = :id",
      "DELETE FROM drive_upload_queue WHERE beleg_art='angebot' AND beleg_id = :id",
    ],
  },
  {
    key: "rechnung",
    sqlTable: "rechnung",
    label: "Rechnungen",
    icon: "Receipt",
    listColumns: [
      { column: "nummer", label: "Nr." },
      { column: "titel", label: "Titel" },
      { column: "kunde_id", label: "Kunde" },
      { column: "status", label: "Status" },
      { column: "rechnungsdatum", label: "Datum", type: "date" },
      { column: "geaendert_am", label: "Geändert", type: "datetime" },
    ],
    searchColumns: ["nummer", "titel"],
    dateColumn: "rechnungsdatum",
    kundeColumn: "kunde_id",
    editable: [
      { column: "titel", label: "Titel", type: "text" },
      { column: "intro_text", label: "Intro", type: "longtext" },
      { column: "outro_text", label: "Outro", type: "longtext" },
      { column: "notizen", label: "Notizen", type: "longtext" },
      { column: "status", label: "Status", type: "text" },
      { column: "rechnungsdatum", label: "Rechnungsdatum", type: "date" },
      { column: "faelligkeitsdatum", label: "Fällig am", type: "date" },
    ],
    hasGeloeschtAm: true,
    hardDeleteExtra: [
      "DELETE FROM email_versand WHERE beleg_art='rechnung' AND beleg_id = :id",
      "DELETE FROM drive_upload_queue WHERE beleg_art='rechnung' AND beleg_id = :id",
      "DELETE FROM mahn_lauf_eintraege WHERE rechnung_id = :id",
      "DELETE FROM zahlung WHERE rechnung_id = :id",
    ],
  },
  {
    key: "protokoll",
    sqlTable: "protokolle",
    label: "Protokolle",
    icon: "FileCheck2",
    listColumns: [
      { column: "nummer", label: "Nr." },
      { column: "kind", label: "Art" },
      { column: "kunde_id", label: "Kunde" },
      { column: "datum", label: "Datum", type: "date" },
      { column: "status", label: "Status" },
      { column: "erstellt_am", label: "Erstellt", type: "datetime" },
    ],
    searchColumns: ["nummer", "vertreter_ag", "vertreter_an"],
    dateColumn: "datum",
    kundeColumn: "kunde_id",
    editable: [
      { column: "datum", label: "Datum", type: "date" },
      { column: "uhrzeit", label: "Uhrzeit", type: "text" },
      { column: "vertreter_ag", label: "Vertreter Auftraggeber", type: "text" },
      { column: "vertreter_an", label: "Vertreter Auftragnehmer", type: "text" },
    ],
    pdfDocumentIdColumn: "dokument_id",
    hasGeloeschtAm: true,
  },
  {
    key: "dokument",
    sqlTable: "dokumente",
    label: "Dokumente",
    icon: "Paperclip",
    listColumns: [
      { column: "titel", label: "Titel" },
      { column: "typ", label: "Typ" },
      { column: "dateiname", label: "Datei" },
      { column: "kunde_id", label: "Kunde" },
      { column: "groesse_bytes", label: "Größe", type: "number" },
      { column: "erstellt_am", label: "Erstellt", type: "datetime" },
    ],
    searchColumns: ["titel", "dateiname"],
    dateColumn: "erstellt_am",
    kundeColumn: "kunde_id",
    editable: [
      { column: "titel", label: "Titel", type: "text" },
      { column: "typ", label: "Typ", type: "text" },
    ],
    // Eigene Spalte als "PDF-Quelle": Dokument selbst.
    pdfDocumentIdColumn: "id",
    hasGeloeschtAm: true,
  },
  {
    key: "steuer-posten",
    sqlTable: "steuer_manueller_posten",
    label: "Steuer-Posten",
    icon: "Calculator",
    listColumns: [
      { column: "titel", label: "Titel" },
      { column: "art", label: "Art" },
      { column: "geschaetzter_betrag", label: "Betrag (€)", type: "number" },
      { column: "faellig_am", label: "Fällig am", type: "date" },
      { column: "erstellt_am", label: "Erstellt", type: "datetime" },
    ],
    searchColumns: ["titel"],
    dateColumn: "faellig_am",
    editable: [
      { column: "titel", label: "Titel", type: "text" },
      { column: "geschaetzter_betrag", label: "Geschätzter Betrag (€)", type: "number" },
      { column: "faellig_am", label: "Fällig am", type: "date" },
      { column: "notiz", label: "Notiz", type: "longtext" },
    ],
    hasGeloeschtAm: true,
  },
];

export function findTable(key: string): DbTableDef | null {
  return REGISTRY.find((t) => t.key === key) ?? null;
}