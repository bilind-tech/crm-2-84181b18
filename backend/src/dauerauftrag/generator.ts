// Erzeugt aus einem Dauerauftrag + Periode eine echte Rechnung (im DB).
import { createRechnung, setRechnungDauerauftragId } from "../belege/rechnungen-repo.js";
import { getKunde } from "../kunden/repo.js";
import { getDatabase } from "../db/index.js";
import {
  createDauerauftrag,
  createLauf,
  findLauf,
  getDauerauftrag,
  listSonderpositionen,
  markSonderpositionenVerbraucht,
  type DauerauftragApi,
  type DauerauftragLaufApi,
  type DauerauftragPositionInput,
} from "./repo.js";
import { aktuellePeriode, isoDate, periodeBereich, periodeBezeichnung, stichtagFuerPeriode } from "./periode.js";

function fillTokens(template: string, da: DauerauftragApi, stichtag: Date): string {
  const b = periodeBereich(da.frequenz, stichtag);
  return template
    .replace(/\{\{lauf\.zeitraum\}\}/g, periodeBezeichnung(da.frequenz, stichtag))
    .replace(/\{\{lauf\.monat\}\}/g, periodeBezeichnung(da.frequenz, stichtag))
    .replace(/\{\{lauf\.von\}\}/g, isoDate(b.von))
    .replace(/\{\{lauf\.bis\}\}/g, isoDate(b.bis));
}

export interface SofortLaufResult {
  lauf: DauerauftragLaufApi;
  rechnungId: string;
  rechnungNummer: string;
  bereitsVorhanden: boolean;
}

/**
 * Führt einen Sofort-Lauf für `periode` aus (Default: aktuelle Periode der DA-Frequenz).
 * Idempotent: gibt es schon einen Lauf mit Rechnung für diese Periode, wird er zurückgegeben.
 */
export function fuehreSofortLaufAus(daId: string, periode?: string): SofortLaufResult | null {
  const da = getDauerauftrag(daId);
  if (!da) return null;

  const period = periode ?? aktuellePeriode(da.frequenz);
  const existierend = findLauf(daId, period);
  if (existierend && existierend.rechnungId) {
    return {
      lauf: existierend,
      rechnungId: existierend.rechnungId,
      rechnungNummer: "",
      bereitsVorhanden: true,
    };
  }

  const stichtag = stichtagFuerPeriode(da, period);
  const kunde = getKunde(da.kundeId);
  const sopos = listSonderpositionen(daId).filter(
    (s) => s.fuerPeriode === period && !s.verbrauchtAm,
  );

  const positionen: DauerauftragPositionInput[] = [
    ...da.positionen.map((p) => ({ ...p, id: undefined })),
    ...sopos.map((s) => ({ ...s.position, id: undefined })),
  ];

  const titel = fillTokens(da.bezeichnung, da, stichtag);
  const intro = fillTokens(da.textVorlage ?? "", da, stichtag);

  const rechnung = createRechnung({
    kundeId: da.kundeId,
    objektId: da.objektId ?? null,
    ansprechpartnerId: da.ansprechpartnerId ?? null,
    titel,
    introText: intro || undefined,
    rabattGesamt: da.rabattGesamt,
    steuersatz: da.steuersatz,
    rechnungsdatum: isoDate(stichtag),
    positionen,
    optionen: {
      materialBereitgestellt: false,
      standardAnschreiben: false,
      wiederkehrend: true,
    },
  });
  setRechnungDauerauftragId(rechnung.id, daId);
  markSonderpositionenVerbraucht(daId, period);

  const lauf = existierend
    ? (() => {
        // Bereits geplanter Lauf → mit Rechnung verknüpfen
        getDatabase().prepare(
          `UPDATE dauerauftrag_lauf SET rechnung_id = ?, ausgefuehrt_am = datetime('now'), status = 'erzeugt' WHERE id = ?`,
        ).run(rechnung.id, existierend.id);
        return findLauf(daId, period)!;
      })()
    : createLauf({
        dauerauftragId: daId,
        periode: period,
        geplantFuer: isoDate(stichtag),
        rechnungId: rechnung.id,
        status: "erzeugt",
      });

  return {
    lauf,
    rechnungId: rechnung.id,
    rechnungNummer: rechnung.nummer,
    bereitsVorhanden: false,
  };
}

/**
 * Legt aus einer bestehenden Rechnung (mit Flag wiederkehrend) einen Dauerauftrag an
 * und trägt diese Rechnung als ersten Lauf ein.
 */
export interface AnlageVorlage {
  rechnungId: string;
  kundeId: string;
  rechnungsdatum: string;
  bezeichnung: string;
  positionen: DauerauftragPositionInput[];
  rabattGesamt: number;
  steuersatz: number;
  frequenz?: "monatlich" | "quartalsweise" | "halbjaehrlich" | "jaehrlich";
  introText?: string;
  outroText?: string;
  objektId?: string | null;
  ansprechpartnerId?: string | null;
}

export function legeDauerauftragAusRechnungAn(v: AnlageVorlage): { id: string; nummer: string } | null {
  const stichtagDate = new Date(v.rechnungsdatum + "T00:00:00Z");
  const frequenz = v.frequenz ?? "monatlich";
  const da = createDauerauftrag({
    kundeId: v.kundeId,
    objektId: v.objektId ?? null,
    ansprechpartnerId: v.ansprechpartnerId ?? null,
    bezeichnung: v.bezeichnung || "Dauerauftrag",
    frequenz,
    stichtag: { typ: "monatstag", wert: stichtagDate.getUTCDate() },
    laufzeitVon: v.rechnungsdatum,
    positionen: v.positionen,
    rabattGesamt: v.rabattGesamt,
    steuersatz: v.steuersatz,
    betreffVorlage: "Rechnung {{lauf.zeitraum}}",
    textVorlage: v.introText ?? "",
    modus: "entwurf",
    status: "aktiv",
  });
  const periode = aktuellePeriode(frequenz, stichtagDate);
  createLauf({
    dauerauftragId: da.id,
    periode,
    geplantFuer: v.rechnungsdatum,
    rechnungId: v.rechnungId,
    status: "erzeugt",
  });
  setRechnungDauerauftragId(v.rechnungId, da.id);
  return { id: da.id, nummer: da.nummer };
}
