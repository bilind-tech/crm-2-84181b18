// Generator: aus einem fälligen DauerauftragLauf wird eine Rechnung erzeugt.
// Reine Funktion ohne Seiteneffekte — Persistierung passiert im Mock-Backend bzw. Pi.

import type {
  Dauerauftrag,
  DauerauftragSonderposition,
  ID,
  Kunde,
  Position,
  Rechnung,
} from "@/lib/api/types";
import { createClientId } from "@/lib/clientId";
import { isoDate, periodeBezeichnung, periodeBereich } from "./termine";

export interface RechnungEntwurfInput {
  da: Dauerauftrag;
  kunde?: Kunde;
  /** Stichtag des aktuellen Laufs (geplantFuer). */
  stichtag: Date;
  /** Sonderpositionen für diese Periode (werden eingehängt). */
  sonderpositionen: DauerauftragSonderposition[];
  /** Neue Rechnungs-ID + Nummer (kommt vom Backend). */
  rechnungId: ID;
  rechnungNummer: string;
  jetztIso: string;
}

function fillTokens(template: string, da: Dauerauftrag, stichtag: Date): string {
  const bereich = periodeBereich(da, stichtag);
  return template
    .replace(/\{\{lauf\.zeitraum\}\}/g, periodeBezeichnung(da, stichtag))
    .replace(/\{\{lauf\.monat\}\}/g, periodeBezeichnung(da, stichtag))
    .replace(/\{\{lauf\.von\}\}/g, isoDate(bereich.von))
    .replace(/\{\{lauf\.bis\}\}/g, isoDate(bereich.bis));
}

function uuidShort(): string {
  return createClientId("pos");
}

export function erzeugeRechnungAusLauf(input: RechnungEntwurfInput): Rechnung {
  const { da, kunde, stichtag, sonderpositionen, rechnungId, rechnungNummer, jetztIso } = input;

  // Positionen klonen (frische IDs!) + Sonderpositionen anhängen
  const positionen: Position[] = [
    ...da.positionen.map((p) => ({ ...p, id: uuidShort() })),
    ...sonderpositionen.map((sp) => ({ ...sp.position, id: uuidShort() })),
  ];

  const rechnungsdatum = isoDate(stichtag);
  const faellig = new Date(stichtag);
  faellig.setDate(faellig.getDate() + (kunde?.zahlungszielTage ?? 14));

  const titel = fillTokens(da.bezeichnung, da, stichtag);
  const intro = fillTokens(da.textVorlage ?? "", da, stichtag);

  return {
    id: rechnungId,
    nummer: rechnungNummer,
    kundeId: da.kundeId,
    objektId: da.objektId,
    ansprechpartnerId: da.ansprechpartnerId,
    titel,
    introText: intro || undefined,
    outroText: undefined,
    positionen,
    rabattGesamt: da.rabattGesamt,
    steuersatz: da.steuersatz,
    rechnungsdatum,
    faelligkeitsdatum: isoDate(faellig),
    notizen: da.notizen,
    status: da.modus === "vollautomatisch" ? "versendet" : "entwurf",
    versendetAm: da.modus === "vollautomatisch" ? jetztIso : undefined,
    archiviert: false,
    zahlungen: [],
    optionen: undefined,
    erstelltAm: jetztIso,
    geaendertAm: jetztIso,
  };
}

/** Hilfsfunktion für E-Mail-Betreff im Versand-Dialog. */
export function betreffFuerLauf(da: Dauerauftrag, stichtag: Date): string {
  return fillTokens(da.betreffVorlage || "Rechnung {{lauf.zeitraum}}", da, stichtag);
}
