// Mapping von Hotspot-Feld-IDs auf den passenden Tab und ein Anzeigelabel.
// Geometrie wird zur Laufzeit aus pdfmake gelesen (siehe hotspotTracker.ts) —
// hier nur noch UI-Metadaten + Fallback-Geometrie für den Notfall.

export type EditorTabId = "stammdaten" | "positionen" | "texte" | "logo";

export interface HotspotMeta {
  label: string;
  tab: EditorTabId;
  /** Feld-ID im EditorPanel (data-feld-id). */
  fieldId: string;
}

/** Statische Metadaten für bekannte Feld-IDs. Unbekannte (z.B. dynamische
 *  pos:<id>) werden zur Laufzeit ergänzt. */
export const FIELD_META: Record<string, HotspotMeta> = {
  logo:             { label: "Logo / Firma",       tab: "logo",       fieldId: "logo" },
  "firma.absender": { label: "Absenderzeile",      tab: "logo",       fieldId: "firma.absender" },
  "kunde":          { label: "Empfänger-Adresse",  tab: "stammdaten", fieldId: "kunde" },
  "meta":           { label: "Meta / Daten",       tab: "stammdaten", fieldId: "meta" },
  "titel":          { label: "Titel",              tab: "stammdaten", fieldId: "titel" },
  "anrede":         { label: "Anrede",             tab: "stammdaten", fieldId: "ansprechpartner" },
  "intro":          { label: "Einleitung",         tab: "texte",      fieldId: "intro" },
  "tabelle":        { label: "Positionen",         tab: "positionen", fieldId: "positionen" },
  "summe":          { label: "Summen / Steuer",    tab: "stammdaten", fieldId: "steuersatz" },
  "outro":          { label: "Schlusstext",        tab: "texte",      fieldId: "outro" },
};

export function metaForId(id: string): HotspotMeta {
  if (FIELD_META[id]) return FIELD_META[id];
  if (id.startsWith("pos:")) {
    return { label: "Position bearbeiten", tab: "positionen", fieldId: "positionen" };
  }
  return { label: "Bearbeiten", tab: "stammdaten", fieldId: id };
}

/** Fallback-Hotspots (prozentual), falls der Tracker keinerlei Treffer liefert. */
export interface FallbackHotspot {
  id: string;
  page: number;
  /** Prozentuale Box (0..1) relativ zur Seitengröße. */
  box: { x: number; y: number; w: number; h: number };
}

export const FALLBACK_HOTSPOTS_SEITE_1: FallbackHotspot[] = [
  { id: "logo",     page: 1, box: { x: 0.04, y: 0.02, w: 0.30, h: 0.07 } },
  { id: "firma.absender", page: 1, box: { x: 0.50, y: 0.03, w: 0.46, h: 0.05 } },
  { id: "kunde",    page: 1, box: { x: 0.04, y: 0.13, w: 0.45, h: 0.10 } },
  { id: "meta",     page: 1, box: { x: 0.55, y: 0.13, w: 0.41, h: 0.10 } },
  { id: "titel",    page: 1, box: { x: 0.04, y: 0.25, w: 0.92, h: 0.04 } },
  { id: "anrede",   page: 1, box: { x: 0.04, y: 0.31, w: 0.92, h: 0.03 } },
  { id: "intro",    page: 1, box: { x: 0.04, y: 0.35, w: 0.92, h: 0.07 } },
  { id: "tabelle",  page: 1, box: { x: 0.04, y: 0.43, w: 0.92, h: 0.30 } },
  { id: "summe",    page: 1, box: { x: 0.55, y: 0.74, w: 0.41, h: 0.09 } },
  { id: "outro",    page: 1, box: { x: 0.04, y: 0.84, w: 0.92, h: 0.07 } },
];
